import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { aiCoursesApi } from '../aiCoursesApi';
import { aiCourseKeys, getAiJobPollingInterval, isAiJobTerminal } from '../queryKeys';

export function useAiJob(projectId: string | undefined, jobId: string | null | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: aiCourseKeys.job(projectId ?? '', jobId ?? ''),
    queryFn: () => aiCoursesApi.getJob(projectId!, jobId!),
    enabled: Boolean(projectId && jobId),
    refetchInterval: (state) => getAiJobPollingInterval(
      state.state.data,
      typeof document === 'undefined' || document.visibilityState === 'visible',
    ),
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!projectId || !isAiJobTerminal(query.data)) return;
    void queryClient.invalidateQueries({ queryKey: aiCourseKeys.detail(projectId) });
    void queryClient.invalidateQueries({ queryKey: aiCourseKeys.listRoot() });
    if (query.data?.status !== 'succeeded') return;
    const { lessonId } = query.data.resultRef ?? {};
    if (lessonId && query.data.type === 'lesson_content') {
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.lessonContent(projectId, lessonId), exact: true });
    }
    if (query.data.type === 'course_plan') {
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.plan(projectId), exact: true });
    }
  }, [projectId, query.data, queryClient]);

  return query;
}
