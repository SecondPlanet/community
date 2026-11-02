import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  ChatService,
  MessageView,
  SessionSummary,
  AnswerResult,
  ChatStreamEvent,
} from './chat.service';
import { ChatCapabilityService, ChatCapability as ChatCapabilityView } from './chat-capability.service';
import { CreateSessionDto, SendMessageDto } from './chat.dto';

/**
 * 全站网页小助手 (RAG) — /api/v1/chat
 *
 * 复用 ChatSession / ChatMessage, lessonId=null 即 general scope.
 * 必须登录: 避免烧用户自己的 provider quota.
 */
@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    // v1.9-alpha.2 (batch-6 A-08): GET /chat/capabilities
    private readonly capability: ChatCapabilityService,
  ) {}

  @Post('sessions')
  @ApiOperation({ summary: '创建 ChatSession（general scope；课程 tutor 可传 lessonId/courseId 进入课程上下文）' })
  async createSession(
    @Request() req: { user: { userId: string; role: UserRole } },
    @Body() dto: CreateSessionDto,
  ): Promise<{ sessionId: string; title: string | null }> {
    // v1.9-alpha.1 (B-05): 课程 tutor 带 lessonId 创建 → listSessions(lessonId:null)
    // 自动排除,全站助手不再看到课程会话(UX-AUDIT C-11 session 污染)。
    // v1.9-alpha.2 (C-01): 课程上下文需访问控制, 传 role 给 CourseAccessPolicyService。
    // v1.9-alpha.2 (batch-5a P3-#4): 直接用 UserRole 类型, 不再 `as never` cast。
    return this.chatService.createSession(
      req.user.userId,
      dto.title,
      dto.lessonId,
      dto.courseId,
      req.user.role,
    );
  }

  // v1.9-alpha.2 (batch-6 A-08): 前端 useChatCapability() 探测 chat 是否可用
  // (BYOK 配置存在 + 当日额度未用完 → true)。不抛错, 只返回 {enabled, reason}。
  @Get('capabilities')
  @ApiOperation({
    summary: '查询当前用户 chat 能力: { enabled, reason?: NOT_CONFIGURED | BUDGET_DISABLED }',
  })
  async getCapabilities(
    @Request() req: { user: { userId: string } },
  ): Promise<ChatCapabilityView> {
    return this.capability.getChatCapability(req.user.userId);
  }

  @Get('sessions')
  @ApiOperation({ summary: '当前用户所有 general session' })
  async listSessions(
    @Request() req: { user: { userId: string } },
  ): Promise<SessionSummary[]> {
    return this.chatService.listSessions(req.user.userId);
  }

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: '拉取 session 全部消息' })
  async listMessages(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<MessageView[]> {
    return this.chatService.listMessages(req.user.userId, id);
  }

  // P2 quota 敏感: 1 req/sec 防止烧 token. Frank 的 Gemini key 42212 quota 紧.
  @Throttle({ short: { limit: 1, ttl: 1000 } })
  @Post('sessions/:id/messages')
  @HttpCode(200)
  @ApiOperation({ summary: '发消息, 走 RAG + Gemini, 返 assistant 回复 + 来源' })
  async sendMessage(
    // v1.9-alpha.2 (batch-6 P3-3): 透传 role 用于 prepareTurn 重查 hasFullContentAccess。
    @Request() req: { user: { userId: string; role: UserRole } },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<AnswerResult> {
    return this.chatService.answer(req.user.userId, id, dto.content, req.user.role);
  }

  // v1.9-alpha.2 (batch-5b C-02): SSE 流式版本, 与 sendMessage 同一套 throttle/校验/落库。
  // 手写 @Res: Nest 拦截器不会消费 StreamableFile 之外的 AsyncGenerator 响应。
  // X-Accel-Buffering: no — nginx 对该响应禁用 proxy buffering, 无需改 nginx 配置。
  private readonly logger = new Logger(ChatController.name);

  @Throttle({ short: { limit: 1, ttl: 1000 } })
  @Post('sessions/:id/messages/stream')
  @HttpCode(200)
  @ApiOperation({
    summary: '流式发消息 (SSE): event=delta|done|error, data 为 JSON',
  })
  async streamMessage(
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<void> {
    // 客户端断开 → 中止上游 fetch (partial 由 service 决定是否保存)。
    // v1.9-alpha.2 (batch-5b Claude acceptance B2): 在 Node 16+ 上, body-parser
    // 读完请求体后 req 已 destroyed, req.on('close') 可能不再触发; 而 res.on('close')
    // 在响应 close + 客户端断开时都会触发 (writableFinished=false 即为异常断开)。
    const abortController = new AbortController();
    const onResClose = () => {
      if (!res.writableFinished) abortController.abort();
    };
    res.on('close', onResClose);

    const sse = (evt: ChatStreamEvent) =>
      `event: ${evt.event}\ndata: ${JSON.stringify(evt)}\n\n`;

    const stream = this.chatService.streamAnswer(
      (req as unknown as { user: { userId: string; role: UserRole } }).user.userId,
      id,
      dto.content,
      abortController.signal,
      // v1.9-alpha.2 (batch-6 P3-3): 透传 role 用于每条消息重查课程访问权限。
      (req as unknown as { user: { userId: string; role: UserRole } }).user.role,
    );

    try {
      // 先取第一个事件再开流: prepareTurn 的 404/400 在 SSE 头发出前抛出,
      // 交给全局 exception filter 返回正常 HTTP 错误码。
      const first = await stream.next();
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      // nginx 按此头跳过 proxy_buffering; CDN 缓冲需部署时 curl -N 实测 (plan §5b)
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      if (!first.done) res.write(sse(first.value));
      for await (const evt of stream) {
        if (res.writableEnded) break;
        res.write(sse(evt));
      }
    } catch (err) {
      // 流已建立后才发生的意外错误: 以 error 事件兜底; 未开流时原样抛给 filter。
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.write(
            sse({
              event: 'error',
              code: 'AI_STREAM_FAILED',
              message: '流式回答中断',
              partialSaved: false,
            }),
          );
        }
      } else {
        res.off('close', onResClose);
        throw err;
      }
    } finally {
      res.off('close', onResClose);
      // v1.9-alpha.2 (batch-5b Claude acceptance B1): prepareTurn 抛 404/400 时,
      // 头未发出, 若此处仍 res.end() 会先把空 200 写下去, 再让全局 filter 试图
      // res.status(404).json() 时报 ERR_HTTP_HEADERS_SENT, 浏览器收不到错误码。
      // 因此未开流时不调 res.end(), 把响应留给 Nest exception filter。
      if (res.headersSent && !res.writableEnded) res.end();
    }
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除 session (硬删, ChatMessage 走 cascade)' })
  async deleteSession(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<void> {
    await this.chatService.deleteSession(req.user.userId, id);
  }
}
