import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ValidationPipe, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ChatController } from './chat.controller';
import { ChatCapabilityService } from './chat-capability.service';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SendMessageDto } from './chat.dto';
import { GUARDS_METADATA } from '@nestjs/common/constants';

/**
 * Controller 层覆盖:
 * - 401: JwtAuthGuard 在未登录时抛 UnauthorizedException
 * - 400: SendMessageDto 空 content 触发 class-validator
 * - 200: 已登录时 controller 直接 dispatch 到 ChatService.answer
 *
 * 因为项目没装 supertest, 用 Nest TestingModule + 直接 invoke controller 方法 +
 * ValidationPipe 模拟, 覆盖 3 个核心 case.
 */
describe('ChatController', () => {
  let controller: ChatController;
  let service: jest.Mocked<ChatService>;
  let reflector: Reflector;
  // v1.9-alpha.2 (batch-6 A-08): capability endpoint 用到的 service mock
  let capabilityMock: { getChatCapability: jest.Mock };

  beforeEach(async () => {
    const serviceMock: Partial<jest.Mocked<ChatService>> = {
      createSession: jest.fn(),
      listSessions: jest.fn(),
      listMessages: jest.fn(),
      deleteSession: jest.fn(),
      answer: jest.fn(),
    };
    capabilityMock = { getChatCapability: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'short', ttl: 1000, limit: 1 }])],
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: serviceMock },
        // v1.9-alpha.2 (batch-6 A-08): 通过 token, 而非 imported
        { provide: ChatCapabilityService, useValue: capabilityMock },
        Reflector,
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    service = module.get(ChatService) as jest.Mocked<ChatService>;
    reflector = module.get(Reflector);
  });

  it('case 401: JwtAuthGuard 挂在 controller 上, 且 user=undefined 时 handleRequest 抛 401', async () => {
    // 1) metadata 上确实挂了 JwtAuthGuard
    const guards = reflector.get<any[]>(GUARDS_METADATA, ChatController);
    expect(guards).toBeDefined();
    expect(guards!.some((g) => g === JwtAuthGuard || g?.name === 'JwtAuthGuard')).toBe(true);

    // 2) 实际 handleRequest 行为: user=undefined -> 抛 UnauthorizedException
    //    handleRequest 是同步 throw, 用 Promise.resolve 包一下让 rejects 能 match
    const guard = new JwtAuthGuard();
    await expect(Promise.resolve().then(() => (guard as any).handleRequest(null, undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('case 200: 登录后 sendMessage 调 service.answer, 返 answer + sources', async () => {
    service.answer.mockResolvedValue({
      userMsg: { id: 'm-1', role: 'user', content: 'q', createdAt: new Date() },
      assistantMsg: { id: 'm-2', role: 'assistant', content: 'a', createdAt: new Date() },
      sources: [{ type: 'course', id: 'c-1', title: 'RAG 实战', url: '/courses/c-1' }],
    });

    const result = await controller.sendMessage(
      { user: { userId: 'u-1', role: 'student' } },
      's-1',
      { content: 'RAG 是啥' },
    );

    expect(service.answer).toHaveBeenCalledWith('u-1', 's-1', 'RAG 是啥', 'student');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].type).toBe('course');
  });

  it('case 400: 空 content 被 class-validator 拒掉', async () => {
    // 真实 ValidationPipe 走一下, 确认 DTO 在框架层就被拒
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const dto = new SendMessageDto();
    // 不设 content, 应抛 BadRequestException
    await expect(pipe.transform(dto, { type: 'body', metatype: SendMessageDto } as any)).rejects.toThrow(
      BadRequestException,
    );
    // 服务没被调到
    expect(service.answer).not.toHaveBeenCalled();
  });

  it('createSession 不调 answer', async () => {
    service.createSession.mockResolvedValue({ sessionId: 's-1', title: 't' });
    const r = await controller.createSession({ user: { userId: 'u-1', role: 'student' } }, { title: 't' });
    expect(r.sessionId).toBe('s-1');
    expect(service.answer).not.toHaveBeenCalled();
  });

  // v1.9-alpha.1 (B-05) + v1.9-alpha.2 (C-01): DTO 的 lessonId/courseId 与
  // req.user.role 全部透传给 service (课程 tutor 上下文 + 访问控制)。
  it('createSession 透传 lessonId/courseId/role', async () => {
    service.createSession.mockResolvedValue({ sessionId: 's-2', title: null });
    await controller.createSession(
      { user: { userId: 'u-1', role: 'student' } },
      { lessonId: 'lesson-1', courseId: 'course-1' },
    );
    expect(service.createSession).toHaveBeenCalledWith('u-1', undefined, 'lesson-1', 'course-1', 'student');
  });

  // v1.9-alpha.2 (batch-6 A-08): GET /chat/capabilities 透传 userId, 不抛错。
  it('getCapabilities: enabled=true 时直接返回 enabled shape', async () => {
    capabilityMock.getChatCapability.mockResolvedValue({ enabled: true });
    const cap = await controller.getCapabilities({ user: { userId: 'u-1' } });
    expect(cap).toEqual({ enabled: true });
    expect(capabilityMock.getChatCapability).toHaveBeenCalledWith('u-1');
  });

  it('getCapabilities: BUDGET_DISABLED 返回 reason, 不抛错', async () => {
    capabilityMock.getChatCapability.mockResolvedValue({
      enabled: false,
      reason: 'BUDGET_DISABLED',
    });
    const cap = await controller.getCapabilities({ user: { userId: 'u-1' } });
    expect(cap).toEqual({ enabled: false, reason: 'BUDGET_DISABLED' });
  });

  // v1.9-alpha.2 (batch-5b C-02): SSE 流式 endpoint
  describe('streamMessage (SSE)', () => {
    function makeRes(opts: { writableFinished?: boolean } = {}) {
      const writes: string[] = [];
      const headers: Record<string, string> = {};
      const listeners: Record<string, (() => void)[]> = {};
      return {
        writes,
        headers,
        headersSent: false,
        writableEnded: false,
        writableFinished: opts.writableFinished ?? false,
        setHeader(k: string, v: string) {
          headers[k] = v;
        },
        flushHeaders() {
          this.headersSent = true;
        },
        write(chunk: string) {
          writes.push(chunk);
          return true;
        },
        end() {
          this.writableEnded = true;
          this.writableFinished = true;
        },
        on(evt: string, fn: () => void) {
          (listeners[evt] ??= []).push(fn);
          return this;
        },
        off(evt: string, fn: () => void) {
          listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
          return this;
        },
        __emit(evt: string) {
          for (const fn of listeners[evt] ?? []) fn();
        },
      } as any;
    }
    function makeReq() {
      const listeners: Record<string, (() => void)[]> = {};
      return {
        on(evt: string, fn: () => void) {
          (listeners[evt] ??= []).push(fn);
          return this;
        },
        off(evt: string, fn: () => void) {
          listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
          return this;
        },
        __emit(evt: string) {
          for (const fn of listeners[evt] ?? []) fn();
        },
        user: { userId: 'u-1', role: 'student' as any },
      } as any;
    }
    function genOf(events: unknown[]): AsyncGenerator<unknown> {
      return (async function* () {
        for (const e of events) yield e;
      })();
    }

    it('SSE 头 + delta/done 帧按 event:/data: 协议写出', async () => {
      const req = makeReq();
      const res = makeRes();
      service.streamAnswer = jest.fn().mockReturnValue(
        genOf([
          { event: 'delta', text: '你好' },
          {
            event: 'done',
            userMsgId: 'm-1',
            assistantMsgId: 'm-2',
            content: '你好',
            sources: [],
            partial: false,
          },
        ]),
      ) as any;

      await controller.streamMessage(req, res, 's-1', { content: 'q' });

      expect(res.headers['Content-Type']).toContain('text/event-stream');
      expect(res.headers['X-Accel-Buffering']).toBe('no');
      expect(res.writes).toEqual([
        'event: delta\ndata: {"event":"delta","text":"你好"}\n\n',
        'event: done\ndata: {"event":"done","userMsgId":"m-1","assistantMsgId":"m-2","content":"你好","sources":[],"partial":false}\n\n',
      ]);
      expect(res.writableEnded).toBe(true);
      // 透传 userId + content + signal
      expect(service.streamAnswer).toHaveBeenCalledWith('u-1', 's-1', 'q', expect.any(AbortSignal), 'student');
    });

    it('prepareTurn 404 (首个 next 抛错, 未开流) → 原样抛给 exception filter, 不发空 200', async () => {
      const req = makeReq();
      const res = makeRes();
      service.streamAnswer = jest.fn().mockReturnValue(
        (async function* () {
          throw new (require('@nestjs/common').NotFoundException)('会话不存在');
        })(),
      ) as any;

      await expect(controller.streamMessage(req, res, 's-bad', { content: 'q' })).rejects.toThrow('会话不存在');
      // v1.9-alpha.2 (batch-5b B1): 未开流时不调 res.end(), 否则会先空 200 再让
      // 全局 filter 抛 ERR_HTTP_HEADERS_SENT, 浏览器收不到错误码。
      expect(res.headersSent).toBe(false);
      expect(res.writes).toHaveLength(0);
      expect(res.writableEnded).toBe(false);
    });

    it('流中途异常 (已开流) → 写 error 帧 + 正常 end, 不抛', async () => {
      const req = makeReq();
      const res = makeRes();
      service.streamAnswer = jest.fn().mockReturnValue(
        (async function* () {
          yield { event: 'delta', text: 'a' };
          throw new Error('upstream boom');
        })(),
      ) as any;

      await expect(controller.streamMessage(req, res, 's-1', { content: 'q' })).resolves.toBeUndefined();

      expect(res.headersSent).toBe(true);
      expect(res.writes[0]).toContain('"event":"delta"');
      expect(res.writes[1]).toContain('"event":"error"');
      expect(res.writes[1]).toContain('"code":"AI_STREAM_FAILED"');
      expect(res.writableEnded).toBe(true);
    });

    // v1.9-alpha.2 (batch-5b B2): Node 16+ body-parser 后 req.close 可能不再触发,
    // 改监听 res.on('close'), 并以 writableFinished 区分异常 vs 正常结束。
    it('客户端断开 (res close + writableFinished=false) → AbortSignal 被 abort', async () => {
      const req = makeReq();
      const res = makeRes(); // writableFinished 默认 false
      let captured: AbortSignal | undefined;
      service.streamAnswer = jest.fn().mockImplementation(
        (_u: string, _s: string, _c: string, signal: AbortSignal) => {
          captured = signal;
          return (async function* () {
            yield { event: 'delta', text: 'x' };
            // 模拟客户端断开: writableFinished 仍 false
            res.__emit('close');
            yield { event: 'done', userMsgId: 'm-1', assistantMsgId: 'm-2', content: 'x', sources: [], partial: false };
          })();
        },
      ) as any;

      await controller.streamMessage(req, res, 's-1', { content: 'q' });
      expect(captured?.aborted).toBe(true);
    });

    it('正常 res.end() (writableFinished=true) → AbortSignal 不被 abort', async () => {
      const req = makeReq();
      const res = makeRes({ writableFinished: true });
      let captured: AbortSignal | undefined;
      service.streamAnswer = jest.fn().mockImplementation(
        (_u: string, _s: string, _c: string, signal: AbortSignal) => {
          captured = signal;
          return genOf([
            { event: 'delta', text: 'x' },
            { event: 'done', userMsgId: 'm-1', assistantMsgId: 'm-2', content: 'x', sources: [], partial: false },
          ]);
        },
      ) as any;

      await controller.streamMessage(req, res, 's-1', { content: 'q' });
      res.__emit('close'); // writableFinished=true → 不应 abort
      expect(captured?.aborted).toBe(false);
    });
  });
});
