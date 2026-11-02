import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiPersonalCoursesEnabledGuard } from '../../common/guards/ai-personal-courses-enabled.guard';
import {
  ApproveCoursePlanDto,
  CreateLearningProjectDto,
  ListLearningProjectsDto,
  UpdateProjectActivityDto,
} from './learning-projects.dto';
import { LearningProjectsService } from './learning-projects.service';

interface AuthenticatedRequest {
  user: { userId: string; role: UserRole };
}

@ApiTags('learning-projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AiPersonalCoursesEnabledGuard)
@Controller('learning-projects')
export class LearningProjectsController {
  constructor(private readonly service: LearningProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '创建 AI 自建课程项目' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '客户端生成的 UUID v4' })
  @ApiResponse({
    status: 202,
    schema: { type: 'object', required: ['projectId', 'courseId', 'jobId', 'status'], properties: {
      projectId: { type: 'string', format: 'uuid' }, courseId: { type: 'string', format: 'uuid' },
      jobId: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['planning'] },
    } },
  })
  @ApiResponse({ status: 422, description: 'CONTENT_RESTRICTED（内容安全策略拒绝）' })
  @ApiResponse({ status: 429, description: 'BUDGET_EXCEEDED（预算不足）', schema: {
    type: 'object', required: ['statusCode', 'code', 'reason', 'retryAfter', 'message', 'timestamp'],
    properties: {
      statusCode: { type: 'integer', example: 429 }, code: { type: 'string', enum: ['BUDGET_EXCEEDED'] },
      reason: { type: 'string', enum: ['PLATFORM_BUDGET_DISABLED', 'PLATFORM_DAILY_COST', 'USER_DAILY_TOKENS', 'FEATURE_DAILY_COST'] },
      retryAfter: { type: 'integer', minimum: 0, maximum: 86400 }, message: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' },
    },
  } })
  create(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateLearningProjectDto,
  ) {
    return this.service.create(req.user.userId, idempotencyKey, dto);
  }

  @Get('me')
  @ApiOperation({ summary: '获取当前用户的 AI 学习项目' })
  listMine(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListLearningProjectsDto,
  ) {
    return this.service.listMine(req.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取 AI 学习项目详情' })
  getProject(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.getProject(id, req.user);
  }

  @Get(':projectId/jobs/:jobId')
  @ApiOperation({ summary: '获取 AI 生成任务状态' })
  @ApiResponse({ status: 200, description: '成功的 lesson_variant 任务包含 resultRef.variantContent；测评任务不返回答案键' })
  getJob(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.service.getJob(projectId, jobId, req.user);
  }

  @Post(':projectId/jobs/:jobId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '手动重试最终失败的 AI 生成任务' })
  retryJob(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.service.retryJob(projectId, jobId, req.user);
  }

  @Patch(':id/plan')
  @ApiOperation({ summary: '更新尚未批准的 AI 课程蓝图' })
  @ApiBody({ schema: {
    type: 'object', required: ['planVersion', 'title', 'chapters'], additionalProperties: false,
    properties: {
      planVersion: { type: 'integer', minimum: 1 }, title: { type: 'string' }, description: { type: 'string' },
      chapters: { type: 'array', items: { type: 'object' } },
    },
  } })
  patchPlan(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.patchPlan(id, req.user, body);
  }

  @Post(':id/plan/approve')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '批准课程蓝图并创建首课教材任务' })
  approvePlan(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ApproveCoursePlanDto,
  ) {
    return this.service.approvePlan(id, req.user, dto.planVersion);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '归档 AI 学习项目并取消未完成任务' })
  async archive(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.service.archive(id, req.user);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: '恢复已归档的 AI 学习项目' })
  restore(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.restore(id, req.user);
  }

  @Patch(':id/activity')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '单调更新 AI 课程阅读位置' })
  async updateActivity(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProjectActivityDto,
  ) {
    await this.service.updateActivity(id, req.user, dto);
  }
}
