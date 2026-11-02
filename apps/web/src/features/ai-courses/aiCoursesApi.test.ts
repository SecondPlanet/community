import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiCoursesApi } from './aiCoursesApi';

vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import api from '../../lib/api';

describe('aiCoursesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: {} });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
  });

  it('uses the project collection routes and preserves Idempotency-Key', async () => {
    const input = { question: '为什么大模型会产生幻觉？' };

    await aiCoursesApi.listProjects({ cursor: 'next', limit: 20, archived: false });
    await aiCoursesApi.getProject('project/1');
    await aiCoursesApi.createProject(input, 'request-uuid');

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/v1/learning-projects/me', {
      params: { cursor: 'next', limit: 20, archived: false },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/v1/learning-projects/project%2F1');
    expect(api.post).toHaveBeenCalledWith('/api/v1/learning-projects', input, {
      headers: { 'Idempotency-Key': 'request-uuid' },
    });
  });

  it('uses plan patch and approve contracts', async () => {
    const plan = { planVersion: 3 } as Parameters<typeof aiCoursesApi.patchPlan>[1];

    await aiCoursesApi.patchPlan('project-1', plan);
    await aiCoursesApi.approvePlan('project-1', 3);

    expect(api.patch).toHaveBeenCalledWith('/api/v1/learning-projects/project-1/plan', plan);
    expect(api.post).toHaveBeenCalledWith('/api/v1/learning-projects/project-1/plan/approve', {
      planVersion: 3,
    });
  });

  it('uses job, content, variant, and activity routes', async () => {
    await aiCoursesApi.getJob('project-1', 'job-1');
    await aiCoursesApi.retryJob('project-1', 'job-1');
    await aiCoursesApi.getLessonContent('project-1', 'lesson-1');
    await aiCoursesApi.generateLessonContent('project-1', 'lesson-1', 'regenerate', 'stable-generation-key');
    await aiCoursesApi.createLessonVariant('project-1', 'lesson-1', 'new_example', 'block-2', 'stable-variant-key');
    await aiCoursesApi.updateActivity('project-1', {
      lessonId: 'lesson-1',
      blockId: 'block-2',
      blockOffset: 42,
      occurredAt: '2026-08-22T08:00:00.000Z',
    });

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/v1/learning-projects/project-1/jobs/job-1');
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/v1/learning-projects/project-1/jobs/job-1/retry');
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/v1/learning-projects/project-1/lessons/lesson-1/content');
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/learning-projects/project-1/lessons/lesson-1/generate',
      { mode: 'regenerate' },
      { headers: { 'Idempotency-Key': 'stable-generation-key' } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      '/api/v1/learning-projects/project-1/lessons/lesson-1/variants',
      { action: 'new_example', blockId: 'block-2' },
      { headers: { 'Idempotency-Key': 'stable-variant-key' } },
    );
    expect(api.patch).toHaveBeenCalledWith('/api/v1/learning-projects/project-1/activity', {
      lessonId: 'lesson-1',
      blockId: 'block-2',
      blockOffset: 42,
      occurredAt: '2026-08-22T08:00:00.000Z',
    });
  });

  it('uses assessment and attempt routes', async () => {
    const submission = {
      clientSubmissionKey: 'submission-1',
      answers: [{ questionId: 'q1', answer: 'B', confidence: 'high' as const }],
    };

    await aiCoursesApi.createAssessment('project-1', 'lesson-1', 'stable-assessment-key');
    await aiCoursesApi.getAssessment('project-1', 'assessment-1');
    await aiCoursesApi.submitAssessmentAttempt('project-1', 'assessment-1', submission);
    await aiCoursesApi.getAssessmentAttempt('project-1', 'assessment-1', 'attempt-1');

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/learning-projects/project-1/lessons/lesson-1/assessments',
      undefined,
      { headers: { 'Idempotency-Key': 'stable-assessment-key' } },
    );
    expect(api.get).toHaveBeenNthCalledWith(
      1,
      '/api/v1/learning-projects/project-1/assessments/assessment-1',
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/learning-projects/project-1/assessments/assessment-1/attempts',
      submission,
    );
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      '/api/v1/learning-projects/project-1/assessments/assessment-1/attempts/attempt-1',
    );
  });

  it('uses learning-home plus archive and restore endpoints', async () => {
    await aiCoursesApi.getLearningHome('cursor-1');
    await aiCoursesApi.archiveProject('project-1');
    await aiCoursesApi.restoreProject('project-1');

    expect(api.get).toHaveBeenCalledWith('/api/v1/learning-home', {
      params: { cursor: 'cursor-1' },
    });
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/v1/learning-projects/project-1/archive');
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/v1/learning-projects/project-1/restore');
  });

  it('uses the project-bound Tutor session and message contracts', async () => {
    await aiCoursesApi.listTutorSessions('project/1');
    await aiCoursesApi.createTutorSession('project/1', 'lesson/1');
    await aiCoursesApi.getTutorSession('project/1', 'session/1');
    await aiCoursesApi.sendTutorMessage('project/1', 'session/1', '请换个例子', 'lesson/2');

    expect(api.get).toHaveBeenNthCalledWith(
      1,
      '/api/v1/learning-projects/project%2F1/chat/sessions',
    );
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/learning-projects/project%2F1/chat/sessions',
      { lessonId: 'lesson/1' },
    );
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      '/api/v1/learning-projects/project%2F1/chat/sessions/session%2F1',
      { params: { limit: 50 } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/learning-projects/project%2F1/chat/sessions/session%2F1/messages',
      { content: '请换个例子', lessonId: 'lesson/2' },
    );
  });
});
