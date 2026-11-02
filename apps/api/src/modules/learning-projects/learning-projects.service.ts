import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiEnqueueStatus,
  AiJobStatus,
  AiJobType,
  CourseLevel,
  CourseOrigin,
  CourseStatus,
  CourseType,
  CourseVisibility,
  CostType,
  LessonContentStatus,
  LearningProjectStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { isUUID } from 'class-validator';
import {
  ProjectAccessPolicyService,
  ProjectPrincipal,
} from '../../common/project-access/project-access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContentSafetyPolicyService } from '../../common/content-safety/content-safety-policy.service';
import { recordPersonalLearningEvent } from '../../common/personal-learning-telemetry';
import { AiJobQueue } from '../ai-jobs/ai-job-queue';
import {
  CreateLearningProjectDto,
  ListLearningProjectsDto,
  UpdateProjectActivityDto,
} from './learning-projects.dto';
import {
  EditableCoursePlan,
  EditableCoursePlanSchema,
  NormalizedLearningPreferences,
  ProjectCursor,
} from './learning-projects.schemas';

const PROJECT_LIST_SELECT = {
  id: true,
  userId: true,
  courseId: true,
  seedText: true,
  learningGoal: true,
  targetLevel: true,
  availableMinutes: true,
  preferences: true,
  planSnapshot: true,
  status: true,
  progressPercent: true,
  activeBlockId: true,
  activeBlockOffset: true,
  lastAccessedAt: true,
  planVersion: true,
  planApprovedAt: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LearningProjectSelect;

@Injectable()
export class LearningProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessPolicyService,
    private readonly jobQueue: AiJobQueue,
    private readonly contentSafety: ContentSafetyPolicyService,
  ) {}

  async create(
    userId: string,
    idempotencyKey: string | undefined,
    dto: CreateLearningProjectDto,
  ) {
    if (!idempotencyKey || !isUUID(idempotencyKey, '4')) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    }
    const preferences = this.normalizePreferences(dto);
    const question = dto.question.trim();
    await this.contentSafety.assertAllowed(question);
    const inputHash = this.hashInput({
      question,
      targetLevel: dto.targetLevel ?? null,
      availableMinutes: dto.availableMinutes ?? null,
      preferences,
    });
    const replay = await this.findCreateReplay(userId, idempotencyKey, inputHash);
    if (replay) return replay;
    const requestKey = `${userId}:course_plan:${idempotencyKey}`;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const course = await tx.course.create({
          data: {
            title: `正在创建：${question.slice(0, 48)}`,
            description: question,
            learningPoints: '课程蓝图生成中',
            instructor: 'AI 学习导师',
            level: dto.targetLevel ?? CourseLevel.Beginner,
            duration: dto.availableMinutes ? `${dto.availableMinutes} 分钟` : '待生成',
            thumbnail: '',
            tags: 'AI自建课程',
            costType: CostType.free,
            price: 0,
            status: CourseStatus.draft,
            courseType: CourseType.own,
            origin: CourseOrigin.ai_personal,
            visibility: CourseVisibility.private,
            ownerUserId: userId,
          },
          select: { id: true },
        });

        const project = await tx.learningProject.create({
          data: {
            userId,
            courseId: course.id,
            createRequestKey: idempotencyKey,
            seedText: question,
            targetLevel: dto.targetLevel,
            availableMinutes: dto.availableMinutes,
            preferences: preferences as unknown as Prisma.InputJsonValue,
            status: LearningProjectStatus.planning,
            currentStep: '正在规划课程',
          },
          select: { id: true },
        });

        await tx.enrollment.create({
          data: {
            userId,
            courseId: course.id,
            source: 'direct',
          },
        });

        const job = await tx.aiGenerationJob.create({
          data: {
            userId,
            projectId: project.id,
            type: AiJobType.course_plan,
            status: AiJobStatus.queued,
            enqueueStatus: AiEnqueueStatus.pending,
            requestKey,
            executionNo: 1,
            inputHash,
            progress: 0,
            currentStep: '正在规划课程',
          },
          select: { id: true },
        });

        await recordPersonalLearningEvent(tx, {
          userId,
          eventType: 'personal_course_created',
          projectId: project.id,
          jobId: job.id,
        });

        return {
          projectId: project.id,
          courseId: course.id,
          jobId: job.id,
          status: 'planning' as const,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return created;
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const concurrentReplay = await this.findCreateReplay(userId, idempotencyKey, inputHash);
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  async listMine(userId: string, query: ListLearningProjectsDto) {
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const limit = query.limit ?? 20;
    const projects = await this.prisma.learningProject.findMany({
      where: {
        userId,
        status: query.archived
          ? LearningProjectStatus.archived
          : { not: LearningProjectStatus.archived },
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: new Date(cursor.updatedAt) } },
                {
                  updatedAt: new Date(cursor.updatedAt),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      select: this.projectViewSelect(userId),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = projects.length > limit;
    const page = hasMore ? projects.slice(0, limit) : projects;
    const last = page.at(-1);
    return {
      items: page.map((project) => this.toListItem(project)),
      nextCursor: hasMore && last
        ? this.encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
        : null,
    };
  }

  async getProject(id: string, principal: ProjectPrincipal) {
    const subject = await this.findProjectSubject(id);
    this.projectAccess.assertCanAccess(subject, principal);
    const project = await this.prisma.learningProject.findUnique({
      where: { id },
      select: this.projectViewSelect(subject.userId),
    });
    if (!project) throw new NotFoundException('Learning project not found');
    return this.toDetail(project);
  }

  async patchPlan(id: string, principal: ProjectPrincipal, input: unknown) {
    await this.prisma.$transaction(async (tx) => {
      const project = await tx.learningProject.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          courseId: true,
          status: true,
          planVersion: true,
          planApprovedAt: true,
        },
      });
      if (!project) throw new NotFoundException('Learning project not found');
      this.projectAccess.assertCanAccess(project, principal);
      const plan = this.parseEditablePlan(input);

      const updated = await tx.learningProject.updateMany({
        where: {
          id,
          status: LearningProjectStatus.plan_ready,
          planVersion: plan.planVersion,
          planApprovedAt: null,
        },
        data: {
          planSnapshot: this.planSnapshot(plan) as unknown as Prisma.InputJsonValue,
          preferences: plan.preferences as unknown as Prisma.InputJsonValue,
          targetLevel: plan.level,
          planVersion: { increment: 1 },
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Course plan version or state changed');
      }
      await tx.course.update({
        where: { id: project.courseId },
        data: this.courseMetadata(plan),
      });
    });
    return this.getProject(id, principal);
  }

  async approvePlan(id: string, principal: ProjectPrincipal, planVersion: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.learningProject.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          courseId: true,
          status: true,
          planVersion: true,
          planSnapshot: true,
          preferences: true,
          planApprovedAt: true,
          activeLessonId: true,
        },
      });
      if (!project) throw new NotFoundException('Learning project not found');
      this.projectAccess.assertCanAccess(project, principal);
      if (project.planVersion !== planVersion) {
        throw new ConflictException('Course plan version changed');
      }
      if (project.planApprovedAt) {
        return { response: await this.approvedResponse(tx, project) };
      }
      if (project.status !== LearningProjectStatus.plan_ready) {
        throw new ConflictException('Course plan is not ready for approval');
      }

      const plan = this.parseStoredPlan(
        project.planSnapshot,
        project.preferences,
        project.planVersion,
      );
      const claimed = await tx.learningProject.updateMany({
        where: {
          id,
          status: LearningProjectStatus.plan_ready,
          planVersion,
          planApprovedAt: null,
        },
        data: {
          status: LearningProjectStatus.generating_first_lesson,
          planApprovedAt: new Date(),
          activeLessonId: null,
          currentStep: '正在生成第一课教材',
          progressPercent: 0,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Course plan was already approved');
      }

      const existingProgress = await tx.progressRecord.count({
        where: { courseId: project.courseId },
      });
      if (existingProgress > 0) {
        throw new ConflictException('A course with learning progress cannot be rematerialized');
      }

      await tx.course.update({
        where: { id: project.courseId },
        data: this.courseMetadata(plan),
      });
      const firstLessonId = await this.materializePlan(tx, project.courseId, plan);
      await tx.lessonContent.update({
        where: { lessonId: firstLessonId },
        data: { status: LessonContentStatus.queued },
      });

      const requestKey = `${project.userId}:lesson_content:${project.id}:${firstLessonId}:v1`;
      const job = await tx.aiGenerationJob.create({
        data: {
          userId: project.userId,
          projectId: project.id,
          lessonId: firstLessonId,
          type: AiJobType.lesson_content,
          status: AiJobStatus.queued,
          enqueueStatus: AiEnqueueStatus.pending,
          requestKey,
          executionNo: 1,
          inputHash: this.hashInput({
            projectId: project.id,
            lessonId: firstLessonId,
            planVersion,
            plan: this.planSnapshot(plan),
          }),
          targetVersion: 1,
          progress: 0,
          currentStep: '正在生成第一课教材',
        },
        select: { id: true },
      });
      await tx.learningProject.update({
        where: { id },
        data: { activeLessonId: firstLessonId },
      });
      await recordPersonalLearningEvent(tx, {
        userId: project.userId,
        eventType: 'personal_course_plan_approved',
        lessonId: firstLessonId,
        projectId: project.id,
        jobId: job.id,
        planVersion,
      });
      await recordPersonalLearningEvent(tx, {
        userId: project.userId,
        eventType: 'personal_lesson_generation_started',
        lessonId: firstLessonId,
        projectId: project.id,
        jobId: job.id,
        planVersion,
      });

      return { response: this.approveResponse(project.id, project.courseId, firstLessonId, job.id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return result.response;
  }

  async getJob(projectId: string, jobId: string, principal: ProjectPrincipal) {
    const job = await this.prisma.aiGenerationJob.findFirst({
      where: { id: jobId, projectId },
      include: { project: { select: { id: true, userId: true } } },
    });
    if (!job) throw new NotFoundException('AI generation job not found');
    this.projectAccess.assertCanAccess(job.project, principal);

    if (job.status === AiJobStatus.queued || job.status === AiJobStatus.running) {
      return {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        retryable: false as const,
        errorCode: null,
      };
    }
    if (job.status === AiJobStatus.succeeded) {
      return {
        id: job.id,
        type: job.type,
        status: AiJobStatus.succeeded,
        resultRef: this.resultRef(job.resultRef, projectId),
      };
    }
    if (job.status === AiJobStatus.failed) {
      return {
        id: job.id,
        type: job.type,
        status: AiJobStatus.failed,
        errorCode: job.errorCode ?? 'AI_JOB_FAILED',
        errorMessage: job.errorMessage ?? 'AI generation failed',
        retryable: this.isJobRetryable(job.errorCode, job.manualRetries),
        manualRetries: job.manualRetries,
      };
    }
    return {
      id: job.id,
      type: job.type,
      status: AiJobStatus.cancelled,
    };
  }

  async retryJob(
    projectId: string,
    jobId: string,
    principal: ProjectPrincipal,
    contentionAttempt = 0,
  ): Promise<Awaited<ReturnType<LearningProjectsService['getJob']>>> {
    const original = await this.prisma.aiGenerationJob.findFirst({
      where: { id: jobId, projectId },
      include: { project: { select: { id: true, userId: true, status: true } } },
    });
    if (!original) throw new NotFoundException('AI generation job not found');
    this.projectAccess.assertCanAccess(original.project, principal);
    if (original.status !== AiJobStatus.failed || !this.isJobRetryable(original.errorCode, original.manualRetries)) {
      throw new ConflictException('AI generation job is not retryable');
    }
    if (original.project.status === LearningProjectStatus.archived) {
      throw new ConflictException('Archived learning projects are read-only');
    }
    const executionNo = original.executionNo + 1;
    const existing = await this.prisma.aiGenerationJob.findUnique({
      where: { requestKey_executionNo: { requestKey: original.requestKey, executionNo } },
    });
    if (existing) return this.getJob(projectId, existing.id, principal);

    const runRetryTransaction = () => this.prisma.$transaction(async (tx) => {
      const current = await tx.aiGenerationJob.findUnique({ where: { id: original.id } });
      if (!current || current.status !== AiJobStatus.failed || current.manualRetries !== original.manualRetries) {
        throw new ConflictException('AI generation job retry state changed');
      }
      const job = await tx.aiGenerationJob.create({
        data: {
          userId: original.userId,
          projectId,
          lessonId: original.lessonId,
          attemptId: original.attemptId,
          parentJobId: original.id,
          type: original.type,
          status: AiJobStatus.queued,
          enqueueStatus: AiEnqueueStatus.pending,
          requestKey: original.requestKey,
          executionNo,
          inputHash: original.inputHash,
          targetVersion: original.targetVersion,
          manualRetries: original.manualRetries + 1,
          currentStep: '正在重新尝试',
        },
      });
      if (original.type === AiJobType.lesson_variant) {
        const relinked = await tx.lessonVariant.updateMany({
          where: { jobId: original.id, content: { equals: Prisma.DbNull } },
          data: { jobId: job.id },
        });
        if (relinked.count !== 1) {
          throw new ConflictException('Lesson variant retry target changed');
        }
      }
      if (original.type === AiJobType.course_plan) {
        await tx.learningProject.updateMany({
          where: { id: projectId, status: LearningProjectStatus.failed },
          data: { status: LearningProjectStatus.planning, currentStep: '正在重新规划课程', lastErrorCode: null, lastErrorMessage: null },
        });
      } else if (original.type === AiJobType.lesson_content && original.project.status === LearningProjectStatus.failed) {
        await tx.learningProject.updateMany({
          where: { id: projectId, status: LearningProjectStatus.failed },
          data: { status: LearningProjectStatus.generating_first_lesson, currentStep: '正在重新生成第一节', lastErrorCode: null, lastErrorMessage: null },
        });
      }
      return { jobId: job.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let created: Awaited<ReturnType<typeof runRetryTransaction>>;
    try {
      created = await runRetryTransaction();
    } catch (error) {
      const isContention = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034');
      if (!isContention) throw error;
      const replay = await this.prisma.aiGenerationJob.findUnique({
        where: { requestKey_executionNo: { requestKey: original.requestKey, executionNo } },
      });
      if (replay) return this.getJob(projectId, replay.id, principal);
      if (contentionAttempt < 2) {
        return this.retryJob(projectId, jobId, principal, contentionAttempt + 1);
      }
      throw new ConflictException('AI generation job retry is busy; retry the request');
    }
    return this.getJob(projectId, created.jobId, principal);
  }

  async archive(id: string, principal: ProjectPrincipal): Promise<void> {
    const now = new Date();
    const removableJobIds = await this.prisma.$transaction(async (tx) => {
      const project = await tx.learningProject.findUnique({
        where: { id },
        select: { id: true, userId: true, status: true },
      });
      if (!project) throw new NotFoundException('Learning project not found');
      this.projectAccess.assertCanAccess(project, principal);
      if (project.status === LearningProjectStatus.completed) {
        throw new ConflictException('Completed projects cannot be archived');
      }
      if (project.status === LearningProjectStatus.archived) return [] as string[];

      await tx.learningProject.update({
        where: { id },
        data: {
          status: LearningProjectStatus.archived,
          archivedAt: now,
          currentStep: null,
        },
      });

      const removableJobs = await tx.aiGenerationJob.findMany({
        where: {
          projectId: id,
          OR: [
            { status: AiJobStatus.queued },
            { status: AiJobStatus.running, providerRequestStartedAt: null },
          ],
        },
        select: { id: true },
      });
      const cancelImmediately = {
        status: AiJobStatus.cancelled,
        enqueueStatus: AiEnqueueStatus.cancelled,
        cancelRequestedAt: now,
        finishedAt: now,
        enqueueLeaseOwner: null,
        enqueueLeaseExpiresAt: null,
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        heartbeatAt: null,
      } as const;
      await tx.aiGenerationJob.updateMany({
        where: {
          projectId: id,
          OR: [
            { status: AiJobStatus.queued },
            {
              status: AiJobStatus.running,
              providerRequestStartedAt: null,
            },
          ],
        },
        data: cancelImmediately,
      });
      await tx.aiGenerationJob.updateMany({
        where: {
          projectId: id,
          status: AiJobStatus.running,
          providerRequestStartedAt: { not: null },
        },
        data: {
          enqueueStatus: AiEnqueueStatus.cancelled,
          cancelRequestedAt: now,
          // Keep the execution running until the provider boundary checkpoints
          // and settles the real usage. The runner sees cancelRequestedAt,
          // discards the generated content, and then makes the job terminal.
        },
      });
      return removableJobs.map((job) => job.id);
    });
    await Promise.allSettled(removableJobIds.map((jobId) => this.jobQueue.remove(jobId)));
  }

  async restore(id: string, principal: ProjectPrincipal) {
    await this.prisma.$transaction(async (tx) => {
      const project = await tx.learningProject.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          status: true,
          planSnapshot: true,
          planApprovedAt: true,
          activeLessonId: true,
          progressPercent: true,
        },
      });
      if (!project) throw new NotFoundException('Learning project not found');
      this.projectAccess.assertCanAccess(project, principal);
      if (project.status !== LearningProjectStatus.archived) {
        throw new ConflictException('Learning project is not archived');
      }
      await tx.learningProject.update({
        where: { id },
        data: {
          status: this.restoreStatus(project),
          archivedAt: null,
          currentStep: null,
        },
      });
    });
    return this.getProject(id, principal);
  }

  async updateActivity(
    id: string,
    principal: ProjectPrincipal,
    dto: UpdateProjectActivityDto,
  ): Promise<void> {
    const project = await this.findProjectSubject(id);
    this.projectAccess.assertCanAccess(project, principal);
    if (project.status === LearningProjectStatus.archived) {
      throw new ConflictException('Archived projects cannot accept activity');
    }

    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: dto.lessonId,
        deletedAt: null,
        chapter: { courseId: project.courseId, deletedAt: null },
      },
      select: {
        id: true,
        content: { select: { blocks: true } },
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const blockExists = dto.blockId
      ? this.hasBlock(lesson.content?.blocks, dto.blockId)
      : false;
    const occurredAt = new Date(dto.occurredAt);
    await this.prisma.learningProject.updateMany({
      where: {
        id,
        OR: [
          { lastAccessedAt: null },
          { lastAccessedAt: { lt: occurredAt } },
        ],
      },
      data: {
        activeLessonId: lesson.id,
        activeBlockId: blockExists ? dto.blockId ?? null : null,
        activeBlockOffset: blockExists ? dto.blockOffset ?? null : null,
        lastAccessedAt: occurredAt,
      },
    });
  }

  private async findCreateReplay(userId: string, createRequestKey: string, expectedInputHash: string) {
    const project = await this.prisma.learningProject.findUnique({
      where: { userId_createRequestKey: { userId, createRequestKey } },
      select: {
        id: true,
        courseId: true,
        jobs: {
          where: { type: AiJobType.course_plan, executionNo: 1 },
          select: { id: true, inputHash: true },
          take: 1,
        },
      },
    });
    if (!project) return null;
    const job = project.jobs[0];
    if (!job) throw new ConflictException('Idempotent project is missing its initial job');
    if (job.inputHash !== expectedInputHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was already used with a different request',
      });
    }
    return {
      projectId: project.id,
      courseId: project.courseId,
      jobId: job.id,
      status: 'planning' as const,
    };
  }

  private async approvedResponse(
    tx: Prisma.TransactionClient,
    project: {
      id: string;
      courseId: string;
      activeLessonId: string | null;
    },
  ) {
    if (!project.activeLessonId) {
      throw new ConflictException('Approved course is missing its first lesson');
    }
    const job = await tx.aiGenerationJob.findFirst({
      where: {
        projectId: project.id,
        lessonId: project.activeLessonId,
        type: AiJobType.lesson_content,
      },
      orderBy: [{ executionNo: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    if (!job) throw new ConflictException('Approved course is missing its lesson job');
    return this.approveResponse(
      project.id,
      project.courseId,
      project.activeLessonId,
      job.id,
    );
  }

  private approveResponse(
    projectId: string,
    courseId: string,
    firstLessonId: string,
    jobId: string,
  ) {
    return {
      projectId,
      courseId,
      firstLessonId,
      jobId,
      status: 'generating_first_lesson' as const,
      continueHref: `/ai-courses/${projectId}/learn/${firstLessonId}`,
    };
  }

  private async materializePlan(
    tx: Prisma.TransactionClient,
    courseId: string,
    plan: EditableCoursePlan,
  ) {
    await tx.courseConcept.deleteMany({ where: { courseId } });
    await tx.chapter.deleteMany({ where: { courseId } });

    const conceptIds = new Map<string, string>();
    for (const [orderIndex, concept] of plan.concepts.entries()) {
      const created = await tx.courseConcept.create({
        data: { courseId, ...concept, orderIndex },
        select: { id: true },
      });
      conceptIds.set(concept.key, created.id);
    }

    let firstVisibleLessonId: string | null = null;
    for (const [chapterIndex, chapter] of plan.chapters.entries()) {
      const createdChapter = await tx.chapter.create({
        data: {
          courseId,
          title: chapter.title,
          description: chapter.objective,
          orderIndex: chapterIndex,
        },
        select: { id: true },
      });
      for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
        const createdLesson = await tx.lesson.create({
          data: {
            chapterId: createdChapter.id,
            title: lesson.title,
            description: lesson.objective,
            orderIndex: lessonIndex,
            estimatedMinutes: lesson.estimatedMinutes,
            isHidden: lesson.isHidden,
          },
          select: { id: true },
        });
        await tx.lessonContent.create({
          data: {
            lessonId: createdLesson.id,
            status: LessonContentStatus.empty,
            schemaVersion: 1,
            version: 1,
          },
        });
        await tx.lessonConcept.createMany({
          data: lesson.conceptKeys.map((conceptKey, orderIndex) => ({
            lessonId: createdLesson.id,
            conceptId: conceptIds.get(conceptKey) as string,
            orderIndex,
          })),
        });
        if (!lesson.isHidden && !firstVisibleLessonId) {
          firstVisibleLessonId = createdLesson.id;
        }
      }
    }
    if (!firstVisibleLessonId) {
      throw new BadRequestException('At least one lesson must be visible');
    }
    return firstVisibleLessonId;
  }

  private async findProjectSubject(id: string) {
    const project = await this.prisma.learningProject.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        courseId: true,
        status: true,
        planSnapshot: true,
        planApprovedAt: true,
        activeLessonId: true,
        progressPercent: true,
      },
    });
    if (!project) throw new NotFoundException('Learning project not found');
    return project;
  }

  private projectViewSelect(userId?: string) {
    return {
      ...PROJECT_LIST_SELECT,
      activeLesson: { select: { id: true, title: true } },
      course: {
        select: {
          id: true,
          title: true,
          description: true,
          learningPoints: true,
          instructor: true,
          level: true,
          duration: true,
          thumbnail: true,
          tags: true,
          costType: true,
          price: true,
          status: true,
          courseType: true,
          externalUrl: true,
          sourceVideoUrl: true,
          sourcePlatform: true,
          ownerUserId: true,
          origin: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          chapters: {
            where: { deletedAt: null },
            orderBy: { orderIndex: 'asc' as const },
            include: {
              lessons: {
                where: { deletedAt: null },
                orderBy: { orderIndex: 'asc' as const },
                include: {
                  progress: userId
                    ? {
                        where: { userId, status: 'completed' as const },
                        select: { id: true },
                      }
                    : false,
                },
              },
            },
          },
          concepts: {
            orderBy: { orderIndex: 'asc' as const },
            include: {
              masteryStates: userId
                ? { where: { userId }, select: { stage: true } }
                : false,
            },
          },
        },
      },
      jobs: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { id: true, type: true, status: true },
      },
    } satisfies Prisma.LearningProjectSelect;
  }

  private toListItem(project: ProjectView) {
    const visibleLessons = project.course.chapters.flatMap((chapter) =>
      chapter.lessons.filter((lesson) => !lesson.isHidden),
    );
    const completedLessons = visibleLessons.filter(
      (lesson) => lesson.progress.length > 0,
    ).length;
    const mastered = project.course.concepts.filter(
      (concept) => concept.masteryStates[0]?.stage === 'mastered',
    ).length;
    return {
      id: project.id,
      course: {
        id: project.course.id,
        title: project.course.title,
        description: project.course.description,
        level: project.course.level,
      },
      seedText: project.seedText,
      status: project.status,
      errorStage: this.errorStage(project.status, project.jobs[0]?.type),
      activeLesson: project.activeLesson,
      completedLessons,
      totalLessons: visibleLessons.length,
      masteryLabel: project.course.concepts.length
        ? `${mastered}/${project.course.concepts.length} 个概念已掌握`
        : null,
      continueHref: this.continueHref(project.id, project.activeLesson?.id),
      lastAccessedAt: project.lastAccessedAt?.toISOString() ?? null,
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private toDetail(project: ProjectView) {
    const listItem = this.toListItem(project);
    const preferences = this.normalizeStoredPreferences(project.preferences);
    const plan = this.planView(project.planSnapshot, project.planVersion, preferences);
    return {
      ...listItem,
      courseId: project.courseId,
      learningGoal: project.learningGoal,
      targetLevel: project.targetLevel,
      availableMinutes: project.availableMinutes,
      preferences,
      plan,
      chapters: project.course.chapters.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map(({ progress: _progress, ...lesson }) => lesson),
      })),
      activeBlockId: project.activeBlockId,
      activeBlockOffset: project.activeBlockOffset,
      currentJobId: project.jobs[0]?.id ?? null,
      lastErrorCode: project.lastErrorCode,
      lastErrorMessage: project.lastErrorMessage,
    };
  }

  private parseEditablePlan(input: unknown): EditableCoursePlan {
    const parsed = EditableCoursePlanSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid editable course plan: ${details}`);
    }
    return parsed.data;
  }

  private parseStoredPlan(
    snapshot: Prisma.JsonValue | null,
    preferences: Prisma.JsonValue | null,
    planVersion: number,
  ): EditableCoursePlan {
    const record = this.jsonRecord(snapshot);
    if (!record) throw new ConflictException('Course plan snapshot is missing');
    const parsed = EditableCoursePlanSchema.safeParse({
      ...record,
      planVersion,
      preferences: record.preferences ?? preferences,
    });
    if (!parsed.success) {
      throw new ConflictException('Stored course plan is invalid');
    }
    return parsed.data;
  }

  private planSnapshot(plan: EditableCoursePlan) {
    return {
      title: plan.title,
      description: plan.description,
      learningOutcome: plan.learningOutcome,
      level: plan.level,
      estimatedMinutes: plan.estimatedMinutes,
      prerequisites: plan.prerequisites,
      concepts: plan.concepts,
      chapters: plan.chapters,
      preferences: plan.preferences,
    };
  }

  private courseMetadata(plan: EditableCoursePlan) {
    const prerequisites = plan.prerequisites.length
      ? `\n前置要求：${plan.prerequisites.join('；')}`
      : '';
    return {
      title: plan.title,
      description: plan.description,
      learningPoints: `${plan.learningOutcome}${prerequisites}`,
      level: plan.level,
      duration: `${plan.estimatedMinutes} 分钟`,
      tags: plan.concepts.map((concept) => concept.title).join(','),
    };
  }

  private normalizePreferences(dto: CreateLearningProjectDto): NormalizedLearningPreferences {
    return {
      explanationStyle: dto.preferences?.explanationStyle ?? 'balanced',
      depth: dto.preferences?.depth ?? 'standard',
      goalType: dto.goalType ?? dto.preferences?.goalType ?? 'systematic',
      language: dto.preferences?.language ?? 'zh-CN',
      includeMath: dto.preferences?.includeMath ?? true,
      includeCode: dto.preferences?.includeCode ?? true,
    };
  }

  private normalizeStoredPreferences(value: Prisma.JsonValue | null): NormalizedLearningPreferences {
    const record = this.jsonRecord(value);
    return {
      explanationStyle: this.oneOf(record?.explanationStyle, ['balanced', 'simple', 'technical', 'practical']) ?? 'balanced',
      depth: this.oneOf(record?.depth, ['introductory', 'standard', 'deep']) ?? 'standard',
      goalType: this.oneOf(record?.goalType, ['quick_understanding', 'systematic', 'project', 'exam']) ?? 'systematic',
      language: this.oneOf(record?.language, ['zh-CN', 'en']) ?? 'zh-CN',
      includeMath: typeof record?.includeMath === 'boolean' ? record.includeMath : true,
      includeCode: typeof record?.includeCode === 'boolean' ? record.includeCode : true,
    };
  }

  private planView(
    snapshot: Prisma.JsonValue | null,
    planVersion: number,
    preferences: NormalizedLearningPreferences,
  ) {
    const record = this.jsonRecord(snapshot);
    return record ? { ...record, planVersion, preferences } : null;
  }

  private resultRef(value: Prisma.JsonValue | null, projectId: string) {
    return { ...(this.jsonRecord(value) ?? {}), projectId };
  }

  private restoreStatus(project: {
    planSnapshot: Prisma.JsonValue | null;
    planApprovedAt: Date | null;
    activeLessonId: string | null;
    progressPercent: number;
  }): LearningProjectStatus {
    if (!project.planSnapshot) return LearningProjectStatus.planning;
    if (!project.planApprovedAt) return LearningProjectStatus.plan_ready;
    if (project.activeLessonId && project.progressPercent > 0) {
      return LearningProjectStatus.learning;
    }
    return LearningProjectStatus.ready;
  }

  private errorStage(status: LearningProjectStatus, type?: AiJobType) {
    if (status !== LearningProjectStatus.failed) return null;
    return type === AiJobType.course_plan ? 'plan' as const : 'first_lesson' as const;
  }

  private continueHref(projectId: string, lessonId?: string) {
    return lessonId
      ? `/ai-courses/${projectId}/learn/${lessonId}`
      : `/ai-courses/${projectId}/plan`;
  }

  private isJobRetryable(errorCode: string | null, manualRetries: number) {
    return manualRetries < 2 && ![
      'PROCESSOR_NOT_CONFIGURED',
      'PROJECT_ARCHIVED',
      'INVALID_INPUT',
    ].includes(errorCode ?? '');
  }

  private hasBlock(blocks: Prisma.JsonValue | null | undefined, blockId: string) {
    return Array.isArray(blocks) && blocks.some((block) => {
      const record = this.jsonRecord(block);
      return record?.id === blockId;
    });
  }

  private jsonRecord(value: Prisma.JsonValue | undefined): Record<string, Prisma.JsonValue> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, Prisma.JsonValue>
      : null;
  }

  private oneOf<const T extends string>(value: unknown, options: readonly T[]): T | undefined {
    return typeof value === 'string' && options.includes(value as T)
      ? value as T
      : undefined;
  }

  private hashInput(value: object) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private encodeCursor(cursor: ProjectCursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(encoded: string): ProjectCursor {
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<ProjectCursor>;
      if (
        typeof parsed.id !== 'string' ||
        typeof parsed.updatedAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.updatedAt))
      ) {
        throw new Error('invalid cursor');
      }
      return { id: parsed.id, updatedAt: parsed.updatedAt };
    } catch {
      throw new BadRequestException('Invalid project cursor');
    }
  }
}

type ProjectView = Prisma.LearningProjectGetPayload<{
  select: ReturnType<LearningProjectsService['projectViewSelect']>;
}>;
