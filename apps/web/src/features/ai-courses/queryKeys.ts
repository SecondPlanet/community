import type { AiGenerationJobView } from './aiCourses.types';

export interface ProjectListFilters {
  cursor?: string;
  limit?: number;
  archived?: boolean;
}

export const aiCourseKeys = {
  all: ['ai-courses'] as const,
  listRoot: () => [...aiCourseKeys.all, 'list'] as const,
  list: (filters: ProjectListFilters = {}) => [...aiCourseKeys.listRoot(), filters] as const,
  detail: (projectId: string) => [...aiCourseKeys.all, 'detail', projectId] as const,
  plan: (projectId: string) => [...aiCourseKeys.detail(projectId), 'plan'] as const,
  job: (projectId: string, jobId: string) =>
    [...aiCourseKeys.detail(projectId), 'job', jobId] as const,
  lessonContent: (projectId: string, lessonId: string) =>
    [...aiCourseKeys.detail(projectId), 'lesson-content', lessonId] as const,
  assessment: (projectId: string, assessmentId: string) =>
    [...aiCourseKeys.detail(projectId), 'assessment', assessmentId] as const,
  attempt: (projectId: string, assessmentId: string, attemptId: string) =>
    [...aiCourseKeys.assessment(projectId, assessmentId), 'attempt', attemptId] as const,
  tutorSessions: (projectId: string) =>
    [...aiCourseKeys.detail(projectId), 'tutor-sessions'] as const,
  tutorSession: (projectId: string, scope: 'project' | 'lesson', lessonId?: string) =>
    [...aiCourseKeys.detail(projectId), 'tutor', scope, lessonId ?? null] as const,
};

export const learningHomeKeys = {
  all: ['learning-home'] as const,
  list: (cursor?: string) => [...learningHomeKeys.all, cursor ?? null] as const,
};

export function isAiJobTerminal(job: AiGenerationJobView | undefined): boolean {
  return job?.status === 'succeeded' || job?.status === 'failed' || job?.status === 'cancelled';
}

export function getAiJobPollingInterval(
  job: AiGenerationJobView | undefined,
  pageVisible = true,
): 2000 | 10000 | false {
  if (isAiJobTerminal(job)) return false;
  return pageVisible ? 2000 : 10000;
}
