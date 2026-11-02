import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AiEnqueueStatus,
  AiJobStatus,
  AiJobType,
  CourseLevel,
  LearningProjectStatus,
  Prisma,
} from '@prisma/client';
import { ProjectAccessPolicyService } from '../../common/project-access/project-access-policy.service';
import { EditableCoursePlan } from './learning-projects.schemas';
import { LearningProjectsService } from './learning-projects.service';

describe('LearningProjectsService', () => {
  const owner = { userId: 'owner-1' };
  const editablePlan = (): EditableCoursePlan => ({
    title: '大模型幻觉系统课程',
    description: '这是一门系统解释大模型幻觉成因、识别方法和缓解策略的完整课程。',
    learningOutcome: '理解幻觉的主要来源，并能选择合适的评估与缓解方法。',
    level: 'Intermediate' as const,
    estimatedMinutes: 120,
    prerequisites: ['了解基本的语言模型概念'],
    concepts: [
      { key: 'hallucination', title: '幻觉', description: '不可靠的模型生成内容' },
      { key: 'grounding', title: '事实锚定', description: '让回答基于可靠上下文' },
      { key: 'evaluation', title: '评估', description: '衡量回答事实准确性' },
    ],
    chapters: [
      {
        tempKey: 'chapter-1', title: '认识幻觉', objective: '建立幻觉的基本概念',
        lessons: [{
          tempKey: 'lesson-1', title: '什么是幻觉', objective: '识别常见幻觉表现',
          conceptKeys: ['hallucination'], estimatedMinutes: 20, isHidden: false,
        }],
      },
      {
        tempKey: 'chapter-2', title: '幻觉成因', objective: '理解幻觉出现的原因',
        lessons: [{
          tempKey: 'lesson-2', title: '训练与生成', objective: '理解训练和解码的影响',
          conceptKeys: ['hallucination', 'grounding'], estimatedMinutes: 30, isHidden: false,
        }],
      },
      {
        tempKey: 'chapter-3', title: '评估与缓解', objective: '掌握评估和缓解的方法',
        lessons: [{
          tempKey: 'lesson-3', title: '事实评估方法', objective: '应用事实准确性评估方法',
          conceptKeys: ['evaluation', 'grounding'], estimatedMinutes: 30, isHidden: false,
        }],
      },
    ],
    planVersion: 1,
    preferences: {
      explanationStyle: 'balanced' as const,
      depth: 'standard' as const,
      goalType: 'systematic' as const,
      language: 'zh-CN' as const,
      includeMath: false,
      includeCode: true,
    },
  });

  function createService(prisma: Record<string, unknown>, contentSafety = { assertAllowed: jest.fn().mockResolvedValue(undefined) }) {
    return new LearningProjectsService(
      prisma as never,
      new ProjectAccessPolicyService(),
      { remove: jest.fn() } as never,
      contentSafety as never,
    );
  }

  it('creates the private course, project, enrollment and pending plan job atomically', async () => {
    const tx = {
      course: {
        create: jest.fn().mockResolvedValue({ id: 'course-1' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      learningProject: { create: jest.fn().mockResolvedValue({ id: 'project-1' }) },
      enrollment: { create: jest.fn().mockResolvedValue({ id: 'enrollment-1' }) },
      aiGenerationJob: { create: jest.fn().mockResolvedValue({ id: 'job-1' }) },
      userAiProviderConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      learningProject: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = createService(prisma);

    await expect(service.create(
      owner.userId,
      '550e8400-e29b-41d4-a716-446655440000',
      {
        question: '为什么大模型会产生幻觉？',
        goalType: 'systematic' as never,
        targetLevel: CourseLevel.Intermediate,
        availableMinutes: 120,
        preferences: { includeCode: false, includeMath: false },
      },
    )).resolves.toEqual({
      projectId: 'project-1',
      courseId: 'course-1',
      jobId: 'job-1',
      status: 'planning',
    });

    expect(tx.course.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerUserId: owner.userId,
        origin: 'ai_personal',
        visibility: 'private',
        status: 'draft',
        courseType: 'own',
      }),
    }));
    expect(tx.learningProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        createRequestKey: '550e8400-e29b-41d4-a716-446655440000',
        preferences: expect.objectContaining({
          goalType: 'systematic',
          depth: 'standard',
          includeCode: false,
          includeMath: false,
        }),
      }),
    }));
    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: { userId: owner.userId, courseId: 'course-1', source: 'direct' },
    });
    expect(tx.aiGenerationJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: AiJobType.course_plan,
        status: AiJobStatus.queued,
        enqueueStatus: AiEnqueueStatus.pending,
        executionNo: 1,
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
  });

  it('replays the original accepted response for the same idempotency key', async () => {
    let service: LearningProjectsService;
    const prisma = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1',
          courseId: 'course-1',
          jobs: [{ id: 'job-1', inputHash: '' }],
        }),
      },
      $transaction: jest.fn(),
    };
    service = createService(prisma);
    const expectedHash = (service as any).hashInput({
      question: '同一个问题', targetLevel: null, availableMinutes: null,
      preferences: (service as any).normalizePreferences({ question: '同一个问题' }),
    });
    prisma.learningProject.findUnique.mockResolvedValue({
      id: 'project-1', courseId: 'course-1', jobs: [{ id: 'job-1', inputHash: expectedHash }],
    });
    const result = await service.create(
      owner.userId,
      '550e8400-e29b-41d4-a716-446655440000',
      { question: '同一个问题' },
    );

    expect(result).toEqual({
      projectId: 'project-1',
      courseId: 'course-1',
      jobId: 'job-1',
      status: 'planning',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different normalized request', async () => {
    const prisma = {
      learningProject: { findUnique: jest.fn().mockResolvedValue({
        id: 'project-1', courseId: 'course-1', jobs: [{ id: 'job-1', inputHash: 'different' }],
      }) },
      $transaction: jest.fn(),
    };
    await expect(createService(prisma).create(
      owner.userId, '550e8400-e29b-41d4-a716-446655440000', { question: '一个新的问题' },
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }) });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('applies content safety before replay lookup and performs no writes when restricted', async () => {
    const restricted = Object.assign(new Error('restricted'), { code: 'CONTENT_RESTRICTED' });
    const contentSafety = { assertAllowed: jest.fn().mockRejectedValue(restricted) };
    const prisma = { learningProject: { findUnique: jest.fn() }, $transaction: jest.fn() };
    await expect(createService(prisma, contentSafety).create(
      owner.userId, '550e8400-e29b-41d4-a716-446655440000', { question: 'restricted input' },
    )).rejects.toBe(restricted);
    expect(prisma.learningProject.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('CAS relinks a failed lesson variant to its manual retry execution', async () => {
    const original = {
      id: 'job-old', userId: owner.userId, projectId: 'project-1', lessonId: 'lesson-1', attemptId: null,
      type: AiJobType.lesson_variant, status: AiJobStatus.failed, requestKey: 'variant-request',
      executionNo: 1, inputHash: 'hash', targetVersion: 2, manualRetries: 0,
      errorCode: 'AI_PROVIDER_TRANSIENT', project: { id: 'project-1', userId: owner.userId, status: LearningProjectStatus.learning },
    };
    const tx = {
      aiGenerationJob: {
        findUnique: jest.fn().mockResolvedValue(original),
        create: jest.fn().mockResolvedValue({ id: 'job-new' }),
      },
      userAiProviderConfig: { findFirst: jest.fn().mockResolvedValue(null) },
      lessonVariant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      aiGenerationJob: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(original)
          .mockResolvedValueOnce({ ...original, id: 'job-new', status: AiJobStatus.queued, project: original.project }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    await expect(createService(prisma).retryJob('project-1', 'job-old', owner)).resolves.toMatchObject({
      id: 'job-new', status: AiJobStatus.queued,
    });
    expect(tx.lessonVariant.updateMany).toHaveBeenCalledWith({
      where: { jobId: 'job-old', content: { equals: Prisma.DbNull } }, data: { jobId: 'job-new' },
    });
  });

  it('rejects a missing or malformed Idempotency-Key before writing', async () => {
    const prisma = { learningProject: { findUnique: jest.fn() } };
    const service = createService(prisma);
    await expect(service.create(owner.userId, undefined, { question: '问题' }))
      .rejects.toThrow(BadRequestException);
    await expect(service.create(owner.userId, 'not-a-uuid', { question: '问题' }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.learningProject.findUnique).not.toHaveBeenCalled();
  });

  it('archives the project and atomically cancels queued/running jobs', async () => {
    const tx = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1', userId: owner.userId, status: LearningProjectStatus.planning,
        }),
        update: jest.fn(),
      },
      aiGenerationJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = createService(prisma);

    await service.archive('project-1', owner);

    expect(tx.learningProject.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: expect.objectContaining({ status: LearningProjectStatus.archived }),
    });
    expect(tx.aiGenerationJob.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.aiGenerationJob.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        status: AiJobStatus.cancelled,
        enqueueStatus: AiEnqueueStatus.cancelled,
        executionLeaseOwner: null,
      }),
    }));
    expect(tx.aiGenerationJob.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ providerRequestStartedAt: { not: null } }),
      data: expect.objectContaining({
        enqueueStatus: AiEnqueueStatus.cancelled,
        cancelRequestedAt: expect.any(Date),
      }),
    }));
    expect(tx.aiGenerationJob.updateMany.mock.calls[1][0].data).not.toHaveProperty('status');
    expect(tx.aiGenerationJob.updateMany.mock.calls[1][0].data).not.toHaveProperty('finishedAt');
    expect(tx.aiGenerationJob.updateMany.mock.calls[1][0].data).not.toHaveProperty('executionLeaseOwner');
  });

  it('only advances activity when occurredAt is newer and normalizes a missing block', async () => {
    const prisma = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1',
          userId: owner.userId,
          courseId: 'course-1',
          status: LearningProjectStatus.learning,
          planSnapshot: null,
          planApprovedAt: null,
          activeLessonId: null,
          progressPercent: 0,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lesson: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lesson-1',
          content: { blocks: [{ id: 'block-1', type: 'paragraph' }] },
        }),
      },
    };
    const service = createService(prisma);
    await service.updateActivity('project-1', owner, {
      lessonId: 'lesson-1',
      blockId: 'removed-block',
      blockOffset: 42,
      occurredAt: '2026-08-22T10:00:00.000Z',
    });

    expect(prisma.lesson.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        chapter: { courseId: 'course-1', deletedAt: null },
      }),
    }));
    expect(prisma.learningProject.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        OR: [
          { lastAccessedAt: null },
          { lastAccessedAt: { lt: new Date('2026-08-22T10:00:00.000Z') } },
        ],
      },
      data: {
        activeLessonId: 'lesson-1',
        activeBlockId: null,
        activeBlockOffset: null,
        lastAccessedAt: new Date('2026-08-22T10:00:00.000Z'),
      },
    });
  });

  it('does not reveal a job owned by another user', async () => {
    const prisma = {
      aiGenerationJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'job-1',
          projectId: 'project-1',
          project: { id: 'project-1', userId: 'different-owner' },
        }),
      },
    };
    const service = createService(prisma);
    await expect(service.getJob('project-1', 'job-1', owner))
      .rejects.toThrow(NotFoundException);
  });

  it('patches the authoritative snapshot and preferences with a version CAS', async () => {
    const tx = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1', userId: owner.userId, courseId: 'course-1',
          status: LearningProjectStatus.plan_ready, planVersion: 1, planApprovedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      course: { update: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = createService(prisma);
    jest.spyOn(service, 'getProject').mockResolvedValue({ id: 'project-1' } as never);
    const plan = editablePlan();
    plan.preferences.depth = 'deep';

    await service.patchPlan('project-1', owner, plan);

    expect(tx.learningProject.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        status: LearningProjectStatus.plan_ready,
        planVersion: 1,
        planApprovedAt: null,
      },
      data: expect.objectContaining({
        planVersion: { increment: 1 },
        preferences: expect.objectContaining({
          depth: 'deep', includeMath: false, includeCode: true,
        }),
        planSnapshot: expect.objectContaining({
          title: plan.title,
          preferences: expect.objectContaining({ depth: 'deep' }),
        }),
      }),
    });
    expect(tx.course.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: expect.objectContaining({
        title: plan.title,
        duration: '120 分钟',
        level: 'Intermediate',
      }),
    });
  });

  it('returns 409 when patch planVersion is stale', async () => {
    const tx = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1', userId: owner.userId, courseId: 'course-1',
          status: LearningProjectStatus.plan_ready, planVersion: 2, planApprovedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      course: { update: jest.fn() },
    };
    const service = createService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    });
    await expect(service.patchPlan('project-1', owner, editablePlan()))
      .rejects.toThrow(ConflictException);
    expect(tx.course.update).not.toHaveBeenCalled();
  });

  it.each([
    ['all lessons hidden', (plan: ReturnType<typeof editablePlan>) => {
      plan.chapters.forEach((chapter) => chapter.lessons.forEach((lesson) => {
        lesson.isHidden = true;
      }));
    }],
    ['duplicate tempKey', (plan: ReturnType<typeof editablePlan>) => {
      plan.chapters[1].tempKey = plan.chapters[0].tempKey;
    }],
    ['unknown concept key', (plan: ReturnType<typeof editablePlan>) => {
      plan.chapters[0].lessons[0].conceptKeys = ['missing-concept'];
    }],
  ])('rejects an editable plan with %s', async (_label, mutate) => {
    const tx = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1', userId: owner.userId, courseId: 'course-1',
          status: LearningProjectStatus.plan_ready, planVersion: 1, planApprovedAt: null,
        }),
      },
    };
    const service = createService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    });
    const plan = editablePlan();
    mutate(plan);
    await expect(service.patchPlan('project-1', owner, plan))
      .rejects.toThrow(BadRequestException);
  });

  it('materializes the plan and chooses the first visible lesson on approve', async () => {
    const plan = editablePlan();
    plan.chapters[0].lessons[0].isHidden = true;
    const tx = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1', userId: owner.userId, courseId: 'course-1',
          status: LearningProjectStatus.plan_ready, planVersion: 1,
          planSnapshot: plan, preferences: plan.preferences,
          planApprovedAt: null, activeLessonId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      progressRecord: { count: jest.fn().mockResolvedValue(0) },
      course: { update: jest.fn() },
      courseConcept: {
        deleteMany: jest.fn(),
        create: jest.fn(({ data }: { data: { key: string } }) =>
          Promise.resolve({ id: `concept-${data.key}` })),
      },
      chapter: {
        deleteMany: jest.fn(),
        create: jest.fn(({ data }: { data: { orderIndex: number } }) =>
          Promise.resolve({ id: `chapter-${data.orderIndex}` })),
      },
      lesson: {
        create: jest.fn(({ data }: { data: { title: string } }) =>
          Promise.resolve({ id: data.title === '什么是幻觉' ? 'lesson-hidden' : `lesson-${data.title}` })),
      },
      lessonContent: { create: jest.fn(), update: jest.fn() },
      lessonConcept: { createMany: jest.fn() },
      aiGenerationJob: { create: jest.fn().mockResolvedValue({ id: 'job-first' }) },
      userAiProviderConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = createService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    });

    await expect(service.approvePlan('project-1', owner, 1)).resolves.toEqual({
      projectId: 'project-1',
      courseId: 'course-1',
      firstLessonId: 'lesson-训练与生成',
      jobId: 'job-first',
      status: 'generating_first_lesson',
      continueHref: '/ai-courses/project-1/learn/lesson-训练与生成',
    });
    expect(tx.chapter.create).toHaveBeenCalledTimes(3);
    expect(tx.lessonContent.create).toHaveBeenCalledTimes(3);
    expect(tx.lessonContent.update).toHaveBeenCalledWith({
      where: { lessonId: 'lesson-训练与生成' },
      data: { status: 'queued' },
    });
    expect(tx.aiGenerationJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lessonId: 'lesson-训练与生成',
        type: AiJobType.lesson_content,
        enqueueStatus: AiEnqueueStatus.pending,
        targetVersion: 1,
      }),
    }));
  });

  it('returns the existing lesson execution for an idempotent repeated approve', async () => {
    const tx = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1', userId: owner.userId, courseId: 'course-1',
          status: LearningProjectStatus.generating_first_lesson, planVersion: 1,
          planSnapshot: editablePlan(), preferences: editablePlan().preferences,
          planApprovedAt: new Date(), activeLessonId: 'lesson-first',
        }),
      },
      aiGenerationJob: { findFirst: jest.fn().mockResolvedValue({ id: 'job-existing' }) },
    };
    const service = createService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    });
    await expect(service.approvePlan('project-1', owner, 1)).resolves.toEqual({
      projectId: 'project-1', courseId: 'course-1', firstLessonId: 'lesson-first',
      jobId: 'job-existing', status: 'generating_first_lesson',
      continueHref: '/ai-courses/project-1/learn/lesson-first',
    });
    expect(tx.aiGenerationJob.findFirst).toHaveBeenCalled();
  });

  it('returns 409 before materialization when approve planVersion is stale', async () => {
    const tx = {
      learningProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'project-1', userId: owner.userId, courseId: 'course-1',
          status: LearningProjectStatus.plan_ready, planVersion: 2,
          planSnapshot: editablePlan(), preferences: editablePlan().preferences,
          planApprovedAt: null, activeLessonId: null,
        }),
        updateMany: jest.fn(),
      },
    };
    const service = createService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    });
    await expect(service.approvePlan('project-1', owner, 1))
      .rejects.toThrow(ConflictException);
    expect(tx.learningProject.updateMany).not.toHaveBeenCalled();
  });
});
