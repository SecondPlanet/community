import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  AiEnqueueStatus,
  AiJobStatus,
  AiJobType,
  AssessmentAttemptStatus,
  AssessmentKind,
  AssessmentStatus,
  LearningProjectStatus,
  LessonContentStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { isUUID } from 'class-validator';
import {
  ProjectAccessPolicyService,
  ProjectPrincipal,
} from '../../common/project-access/project-access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLessonVariantDto,
  GenerateLessonDto,
  LessonGenerationModeDto,
  SubmitAssessmentAttemptDto,
} from './personal-learning.dto';
import {
  InternalAssessmentQuestion,
  parseAssessmentQuestions,
  publicQuestion,
} from './personal-learning.schemas';
import { recordPersonalLearningEvent } from '../../common/personal-learning-telemetry';

type JobCreateResult<T> = { ok: true; value: T };

@Injectable()
export class PersonalLearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessPolicyService,
  ) {}

  async getLessonContent(
    projectId: string,
    lessonId: string,
    principal: ProjectPrincipal,
  ) {
    const lesson = await this.lessonSubject(projectId, lessonId, principal);
    const content = lesson.content;
    const activeJob = await this.prisma.aiGenerationJob.findFirst({
      where: {
        projectId,
        lessonId,
        type: AiJobType.lesson_content,
        status: { in: [AiJobStatus.queued, AiJobStatus.running] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, targetVersion: true },
    });
    return {
      lessonId,
      status: content?.status ?? LessonContentStatus.empty,
      schemaVersion: content?.schemaVersion ?? 1,
      version: content?.version ?? 1,
      blocks: content?.blocks ?? null,
      summary: content?.summary ?? null,
      glossary: content?.glossary ?? null,
      generatedAt: content?.generatedAt ?? null,
      generation: activeJob
        ? {
            jobId: activeJob.id,
            status: activeJob.status,
            targetVersion: activeJob.targetVersion,
            regenerating: content?.status === LessonContentStatus.ready,
          }
        : null,
    };
  }

  async generateLesson(
    projectId: string,
    lessonId: string,
    principal: ProjectPrincipal,
    idempotencyKey: string | undefined,
    dto: GenerateLessonDto,
  ) {
    this.assertIdempotencyKey(idempotencyKey);
    const subject = await this.lessonSubject(projectId, lessonId, principal);
    this.assertProjectMutable(subject.project.status);
    const mode = dto.mode ?? LessonGenerationModeDto.generate;
    const requestKey = `${subject.project.userId}:lesson_content:${projectId}:${lessonId}:${mode}:${idempotencyKey}`;

    try {
      const created = await this.prisma.$transaction(async (tx): Promise<JobCreateResult<ReturnType<PersonalLearningService['generationResponse']>>> => {
        const replay = await tx.aiGenerationJob.findUnique({
          where: { requestKey_executionNo: { requestKey, executionNo: 1 } },
          select: { id: true, status: true, targetVersion: true },
        });
        if (replay) {
          return { ok: true, value: this.generationResponse(replay, subject.content?.version ?? 1) };
        }
        await this.assertMutableProjectInTransaction(tx, projectId, subject.project.userId);
        const content = await tx.lessonContent.findUnique({ where: { lessonId } });
        if (mode === LessonGenerationModeDto.regenerate &&
          content?.status !== LessonContentStatus.ready) {
          throw new ConflictException('Only ready lesson content can be regenerated');
        }
        if (mode !== LessonGenerationModeDto.regenerate &&
          content?.status === LessonContentStatus.ready) {
          throw new ConflictException('Use mode=regenerate for ready lesson content');
        }

        const targetVersion = mode === LessonGenerationModeDto.regenerate
          ? (content?.version ?? 1) + 1
          : content?.version ?? 1;
        const active = await tx.aiGenerationJob.findFirst({
          where: {
            projectId,
            lessonId,
            type: AiJobType.lesson_content,
            targetVersion,
            status: { in: [AiJobStatus.queued, AiJobStatus.running] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, targetVersion: true },
        });
        if (active) {
          return { ok: true, value: this.generationResponse(active, content?.version ?? 1) };
        }
        // A ready row is deliberately untouched during regeneration. Its blocks
        // remain readable until the worker atomically installs targetVersion.
        const job = await tx.aiGenerationJob.create({
          data: {
            userId: subject.project.userId,
            projectId,
            lessonId,
            type: AiJobType.lesson_content,
            status: AiJobStatus.queued,
            enqueueStatus: AiEnqueueStatus.pending,
            requestKey,
            executionNo: 1,
            inputHash: this.hash({ projectId, lessonId, targetVersion, mode }),
            targetVersion,
            currentStep: mode === LessonGenerationModeDto.regenerate
              ? '正在重新生成教材'
              : '正在生成教材',
          },
          select: { id: true, status: true, targetVersion: true },
        });
        if (!content) {
          await tx.lessonContent.create({
            data: { lessonId, status: LessonContentStatus.queued, version: 1 },
          });
        } else if (content.status !== LessonContentStatus.ready) {
          await tx.lessonContent.update({
            where: { lessonId },
            data: { status: LessonContentStatus.queued },
          });
        }
        await recordPersonalLearningEvent(tx, {
          userId: subject.project.userId,
          eventType: 'personal_lesson_generation_started',
          lessonId,
          projectId,
          jobId: job.id,
          contentVersion: targetVersion,
        });
        return { ok: true, value: this.generationResponse(job, content?.version ?? 1) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return created.value;
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const replay = await this.prisma.aiGenerationJob.findUnique({
        where: { requestKey_executionNo: { requestKey, executionNo: 1 } },
        select: { id: true, status: true, targetVersion: true },
      });
      if (replay) return this.generationResponse(replay, subject.content?.version ?? 1);
      throw error;
    }
  }

  async createVariant(
    projectId: string,
    lessonId: string,
    principal: ProjectPrincipal,
    idempotencyKey: string | undefined,
    dto: CreateLessonVariantDto,
  ) {
    this.assertIdempotencyKey(idempotencyKey);
    const subject = await this.lessonSubject(projectId, lessonId, principal);
    this.assertProjectMutable(subject.project.status);
    const requestKey = `${subject.project.userId}:lesson_variant:${projectId}:${lessonId}:${idempotencyKey}`;
    const replay = await this.variantReplay(requestKey);
    if (replay) return replay;
    if (!subject.content || subject.content.status !== LessonContentStatus.ready) {
      throw new ConflictException('Lesson content must be ready');
    }
    const content = subject.content;
    if (dto.blockId && !this.hasBlock(content.blocks, dto.blockId)) {
      throw new NotFoundException('Lesson content block not found');
    }
    try {
      const created = await this.prisma.$transaction(async (tx): Promise<JobCreateResult<{
        variantId: string;
        jobId: string;
        status: AiJobStatus;
        contentVersion: number;
      }>> => {
        await this.assertMutableProjectInTransaction(tx, projectId, subject.project.userId);
        const latestContent = await tx.lessonContent.findUnique({ where: { lessonId } });
        if (latestContent?.status !== LessonContentStatus.ready ||
          latestContent.version !== content.version) {
          throw new ConflictException('Lesson content version changed; reload before creating a variant');
        }
        const job = await tx.aiGenerationJob.create({
          data: {
            userId: subject.project.userId,
            projectId,
            lessonId,
            type: AiJobType.lesson_variant,
            status: AiJobStatus.queued,
            enqueueStatus: AiEnqueueStatus.pending,
            requestKey,
            executionNo: 1,
            inputHash: this.hash({
              projectId,
              lessonId,
              contentVersion: content.version,
              action: dto.action,
              blockId: dto.blockId ?? null,
            }),
            targetVersion: content.version,
            currentStep: '正在生成补充讲解',
          },
          select: { id: true },
        });
        const variant = await tx.lessonVariant.create({
          data: {
            projectId,
            lessonId,
            lessonContentVersion: content.version,
            blockId: dto.blockId,
            action: dto.action,
            jobId: job.id,
          },
          select: { id: true },
        });
        return {
          ok: true,
          value: {
            variantId: variant.id,
            jobId: job.id,
            status: AiJobStatus.queued,
            contentVersion: content.version,
          },
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return created.value;
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const concurrentReplay = await this.variantReplay(requestKey);
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  async createAssessment(
    projectId: string,
    lessonId: string,
    principal: ProjectPrincipal,
    idempotencyKey: string | undefined,
  ) {
    this.assertIdempotencyKey(idempotencyKey);
    const subject = await this.lessonSubject(projectId, lessonId, principal);
    this.assertProjectMutable(subject.project.status);
    if (!subject.content || subject.content.status !== LessonContentStatus.ready) {
      throw new ConflictException('Lesson content must be ready before creating an assessment');
    }
    const version = subject.content.version;
    const requestKey = `${subject.project.userId}:assessment_generate:${projectId}:${lessonId}:v${version}:${idempotencyKey}`;

    try {
      const created = await this.prisma.$transaction(async (tx): Promise<JobCreateResult<{
        assessmentId: string;
        status: AssessmentStatus;
        jobId: string | null;
      }>> => {
        await this.assertMutableProjectInTransaction(tx, projectId, subject.project.userId);
        const latestContent = await tx.lessonContent.findUnique({ where: { lessonId } });
        if (latestContent?.status !== LessonContentStatus.ready ||
          latestContent.version !== version) {
          throw new ConflictException('Lesson content version changed; reload before creating an assessment');
        }
        let assessment = await tx.assessment.findUnique({
          where: {
            projectId_lessonId_kind_lessonContentVersion: {
              projectId,
              lessonId,
              kind: AssessmentKind.lesson_check,
              lessonContentVersion: version,
            },
          },
        });
        if (assessment?.status === AssessmentStatus.ready) {
          return {
            ok: true,
            value: { assessmentId: assessment.id, status: assessment.status, jobId: null },
          };
        }
        const assessmentWasCreated = !assessment;
        if (!assessment) {
          assessment = await tx.assessment.create({
            data: {
              projectId,
              lessonId,
              kind: AssessmentKind.lesson_check,
              status: AssessmentStatus.generating,
              lessonContentVersion: version,
            },
          });
        }
        const replay = await tx.aiGenerationJob.findUnique({
          where: { requestKey_executionNo: { requestKey, executionNo: 1 } },
          select: { id: true, status: true },
        });
        if (replay) {
          return {
            ok: true,
            value: { assessmentId: assessment.id, status: assessment.status, jobId: replay.id },
          };
        }
        const active = await tx.aiGenerationJob.findFirst({
          where: {
            projectId,
            lessonId,
            type: AiJobType.assessment_generate,
            targetVersion: version,
            status: { in: [AiJobStatus.queued, AiJobStatus.running] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (active) {
          return {
            ok: true,
            value: { assessmentId: assessment.id, status: assessment.status, jobId: active.id },
          };
        }
        const job = await tx.aiGenerationJob.create({
          data: {
            userId: subject.project.userId,
            projectId,
            lessonId,
            type: AiJobType.assessment_generate,
            status: AiJobStatus.queued,
            enqueueStatus: AiEnqueueStatus.pending,
            requestKey,
            executionNo: 1,
            inputHash: this.hash({ projectId, lessonId, lessonContentVersion: version }),
            targetVersion: version,
            currentStep: '正在生成课后测评',
          },
          select: { id: true },
        });
        if (assessment.status === AssessmentStatus.failed) {
          assessment = await tx.assessment.update({
            where: { id: assessment.id },
            data: { status: AssessmentStatus.generating, errorCode: null },
          });
        }
        return {
          ok: true,
          value: { assessmentId: assessment.id, status: assessment.status, jobId: job.id },
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return created.value;
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.prisma.assessment.findUnique({
        where: {
          projectId_lessonId_kind_lessonContentVersion: {
            projectId,
            lessonId,
            kind: AssessmentKind.lesson_check,
            lessonContentVersion: version,
          },
        },
      });
      if (!existing) throw error;
      const job = await this.prisma.aiGenerationJob.findFirst({
        where: { projectId, lessonId, type: AiJobType.assessment_generate, targetVersion: version },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return { assessmentId: existing.id, status: existing.status, jobId: job?.id ?? null };
    }
  }

  async getAssessment(
    projectId: string,
    assessmentId: string,
    principal: ProjectPrincipal,
  ) {
    const assessment = await this.assessmentSubject(projectId, assessmentId, principal);
    if (assessment.status !== AssessmentStatus.ready) {
      return {
        id: assessment.id,
        lessonId: assessment.lessonId,
        status: assessment.status,
        lessonContentVersion: assessment.lessonContentVersion,
        schemaVersion: assessment.schemaVersion,
        ...(assessment.status === AssessmentStatus.failed
          ? { errorCode: assessment.errorCode ?? 'ASSESSMENT_GENERATION_FAILED' }
          : {}),
      };
    }
    const parsed = parseAssessmentQuestions(assessment.questions);
    if (!parsed.success) throw new InternalServerErrorException('ASSESSMENT_SCHEMA_INVALID');
    return {
      id: assessment.id,
      lessonId: assessment.lessonId,
      kind: assessment.kind,
      status: assessment.status,
      lessonContentVersion: assessment.lessonContentVersion,
      schemaVersion: assessment.schemaVersion,
      questions: parsed.data.map(publicQuestion),
    };
  }

  async submitAttempt(
    projectId: string,
    assessmentId: string,
    principal: ProjectPrincipal,
    dto: SubmitAssessmentAttemptDto,
  ) {
    const assessment = await this.assessmentSubject(projectId, assessmentId, principal);
    this.assertProjectMutable(assessment.project.status);
    const replay = await this.findAttemptReplay(
      projectId,
      assessmentId,
      assessment.project.userId,
      dto.clientSubmissionKey,
      dto.answers,
    );
    if (replay) return replay;

    try {
      const submitted = await this.prisma.$transaction(async (tx): Promise<JobCreateResult<
        ReturnType<PersonalLearningService['completedAttemptView']> |
        { attemptId: string; jobId: string; status: AssessmentAttemptStatus }
      >> => {
        await this.assertMutableProjectInTransaction(tx, projectId, assessment.project.userId);
        const current = await tx.assessment.findFirst({
          where: { id: assessmentId, projectId },
          include: { lesson: { select: { content: true } } },
        });
        if (!current || current.status !== AssessmentStatus.ready) {
          throw new ConflictException('Assessment is not ready');
        }
        if (current.lesson.content?.version !== current.lessonContentVersion) {
          throw new ConflictException('Assessment is stale for the current lesson version');
        }
        const parsed = parseAssessmentQuestions(current.questions);
        if (!parsed.success) throw new InternalServerErrorException('ASSESSMENT_SCHEMA_INVALID');
        this.assertAnswers(parsed.data, dto);
        const answers = dto.answers as unknown as Prisma.InputJsonValue;

        if (parsed.data.every((question) => question.type === 'single_choice')) {
          const grading = this.gradeChoices(parsed.data, dto, projectId, current.lessonId);
          const attempt = await tx.assessmentAttempt.create({
            data: {
              assessmentId,
              userId: assessment.project.userId,
              status: AssessmentAttemptStatus.completed,
              clientSubmissionKey: dto.clientSubmissionKey,
              answers,
              grading: grading.details as unknown as Prisma.InputJsonValue,
              score: grading.score,
              recommendation: grading.recommendation as unknown as Prisma.InputJsonValue,
              gradedAt: new Date(),
            },
          });
          await recordPersonalLearningEvent(tx, {
            userId: assessment.project.userId,
            eventType: 'personal_assessment_started',
            lessonId: current.lessonId,
            projectId,
            attemptId: attempt.id,
          });
          await recordPersonalLearningEvent(tx, {
            userId: assessment.project.userId,
            eventType: 'personal_assessment_completed',
            lessonId: current.lessonId,
            projectId,
            attemptId: attempt.id,
          });
          return {
            ok: true,
            value: this.completedAttemptView(
              attempt,
              attempt.grading ? this.sanitizeGrading(attempt.grading) : null,
            ),
          };
        }

        const attempt = await tx.assessmentAttempt.create({
          data: {
            assessmentId,
            userId: assessment.project.userId,
            status: AssessmentAttemptStatus.grading,
            clientSubmissionKey: dto.clientSubmissionKey,
            answers,
          },
        });
        const requestKey = `${assessment.project.userId}:assessment_grade:${assessmentId}:${dto.clientSubmissionKey}`;
        const job = await tx.aiGenerationJob.create({
          data: {
            userId: assessment.project.userId,
            projectId,
            lessonId: current.lessonId,
            attemptId: attempt.id,
            type: AiJobType.assessment_grade,
            status: AiJobStatus.queued,
            enqueueStatus: AiEnqueueStatus.pending,
            requestKey,
            executionNo: 1,
            inputHash: this.hash({
              assessmentId,
              schemaVersion: current.schemaVersion,
              answers: dto.answers,
            }),
            targetVersion: current.lessonContentVersion,
            currentStep: '正在评估你的理解',
          },
          select: { id: true },
        });
        await recordPersonalLearningEvent(tx, {
          userId: assessment.project.userId,
          eventType: 'personal_assessment_started',
          lessonId: current.lessonId,
          projectId,
          jobId: job.id,
          attemptId: attempt.id,
        });
        return {
          ok: true,
          value: {
            attemptId: attempt.id,
            jobId: job.id,
            status: AssessmentAttemptStatus.grading,
          },
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return submitted.value;
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const concurrentReplay = await this.findAttemptReplay(
        projectId,
        assessmentId,
        assessment.project.userId,
        dto.clientSubmissionKey,
        dto.answers,
      );
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  async getAttempt(
    projectId: string,
    assessmentId: string,
    attemptId: string,
    principal: ProjectPrincipal,
  ) {
    const assessment = await this.assessmentSubject(projectId, assessmentId, principal);
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, assessmentId, userId: assessment.project.userId },
      include: {
        gradingJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, errorCode: true, manualRetries: true },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Assessment attempt not found');
    return this.attemptView(attempt);
  }

  private async lessonSubject(
    projectId: string,
    lessonId: string,
    principal: ProjectPrincipal,
  ) {
    const project = await this.prisma.learningProject.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, courseId: true, status: true },
    });
    if (!project) throw new NotFoundException('Learning project not found');
    this.projectAccess.assertCanAccess(project, principal);
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        deletedAt: null,
        chapter: { courseId: project.courseId, deletedAt: null },
      },
      include: { content: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return { ...lesson, project };
  }

  private async assessmentSubject(
    projectId: string,
    assessmentId: string,
    principal: ProjectPrincipal,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, projectId },
      include: {
        project: {
          select: { id: true, userId: true, courseId: true, status: true },
        },
        lesson: {
          select: {
            deletedAt: true,
            chapter: { select: { courseId: true, deletedAt: true } },
          },
        },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    this.projectAccess.assertCanAccess(assessment.project, principal);
    if (assessment.lesson.deletedAt || assessment.lesson.chapter.deletedAt ||
      assessment.lesson.chapter.courseId !== assessment.project.courseId) {
      throw new NotFoundException('Assessment not found');
    }
    return assessment;
  }

  private async assertMutableProjectInTransaction(
    tx: Prisma.TransactionClient,
    projectId: string,
    userId: string,
  ) {
    const project = await tx.learningProject.findFirst({
      where: { id: projectId, userId },
      select: { status: true },
    });
    if (!project) throw new NotFoundException('Learning project not found');
    this.assertProjectMutable(project.status);
  }

  private assertProjectMutable(status: LearningProjectStatus) {
    if (status === LearningProjectStatus.archived) {
      throw new ConflictException('Archived learning projects are read-only');
    }
  }

  private assertIdempotencyKey(value: string | undefined): asserts value is string {
    if (!value || !isUUID(value, '4')) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    }
  }

  private generationResponse(
    job: { id: string; status: AiJobStatus; targetVersion: number | null },
    contentVersion: number,
  ) {
    return {
      jobId: job.id,
      status: job.status,
      targetVersion: job.targetVersion,
      contentVersion,
      regenerating: (job.targetVersion ?? contentVersion) > contentVersion,
    };
  }

  private async variantReplay(requestKey: string) {
    const job = await this.prisma.aiGenerationJob.findUnique({
      where: { requestKey_executionNo: { requestKey, executionNo: 1 } },
      include: { variants: { select: { id: true }, take: 1 } },
    });
    if (!job) return null;
    return {
      variantId: job.variants[0]?.id ?? null,
      jobId: job.id,
      status: job.status,
      contentVersion: job.targetVersion,
    };
  }

  private assertAnswers(
    questions: InternalAssessmentQuestion[],
    dto: SubmitAssessmentAttemptDto,
  ) {
    const questionIds = new Set(questions.map((question) => question.id));
    const answerIds = new Set(dto.answers.map((answer) => answer.questionId));
    if (answerIds.size !== dto.answers.length ||
      answerIds.size !== questionIds.size ||
      [...answerIds].some((id) => !questionIds.has(id))) {
      throw new BadRequestException('Answers must contain each assessment question exactly once');
    }
  }

  private gradeChoices(
    questions: InternalAssessmentQuestion[],
    dto: SubmitAssessmentAttemptDto,
    projectId: string,
    lessonId: string,
  ) {
    const answers = new Map(dto.answers.map((answer) => [answer.questionId, answer.answer]));
    const items = questions.map((question) => {
      const correct = answers.get(question.id) === question.correctAnswer;
      return {
        questionId: question.id,
        verdict: correct ? 'correct' : 'incorrect',
        correctAnswer: question.correctAnswer,
        explanation: question.explanation ?? null,
      };
    });
    const score = Math.round(
      (items.filter((item) => item.verdict === 'correct').length / items.length) * 100,
    );
    const nextStep = score < 60 ? 'review' : score < 80 ? 'reinforce' : 'continue';
    return {
      score,
      details: { items, misconceptions: [], masteryUpdates: [] },
      recommendation: {
        nextStep,
        continueHref: `/ai-courses/${projectId}/learn/${lessonId}`,
      },
    };
  }

  private async findAttemptReplay(
    projectId: string,
    assessmentId: string,
    userId: string,
    clientSubmissionKey: string,
    submittedAnswers: SubmitAssessmentAttemptDto['answers'],
  ) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: {
        assessmentId_userId_clientSubmissionKey: {
          assessmentId,
          userId,
          clientSubmissionKey,
        },
      },
      include: {
        gradingJobs: {
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, errorCode: true, manualRetries: true },
        },
      },
    });
    if (!attempt) return null;
    if (this.canonicalAnswers(attempt.answers) !== this.canonicalAnswers(submittedAnswers)) {
      throw new ConflictException('Idempotency key was already used with different answers');
    }
    return this.attemptView(attempt);
  }

  private attemptView(attempt: {
    id: string;
    status: AssessmentAttemptStatus;
    score: number | null;
    grading: Prisma.JsonValue | null;
    recommendation: Prisma.JsonValue | null;
    errorCode: string | null;
    gradingJobs: Array<{
      id: string;
      status: AiJobStatus;
      errorCode: string | null;
      manualRetries: number;
    }>;
  }) {
    const job = attempt.gradingJobs[0];
    if (attempt.status === AssessmentAttemptStatus.completed) {
      const sanitizedGrading = attempt.grading
        ? this.sanitizeGrading(attempt.grading)
        : null;
      return this.completedAttemptView(attempt, sanitizedGrading);
    }
    if (attempt.status === AssessmentAttemptStatus.failed) {
      return {
        attemptId: attempt.id,
        status: attempt.status,
        errorCode: attempt.errorCode ?? job?.errorCode ?? 'ASSESSMENT_GRADING_FAILED',
        retryable: job?.status === AiJobStatus.failed && job.manualRetries < 2,
      };
    }
    return {
      attemptId: attempt.id,
      status: attempt.status,
      jobId: job?.id ?? null,
    };
  }

  private completedAttemptView(
    attempt: {
      id: string;
      status: AssessmentAttemptStatus;
      score: number | null;
      grading: Prisma.JsonValue | null;
      recommendation: Prisma.JsonValue | null;
    },
    sanitizedGrading?: Prisma.JsonValue | null,
  ) {
    return {
      attemptId: attempt.id,
      status: AssessmentAttemptStatus.completed,
      score: attempt.score,
      grading: sanitizedGrading !== undefined ? sanitizedGrading : attempt.grading,
      recommendation: attempt.recommendation,
    };
  }

  /**
   * Strip `correctAnswer` from a grading JSON payload before returning it in an
   * API response. The DB still stores the full grading (including the answer
   * key) for teacher review / audit; this sanitiser is applied at the API
   * boundary only so learners cannot read the answer key from the response.
   *
   * Behaviour:
   *   - For plain objects, copy all keys except `correctAnswer`.
   *   - For arrays, recurse element by element.
   *   - Other primitives (string/number/boolean/null) are returned unchanged.
   *
   * Other grading fields (`explanation`, `feedback`, `misconceptions`,
   * `mastery`, `masteryUpdates`, `recommendation.message`, …) pass through.
   */
  private sanitizeGrading(value: Prisma.JsonValue): Prisma.JsonValue {
    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeGrading(entry as Prisma.JsonValue));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, Prisma.JsonValue> = {};
      for (const [key, entry] of Object.entries(value as Record<string, Prisma.JsonValue>)) {
        if (key === 'correctAnswer') continue;
        result[key] = this.sanitizeGrading(entry);
      }
      return result;
    }
    return value;
  }

  private hasBlock(blocks: Prisma.JsonValue | null, blockId: string) {
    return Array.isArray(blocks) && blocks.some((block) =>
      block !== null && typeof block === 'object' && !Array.isArray(block) &&
      (block as Record<string, Prisma.JsonValue>).id === blockId,
    );
  }

  private hash(value: object) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private canonicalAnswers(value: Prisma.JsonValue | SubmitAssessmentAttemptDto['answers']) {
    if (!Array.isArray(value)) return JSON.stringify(value);
    return JSON.stringify([...value].sort((left, right) => {
      const leftId = left && typeof left === 'object' && !Array.isArray(left)
        ? String((left as Record<string, unknown>).questionId ?? '')
        : '';
      const rightId = right && typeof right === 'object' && !Array.isArray(right)
        ? String((right as Record<string, unknown>).questionId ?? '')
        : '';
      return leftId.localeCompare(rightId);
    }));
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
