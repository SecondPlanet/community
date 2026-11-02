import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchCreateLearningEventDto, CreateLearningEventDto } from './learning-events.dto';
import { UserRole } from '@prisma/client';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';

@Injectable()
export class LearningEventsService {
  private readonly logger = new Logger(LearningEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessPolicyService,
  ) {}

  /**
   * 单条上报: 写一条 LearningEvent
   */
  async createOne(userId: string, dto: CreateLearningEventDto, role?: UserRole) {
    if (dto.lessonId) await this.assertLessonAccess(userId, dto.lessonId, role, true);
    return this.prisma.learningEvent.create({
      data: {
        userId,
        lessonId: dto.lessonId,
        eventType: dto.eventType,
        positionSec: dto.positionSec,
        durationMs: dto.durationMs,
        metadata: this.safeMetadata(dto.eventType, dto.metadata) as any,
      },
    });
  }

  /**
   * 批量上报: 前端每 30s flush 一次
   * 走 createMany + skipDuplicates(无 unique 约束时是普通 insert)
   */
  async createBatch(userId: string, dto: BatchCreateLearningEventDto, role?: UserRole) {
    const lessonIds = [...new Set(dto.events.flatMap((event) => event.lessonId ? [event.lessonId] : []))];
    await Promise.all(lessonIds.map((lessonId) => this.assertLessonAccess(userId, lessonId, role, true)));
    const data = dto.events.map((e) => ({
      userId,
      lessonId: e.lessonId,
      eventType: e.eventType,
      positionSec: e.positionSec,
      durationMs: e.durationMs,
      metadata: this.safeMetadata(e.eventType, e.metadata) as any,
    }));
    const result = await this.prisma.learningEvent.createMany({ data });
    this.logger.log(`user=${userId} batch=${result.count}`);
    return { count: result.count };
  }

  /**
   * 我的最近学习事件(分页)
   */
  async listMine(userId: string, limit = 50) {
    return this.prisma.learningEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      // P1-7: max 100 (从 200 收紧)
      take: Math.min(limit, 100),
    });
  }

  /**
   * v1.9-alpha.2 (batch-10 A-09): 取某用户某课时最近一条带 positionSec 的位置。
   * 用于"续播" — 切课时/打开页面时根据上次观看位置 seek。
   * 不校验访问权限(读侧权限校验成本 > 价值, 由调用方 owner check 决定)。
   */
  async getMyPositionForLesson(userId: string, lessonId: string): Promise<number | null> {
    const last = await this.prisma.learningEvent.findFirst({
      where: {
        userId,
        lessonId,
        positionSec: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { positionSec: true },
    });
    return last?.positionSec ?? null;
  }

  /**
   * 课时级事件(教师 / admin 用)
   */
  async listByLesson(userId: string, role: UserRole, lessonId: string, limit = 50) {
    await this.assertLessonAccess(userId, lessonId, role, false);
    return this.prisma.learningEvent.findMany({
      where: { lessonId },
      orderBy: { createdAt: 'desc' },
      // P1-7: max 100 (从 200 收紧)
      take: Math.min(limit, 100),
    });
  }

  private async assertLessonAccess(
    userId: string,
    lessonId: string,
    role: UserRole | undefined,
    learningAccess: boolean,
  ) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, deletedAt: null },
      select: {
        chapter: {
          select: {
            deletedAt: true,
            course: {
              select: {
                id: true,
                status: true,
                visibility: true,
                origin: true,
                ownerUserId: true,
                costType: true,
              },
            },
          },
        },
      },
    });
    if (!lesson || lesson.chapter.deletedAt) throw new NotFoundException('Lesson not found');
    if (learningAccess) {
      await this.courseAccess.assertCanLearn(lesson.chapter.course, { userId, role });
    } else {
      this.courseAccess.assertCanView(lesson.chapter.course, { userId, role });
    }
  }

  private safeMetadata(eventType: string, metadata?: Record<string, unknown>) {
    if (!metadata || !eventType.startsWith('personal_')) return metadata;
    const allowed = new Set([
      'projectId', 'jobId', 'planVersion', 'contentVersion', 'attemptId', 'action', 'nextStep',
    ]);
    const sanitized: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!allowed.has(key)) continue;
      if (typeof value === 'number' && Number.isFinite(value)) sanitized[key] = value;
      if (typeof value === 'string' && value.length <= 128) sanitized[key] = value;
    }
    return sanitized;
  }
}
