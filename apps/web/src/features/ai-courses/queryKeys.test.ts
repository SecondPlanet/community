import { describe, expect, it } from 'vitest';
import type { AiGenerationJobView } from './aiCourses.types';
import {
  aiCourseKeys,
  getAiJobPollingInterval,
  isAiJobTerminal,
  learningHomeKeys,
} from './queryKeys';

describe('ai course query keys', () => {
  it('nests project resources below a stable project identity', () => {
    expect(aiCourseKeys.list({ limit: 20 })).toEqual(['ai-courses', 'list', { limit: 20 }]);
    expect(aiCourseKeys.detail('project-1')).toEqual(['ai-courses', 'detail', 'project-1']);
    expect(aiCourseKeys.job('project-1', 'job-1')).toEqual([
      'ai-courses',
      'detail',
      'project-1',
      'job',
      'job-1',
    ]);
    expect(aiCourseKeys.lessonContent('project-1', 'lesson-1')).toEqual([
      'ai-courses',
      'detail',
      'project-1',
      'lesson-content',
      'lesson-1',
    ]);
    expect(aiCourseKeys.attempt('project-1', 'assessment-1', 'attempt-1')).toEqual([
      'ai-courses',
      'detail',
      'project-1',
      'assessment',
      'assessment-1',
      'attempt',
      'attempt-1',
    ]);
    expect(aiCourseKeys.tutorSessions('project-1')).toEqual([
      'ai-courses',
      'detail',
      'project-1',
      'tutor-sessions',
    ]);
    expect(learningHomeKeys.list()).toEqual(['learning-home', null]);
  });
});

describe('AI job polling helpers', () => {
  const running: AiGenerationJobView = {
    id: 'job-1',
    type: 'lesson_content',
    status: 'running',
    progress: 50,
    currentStep: '正在生成示例',
    retryable: false,
    errorCode: null,
  };

  it('polls active jobs based on page visibility', () => {
    expect(isAiJobTerminal(running)).toBe(false);
    expect(getAiJobPollingInterval(running, true)).toBe(2000);
    expect(getAiJobPollingInterval(running, false)).toBe(10000);
    expect(getAiJobPollingInterval(undefined, true)).toBe(2000);
  });

  it.each(['succeeded', 'failed', 'cancelled'] as const)('stops polling a %s job', (status) => {
    const terminal = {
      id: 'job-1',
      type: 'lesson_content',
      status,
      ...(status === 'succeeded'
        ? { resultRef: { projectId: 'project-1' } }
        : status === 'failed'
          ? { errorCode: 'FAILED', errorMessage: 'failed', retryable: true, manualRetries: 0 }
          : { retryable: false }),
    } as AiGenerationJobView;

    expect(isAiJobTerminal(terminal)).toBe(true);
    expect(getAiJobPollingInterval(terminal)).toBe(false);
  });
});
