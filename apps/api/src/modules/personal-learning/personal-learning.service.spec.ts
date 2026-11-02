import {
  AiEnqueueStatus,
  AiJobStatus,
  AiJobType,
  AssessmentAttemptStatus,
  AssessmentKind,
  AssessmentStatus,
  LearningProjectStatus,
  LessonContentStatus,
  UserRole,
} from '@prisma/client';
import { ProjectAccessPolicyService } from '../../common/project-access/project-access-policy.service';
import {
  AssessmentAnswerConfidenceDto,
  LessonGenerationModeDto,
  LessonVariantActionDto,
} from './personal-learning.dto';
import { PersonalLearningService } from './personal-learning.service';

const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174000';
const SUBMISSION_KEY = '123e4567-e89b-42d3-a456-426614174001';
const PRINCIPAL = { userId: 'user-1', role: UserRole.student };

const readyContent = {
  id: 'content-1',
  lessonId: 'lesson-1',
  status: LessonContentStatus.ready,
  schemaVersion: 1,
  version: 1,
  blocks: [{ id: 'block-1', type: 'paragraph', markdown: 'Safe content', conceptKeys: [] }],
  summary: 'Summary',
  glossary: null,
  sourceMode: 'model_knowledge',
  generationNote: null,
  generatedAt: new Date('2026-08-23T00:00:00Z'),
  createdAt: new Date('2026-08-23T00:00:00Z'),
  updatedAt: new Date('2026-08-23T00:00:00Z'),
};

function questions(subjective = false) {
  return [
    {
      id: 'q1',
      type: 'single_choice',
      prompt: 'Pick one',
      options: [
        { id: 'A', text: 'Wrong', isCorrect: false },
        { id: 'B', text: 'Right', isCorrect: true },
      ],
      correctAnswer: 'B',
      rubric: { secret: true },
      conceptKeys: ['private-weight'],
      explanation: 'Because B is right',
    },
    ...(subjective
      ? [{
          id: 'q2',
          type: 'short_answer',
          prompt: 'Explain it',
          rubric: { expected: 'secret rubric' },
          conceptKeys: ['hidden'],
        }]
      : []),
  ];
}

function makeHarness(content: typeof readyContent | null = readyContent) {
  const project = {
    id: 'project-1',
    userId: 'user-1',
    courseId: 'course-1',
    status: LearningProjectStatus.learning,
  };
  const lesson = {
    id: 'lesson-1',
    chapterId: 'chapter-1',
    title: 'Lesson',
    description: 'Objective',
    content,
  };
  const prisma: any = {
    learningProject: {
      findUnique: jest.fn(async () => project),
      findFirst: jest.fn(async () => ({ status: project.status })),
    },
    lesson: { findFirst: jest.fn(async () => lesson) },
    lessonContent: {
      findUnique: jest.fn(async () => content),
      create: jest.fn(async ({ data }: any) => ({ id: 'content-new', version: 1, ...data })),
      update: jest.fn(async ({ data }: any) => ({ ...content, ...data })),
    },
    aiGenerationJob: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'job-1', ...data })),
      delete: jest.fn(async () => ({ id: 'job-1' })),
    },
    userAiProviderConfig: { findFirst: jest.fn(async () => null) },
    lessonVariant: {
      create: jest.fn(async () => ({ id: 'variant-1' })),
    },
    assessment: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({
        id: 'assessment-1', schemaVersion: 1, questions: null, errorCode: null,
        createdAt: new Date(), ...data,
      })),
      update: jest.fn(async ({ data }: any) => ({ id: 'assessment-1', ...data })),
      delete: jest.fn(async () => ({ id: 'assessment-1' })),
    },
    assessmentAttempt: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'attempt-1', errorCode: null, ...data })),
      delete: jest.fn(async () => ({ id: 'attempt-1' })),
    },
    $transaction: jest.fn(async (work: any) => work(prisma)),
  };
  const service = new PersonalLearningService(
    prisma,
    new ProjectAccessPolicyService(),
  );
  return { service, prisma, project, lesson };
}

function readyAssessment(subjective = false) {
  return {
    id: 'assessment-1',
    projectId: 'project-1',
    lessonId: 'lesson-1',
    kind: AssessmentKind.lesson_check,
    status: AssessmentStatus.ready,
    lessonContentVersion: 1,
    schemaVersion: 1,
    questions: questions(subjective),
    errorCode: null,
    createdAt: new Date(),
    project: {
      id: 'project-1', userId: 'user-1', courseId: 'course-1', status: LearningProjectStatus.learning,
    },
    lesson: {
      deletedAt: null,
      chapter: { courseId: 'course-1', deletedAt: null },
    },
  };
}

describe('PersonalLearningService', () => {
  it('returns lesson content only after project access and course ownership checks', async () => {
    const { service, prisma } = makeHarness();

    const result = await service.getLessonContent('project-1', 'lesson-1', PRINCIPAL);

    expect(result).toMatchObject({
      lessonId: 'lesson-1',
      status: LessonContentStatus.ready,
      version: 1,
      blocks: readyContent.blocks,
    });
    expect(prisma.lesson.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'lesson-1',
        chapter: { courseId: 'course-1', deletedAt: null },
      }),
    }));

    await expect(service.getLessonContent(
      'project-1',
      'lesson-1',
      { userId: 'other', role: UserRole.student },
    )).rejects.toThrow('Learning project not found');
  });

  it('keeps ready content unchanged while enqueueing regeneration for version+1', async () => {
    const { service, prisma } = makeHarness();

    const result = await service.generateLesson(
      'project-1',
      'lesson-1',
      PRINCIPAL,
      IDEMPOTENCY_KEY,
      { mode: LessonGenerationModeDto.regenerate },
    );

    expect(result).toMatchObject({
      jobId: 'job-1', targetVersion: 2, contentVersion: 1, regenerating: true,
    });
    expect(prisma.lessonContent.update).not.toHaveBeenCalled();
    expect(prisma.aiGenerationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: AiJobType.lesson_content,
        status: AiJobStatus.queued,
        enqueueStatus: AiEnqueueStatus.pending,
        targetVersion: 2,
      }),
      select: { id: true, status: true, targetVersion: true },
    });
  });

  it('requires explicit regenerate mode for ready content', async () => {
    const { service, prisma } = makeHarness();

    await expect(service.generateLesson(
      'project-1', 'lesson-1', PRINCIPAL, IDEMPOTENCY_KEY,
      { mode: LessonGenerationModeDto.generate },
    )).rejects.toThrow('Use mode=regenerate');
    expect(prisma.aiGenerationJob.create).not.toHaveBeenCalled();
  });

  it('replays the same lesson-generation idempotency key without creating another job', async () => {
    const { service, prisma } = makeHarness();
    prisma.aiGenerationJob.findUnique.mockResolvedValue({
      id: 'existing-job', status: AiJobStatus.queued, targetVersion: 2,
    });

    const result = await service.generateLesson(
      'project-1',
      'lesson-1',
      PRINCIPAL,
      IDEMPOTENCY_KEY,
      { mode: LessonGenerationModeDto.regenerate },
    );

    expect(result).toMatchObject({ jobId: 'existing-job', targetVersion: 2 });
    expect(prisma.aiGenerationJob.create).not.toHaveBeenCalled();
  });

  it('creates a version-bound variant job and placeholder', async () => {
    const { service, prisma } = makeHarness();

    const result = await service.createVariant(
      'project-1',
      'lesson-1',
      PRINCIPAL,
      IDEMPOTENCY_KEY,
      { action: LessonVariantActionDto.deepen, blockId: 'block-1' },
    );

    expect(result).toEqual({
      variantId: 'variant-1', jobId: 'job-1', status: AiJobStatus.queued, contentVersion: 1,
    });
    expect(prisma.lessonVariant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lessonContentVersion: 1, blockId: 'block-1', jobId: 'job-1' }),
      select: { id: true },
    });
  });

  it('rejects variants scoped to an unknown block', async () => {
    const { service, prisma } = makeHarness();

    await expect(service.createVariant(
      'project-1',
      'lesson-1',
      PRINCIPAL,
      IDEMPOTENCY_KEY,
      { action: LessonVariantActionDto.simplify, blockId: 'other-block' },
    )).rejects.toThrow('Lesson content block not found');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates one assessment generation job for the current ready version', async () => {
    const { service, prisma } = makeHarness();

    const result = await service.createAssessment(
      'project-1', 'lesson-1', PRINCIPAL, IDEMPOTENCY_KEY,
    );

    expect(result).toMatchObject({
      assessmentId: 'assessment-1', status: AssessmentStatus.generating, jobId: 'job-1',
    });
    expect(prisma.assessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lessonContentVersion: 1, kind: AssessmentKind.lesson_check }),
    });
    expect(prisma.aiGenerationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: AiJobType.assessment_generate,
        enqueueStatus: AiEnqueueStatus.pending,
        targetVersion: 1,
      }),
      select: { id: true },
    });
  });

  it('projects ready assessment questions without answers, rubrics, weights or option flags', async () => {
    const { service, prisma } = makeHarness();
    prisma.assessment.findFirst.mockResolvedValue(readyAssessment());

    const result = await service.getAssessment('project-1', 'assessment-1', PRINCIPAL);

    expect(result.questions).toEqual([{
      id: 'q1',
      type: 'single_choice',
      prompt: 'Pick one',
      options: [{ id: 'A', text: 'Wrong' }, { id: 'B', text: 'Right' }],
    }]);
    expect(JSON.stringify(result)).not.toMatch(/correctAnswer|rubric|conceptKeys|isCorrect|explanation/);
  });

  it('rejects an assessment whose lesson belongs to another course', async () => {
    const { service, prisma } = makeHarness();
    const assessment = readyAssessment();
    prisma.assessment.findFirst.mockResolvedValue({
      ...assessment,
      lesson: { ...assessment.lesson, chapter: { courseId: 'other-course', deletedAt: null } },
    });

    await expect(
      service.getAssessment('project-1', 'assessment-1', PRINCIPAL),
    ).rejects.toThrow('Assessment not found');
  });

  it('grades pure single-choice attempts synchronously and stores post-submit feedback', async () => {
    const { service, prisma } = makeHarness();
    const assessment = readyAssessment();
    prisma.assessment.findFirst.mockImplementation(async ({ include }: any) =>
      include?.project
        ? assessment
        : { ...assessment, lesson: { content: readyContent } },
    );

    const result = await service.submitAttempt('project-1', 'assessment-1', PRINCIPAL, {
      clientSubmissionKey: SUBMISSION_KEY,
      answers: [{
        questionId: 'q1', answer: 'B', confidence: AssessmentAnswerConfidenceDto.high,
      }],
    });

    expect(result).toMatchObject({
      attemptId: 'attempt-1', status: AssessmentAttemptStatus.completed, score: 100,
    });
    expect(prisma.assessmentAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: AssessmentAttemptStatus.completed,
        score: 100,
        grading: expect.objectContaining({
          items: [expect.objectContaining({ questionId: 'q1', verdict: 'correct', correctAnswer: 'B' })],
        }),
      }),
    });
    expect(prisma.aiGenerationJob.create).not.toHaveBeenCalled();
  });

  it('creates an assessment_grade pending job bound to a subjective attempt', async () => {
    const { service, prisma } = makeHarness();
    const assessment = readyAssessment(true);
    prisma.assessment.findFirst.mockImplementation(async ({ include }: any) =>
      include?.project
        ? assessment
        : { ...assessment, lesson: { content: readyContent } },
    );

    const result = await service.submitAttempt('project-1', 'assessment-1', PRINCIPAL, {
      clientSubmissionKey: SUBMISSION_KEY,
      answers: [
        { questionId: 'q1', answer: 'B', confidence: AssessmentAnswerConfidenceDto.high },
        { questionId: 'q2', answer: 'My explanation', confidence: AssessmentAnswerConfidenceDto.low },
      ],
    });

    expect(result).toEqual({
      attemptId: 'attempt-1', jobId: 'job-1', status: AssessmentAttemptStatus.grading,
    });
    expect(prisma.aiGenerationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptId: 'attempt-1',
        type: AiJobType.assessment_grade,
        enqueueStatus: AiEnqueueStatus.pending,
      }),
      select: { id: true },
    });
  });

  it('rejects attempts against a stale lesson-content version', async () => {
    const { service, prisma } = makeHarness();
    const assessment = readyAssessment();
    prisma.assessment.findFirst.mockImplementation(async ({ include }: any) =>
      include?.project
        ? assessment
        : { ...assessment, lesson: { content: { ...readyContent, version: 2 } } },
    );

    await expect(service.submitAttempt('project-1', 'assessment-1', PRINCIPAL, {
      clientSubmissionKey: SUBMISSION_KEY,
      answers: [{
        questionId: 'q1', answer: 'B', confidence: AssessmentAnswerConfidenceDto.medium,
      }],
    })).rejects.toThrow('Assessment is stale');
    expect(prisma.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it('replays an attempt by clientSubmissionKey and rejects changed answers', async () => {
    const { service, prisma } = makeHarness();
    const assessment = readyAssessment();
    prisma.assessment.findFirst.mockResolvedValue(assessment);
    prisma.assessmentAttempt.findUnique.mockResolvedValue({
      id: 'attempt-existing',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      clientSubmissionKey: SUBMISSION_KEY,
      answers: [{ questionId: 'q1', answer: 'B', confidence: 'high' }],
      status: AssessmentAttemptStatus.completed,
      score: 100,
      grading: { items: [] },
      recommendation: { nextStep: 'continue' },
      errorCode: null,
      gradingJobs: [],
    });

    const replay = await service.submitAttempt('project-1', 'assessment-1', PRINCIPAL, {
      clientSubmissionKey: SUBMISSION_KEY,
      answers: [{ questionId: 'q1', answer: 'B', confidence: AssessmentAnswerConfidenceDto.high }],
    });
    expect(replay).toMatchObject({
      attemptId: 'attempt-existing', status: AssessmentAttemptStatus.completed, score: 100,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();

    await expect(service.submitAttempt('project-1', 'assessment-1', PRINCIPAL, {
      clientSubmissionKey: SUBMISSION_KEY,
      answers: [{ questionId: 'q1', answer: 'A', confidence: AssessmentAnswerConfidenceDto.high }],
    })).rejects.toThrow('Idempotency key was already used with different answers');
  });

  it('returns only status and job id while a subjective attempt is grading', async () => {
    const { service, prisma } = makeHarness();
    prisma.assessment.findFirst.mockResolvedValue(readyAssessment(true));
    prisma.assessmentAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      status: AssessmentAttemptStatus.grading,
      score: null,
      grading: null,
      recommendation: null,
      errorCode: null,
      gradingJobs: [{
        id: 'grade-job', status: AiJobStatus.queued, errorCode: null, manualRetries: 0,
      }],
    });

    await expect(service.getAttempt(
      'project-1', 'assessment-1', 'attempt-1', PRINCIPAL,
    )).resolves.toEqual({
      attemptId: 'attempt-1', status: AssessmentAttemptStatus.grading, jobId: 'grade-job',
    });
  });

  it('completed view 不含 correctAnswer,但 explanation/misconceptions/feedback/mastery/message 保留', async () => {
    const { service, prisma } = makeHarness();
    const assessment = readyAssessment();
    prisma.assessment.findFirst.mockImplementation(async ({ include }: any) =>
      include?.project
        ? assessment
        : { ...assessment, lesson: { content: readyContent } },
    );

    const result = await service.submitAttempt('project-1', 'assessment-1', PRINCIPAL, {
      clientSubmissionKey: SUBMISSION_KEY,
      answers: [{
        questionId: 'q1', answer: 'A', confidence: AssessmentAnswerConfidenceDto.medium,
      }],
    });

    // DB 层仍保留 correctAnswer 供 teacher review / audit 使用 —— API 出口层
    // 才会剥掉，断言写入数据库的 grading 仍含 correctAnswer。
    expect(prisma.assessmentAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: AssessmentAttemptStatus.completed,
        grading: expect.objectContaining({
          items: [expect.objectContaining({
            questionId: 'q1', verdict: 'incorrect', correctAnswer: 'B',
          })],
        }),
      }),
    });

    // API 响应层：correctAnswer 已剥掉，explanation 仍保留。
    expect(result.status).toBe(AssessmentAttemptStatus.completed);
    const completed = result as Extract<typeof result, { status: 'completed' }>;
    expect(completed.grading).not.toBeNull();
    const items = (completed.grading as { items: Array<Record<string, unknown>> }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty('correctAnswer');
    expect(items[0]).toMatchObject({ questionId: 'q1', verdict: 'incorrect' });
    expect(items[0].explanation).toBe('Because B is right');
  });
});
