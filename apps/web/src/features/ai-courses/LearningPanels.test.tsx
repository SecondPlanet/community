import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssessmentPanel } from './AssessmentPanel';
import { ProjectTutorPanel } from './ProjectTutorPanel';
import { aiCoursesApi } from './aiCoursesApi';
import type { AssessmentView, TutorSessionView } from './aiCourses.types';

const { createLearningEvent } = vi.hoisted(() => ({ createLearningEvent: vi.fn().mockResolvedValue({}) }));
vi.mock('../../lib/learningEventsApi', () => ({ learningEventsApi: { createOne: createLearningEvent } }));

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ProjectTutorPanel', () => {
  beforeEach(() => { vi.restoreAllMocks(); createLearningEvent.mockResolvedValue({}); });
  afterEach(() => vi.restoreAllMocks());

  it('deduplicates automatic session creation across desktop and Drawer instances', async () => {
    const created: TutorSessionView = {
      id: 'session-1',
      projectId: 'project-1',
      courseId: 'course-1',
      lessonId: 'lesson-1',
      title: null,
      scope: 'personal_course_tutor',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    };
    vi.spyOn(aiCoursesApi, 'listTutorSessions').mockResolvedValue({ items: [] });
    const create = vi.spyOn(aiCoursesApi, 'createTutorSession').mockResolvedValue(created);
    vi.spyOn(aiCoursesApi, 'getTutorSession').mockResolvedValue({ ...created, messages: [] });

    renderWithQuery(
      <>
        <ProjectTutorPanel projectId="project-1" lessonId="lesson-1" />
        <ProjectTutorPanel projectId="project-1" lessonId="lesson-1" />
      </>,
    );

    expect(await screen.findAllByText(/你可以让我换一种方式解释/)).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('project-1', 'lesson-1');
  });

  it('creates a persistent simplify variant with an idempotency key', async () => {
    const existing = { id: 'session-1', projectId: 'project-1', courseId: 'course-1', lessonId: 'lesson-1', title: null, scope: 'personal_course_tutor' as const, createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z' };
    vi.spyOn(aiCoursesApi, 'listTutorSessions').mockResolvedValue({ items: [existing] });
    vi.spyOn(aiCoursesApi, 'getTutorSession').mockResolvedValue({ ...existing, messages: [] });
    const createVariant = vi.spyOn(aiCoursesApi, 'createLessonVariant').mockResolvedValue({ variantId: 'variant-1', jobId: 'job-1', status: 'queued', contentVersion: 1 });
    vi.spyOn(aiCoursesApi, 'getJob').mockResolvedValue({ id: 'job-1', type: 'lesson_variant', status: 'succeeded', resultRef: { projectId: 'project-1', lessonId: 'lesson-1', variantId: 'variant-1', variantContent: { title: '简单解释', markdown: '安全补充内容', keyTakeaway: '核心要点' } } });
    renderWithQuery(<ProjectTutorPanel projectId="project-1" lessonId="lesson-1" />);
    fireEvent.click(await screen.findByRole('button', { name: '简单一点' }));
    await screen.findByText('安全补充内容');
    expect(createVariant).toHaveBeenCalledWith('project-1', 'lesson-1', 'simplify', undefined, expect.any(String));
  });
});

describe('AssessmentPanel draft lifecycle', () => {
  const assessment: AssessmentView = {
    id: 'assessment-1',
    lessonId: 'lesson-1',
    kind: 'lesson_check',
    status: 'ready',
    lessonContentVersion: 3,
    schemaVersion: 2,
    questions: [
      { id: 'q1', type: 'single_choice', prompt: '哪个选项正确？', options: ['A', 'B'] },
      { id: 'q2', type: 'teach_back', prompt: '解释核心概念' },
    ],
  };
  const activeKey = 'ai-course-assessment-active:project-1:lesson-1';
  const attemptKey = 'ai-course-assessment-attempt:project-1:lesson-1';
  const draftKey = 'ai-course-assessment:project-1:assessment-1:2';
  const oldDraftKey = 'ai-course-assessment:project-1:assessment-1:1';
  const submissionKey = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.restoreAllMocks();
    createLearningEvent.mockResolvedValue({});
    sessionStorage.clear();
    sessionStorage.setItem(activeKey, 'assessment-1');
    sessionStorage.setItem(oldDraftKey, JSON.stringify({ old: true }));
    sessionStorage.setItem(draftKey, JSON.stringify({
      answers: { q1: 'B', q2: '用自己的话解释' },
      confidence: { q1: 'medium', q2: 'high' },
      currentQuestionIndex: 1,
      clientSubmissionKey: submissionKey,
    }));
    vi.spyOn(aiCoursesApi, 'getAssessment').mockResolvedValue(assessment);
  });

  afterEach(() => vi.restoreAllMocks());

  it('restores answers, current question and confidence, then clears stale schema drafts', async () => {
    renderWithQuery(<AssessmentPanel projectId="project-1" lessonId="lesson-1" />);

    const answer = await screen.findByRole('textbox', { name: '回答：解释核心概念' });
    expect(answer).toHaveValue('用自己的话解释');
    expect(screen.getByRole('radio', { name: '很有把握' })).toBeChecked();
    expect(sessionStorage.getItem(oldDraftKey)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '上一题' }));
    await waitFor(() => expect(screen.getByText('哪个选项正确？')).toHaveFocus());
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked();
  });

  it('reuses the persisted clientSubmissionKey after an ambiguous failed submit', async () => {
    const completed = {
      attemptId: 'attempt-1', status: 'completed' as const, score: 88,
      grading: { feedback: [{ questionId: 'q1', verdict: 'correct' as const, explanation: '你准确识别了关键差异。' }], misconceptions: ['不要把相关性当成因果性'], mastery: [{ conceptKey: 'causality', score: 0.85, evidence: '能够解释反例' }] },
      recommendation: { nextStep: 'continue' as const, message: '理解稳定，可以继续。', continueHref: '/ai-courses/project-1/learn/lesson-2' },
    };
    const submit = vi.spyOn(aiCoursesApi, 'submitAssessmentAttempt')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(completed);
    vi.spyOn(aiCoursesApi, 'getAssessmentAttempt').mockResolvedValue(completed);
    renderWithQuery(<AssessmentPanel projectId="project-1" lessonId="lesson-1" />);

    const button = await screen.findByRole('button', { name: '提交并查看理解反馈' });
    fireEvent.click(button);
    await screen.findByRole('alert');
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const retryButton = screen.getByRole('button', { name: '提交并查看理解反馈' });
    await waitFor(() => expect(retryButton).not.toBeDisabled());
    fireEvent.click(retryButton);

    const result = await screen.findByRole('heading', { name: '本次理解测试' });
    const resultPanel = result.closest('section')!;
    expect(within(resultPanel).getByText('掌握良好')).toBeInTheDocument();
    expect(within(resultPanel).queryByText('88')).not.toBeInTheDocument();
    expect(within(resultPanel).getByText('你准确识别了关键差异。')).toBeInTheDocument();
    expect(within(resultPanel).getByText(/不要把相关性/)).toBeInTheDocument();
    expect(within(resultPanel).getByText(/能够解释反例/)).toBeInTheDocument();
    const nextActions = within(resultPanel).getAllByRole('link');
    expect(nextActions).toHaveLength(1);
    expect(nextActions[0]).toHaveAttribute('href', '/ai-courses/project-1/learn/lesson-2');
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][2].clientSubmissionKey).toBe(submissionKey);
    expect(submit.mock.calls[1][2].clientSubmissionKey).toBe(submissionKey);
    expect(sessionStorage.getItem(draftKey)).toBeNull();
    expect(sessionStorage.getItem(activeKey)).toBe('assessment-1');
    expect(JSON.parse(sessionStorage.getItem(attemptKey)!)).toEqual({
      assessmentId: 'assessment-1', attemptId: 'attempt-1',
    });
  });

  it('restores an asynchronous grading attempt after remounting', async () => {
    const grading = { attemptId: 'attempt-grading', jobId: 'job-grade', status: 'grading' as const };
    vi.spyOn(aiCoursesApi, 'getAssessmentAttempt').mockResolvedValue(grading);
    sessionStorage.setItem(attemptKey, JSON.stringify({
      assessmentId: 'assessment-1', attemptId: 'attempt-grading',
    }));

    const first = renderWithQuery(<AssessmentPanel projectId="project-1" lessonId="lesson-1" />);
    expect(await screen.findByText('AI 正在逐题判断你的理解…')).toBeInTheDocument();
    first.unmount();

    renderWithQuery(<AssessmentPanel projectId="project-1" lessonId="lesson-1" />);
    expect(await screen.findByText('AI 正在逐题判断你的理解…')).toBeInTheDocument();
    expect(aiCoursesApi.getAssessmentAttempt).toHaveBeenLastCalledWith(
      'project-1', 'assessment-1', 'attempt-grading',
    );
    expect(sessionStorage.getItem(draftKey)).not.toBeNull();
  });

  it('uses a new generation key after a terminal failed assessment', async () => {
    sessionStorage.clear();
    const create = vi.spyOn(aiCoursesApi, 'createAssessment')
      .mockResolvedValueOnce({ assessmentId: 'failed-1', jobId: 'job-1', status: 'generating' })
      .mockResolvedValueOnce({ assessmentId: 'next-1', jobId: 'job-2', status: 'generating' });
    vi.spyOn(aiCoursesApi, 'getAssessment').mockImplementation(async (_projectId, id) => ({
      id,
      lessonId: 'lesson-1',
      kind: 'lesson_check',
      status: id === 'failed-1' ? 'failed' : 'generating',
      lessonContentVersion: 1,
      schemaVersion: 1,
      questions: [],
    }));
    renderWithQuery(<AssessmentPanel projectId="project-1" lessonId="lesson-1" />);

    fireEvent.click(screen.getByRole('button', { name: '生成理解测试' }));
    fireEvent.click(await screen.findByRole('button', { name: '重新生成' }));
    fireEvent.click(await screen.findByRole('button', { name: '生成理解测试' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0][2]).not.toBe(create.mock.calls[1][2]);
  });
});
