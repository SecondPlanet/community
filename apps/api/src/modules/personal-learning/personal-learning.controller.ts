import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiPersonalCoursesEnabledGuard } from '../../common/guards/ai-personal-courses-enabled.guard';
import {
  CreateLessonVariantDto,
  GenerateLessonDto,
  SubmitAssessmentAttemptDto,
} from './personal-learning.dto';
import { PersonalLearningService } from './personal-learning.service';

interface AuthenticatedRequest {
  user: { userId: string; role: UserRole };
}

@ApiTags('personal-learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AiPersonalCoursesEnabledGuard)
@Controller('learning-projects/:projectId')
export class PersonalLearningController {
  constructor(private readonly service: PersonalLearningService) {}

  @Get('lessons/:lessonId/content')
  @ApiOperation({ summary: '读取 AI 个人课程教材内容' })
  getLessonContent(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.service.getLessonContent(projectId, lessonId, req.user);
  }

  @Post('lessons/:lessonId/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '生成或重新生成课时教材' })
  generateLesson(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('projectId') projectId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: GenerateLessonDto,
  ) {
    return this.service.generateLesson(projectId, lessonId, req.user, idempotencyKey, dto);
  }

  @Post('lessons/:lessonId/variants')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '创建课时局部 AI 讲解变体' })
  createVariant(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('projectId') projectId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateLessonVariantDto,
  ) {
    return this.service.createVariant(projectId, lessonId, req.user, idempotencyKey, dto);
  }

  @Post('lessons/:lessonId/assessments')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '创建或复用当前教材版本的课时测评' })
  createAssessment(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('projectId') projectId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.service.createAssessment(projectId, lessonId, req.user, idempotencyKey);
  }

  @Get('assessments/:assessmentId')
  @ApiOperation({ summary: '读取不含答案和 rubric 的课时测评' })
  getAssessment(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('assessmentId') assessmentId: string,
  ) {
    return this.service.getAssessment(projectId, assessmentId, req.user);
  }

  @Post('assessments/:assessmentId/attempts')
  @ApiOperation({ summary: '提交测评；纯选择题同步评分，主观题异步评分' })
  async submitAttempt(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('projectId') projectId: string,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: SubmitAssessmentAttemptDto,
  ) {
    const result = await this.service.submitAttempt(projectId, assessmentId, req.user, dto);
    response.status(result.status === 'completed' ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return result;
  }

  @Get('assessments/:assessmentId/attempts/:attemptId')
  @ApiOperation({ summary: '读取一次测评提交的评分状态或结果' })
  getAttempt(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('assessmentId') assessmentId: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.service.getAttempt(projectId, assessmentId, attemptId, req.user);
  }
}
