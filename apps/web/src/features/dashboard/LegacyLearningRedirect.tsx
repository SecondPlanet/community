import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { aiCoursesApi } from '../ai-courses/aiCoursesApi';
import { learningHomeKeys } from '../ai-courses/queryKeys';

export function canonicalLearningHref(href: string) {
  const legacy = href.match(/^\/dashboard\/learning\/([^/]+)\/([^/?#]+)([?#].*)?$/);
  return legacy
    ? `/dashboard/learning/${legacy[1]}/lessons/${legacy[2]}${legacy[3] ?? ''}`
    : href;
}

export function LegacyLearningRedirect() {
  const { courseId, lessonId } = useParams<{ courseId?: string; lessonId?: string }>();
  const navigate = useNavigate();
  const home = useQuery({
    queryKey: learningHomeKeys.all,
    queryFn: () => aiCoursesApi.getLearningHome(),
    enabled: !courseId,
  });

  useEffect(() => {
    if (courseId && lessonId) {
      navigate(`/dashboard/learning/${courseId}/lessons/${lessonId}`, { replace: true });
      return;
    }
    if (courseId) {
      navigate(`/courses/${courseId}`, { replace: true });
      return;
    }
    const href = home.data?.items[0]?.continueHref;
    if (href) navigate(canonicalLearningHref(href), { replace: true });
    else if (home.data && home.data.items.length === 0) navigate('/dashboard', { replace: true });
  }, [courseId, home.data, lessonId, navigate]);

  if (home.isError) return <Navigate to="/dashboard" replace />;
  return <div role="status" className="flex min-h-[50dvh] items-center justify-center text-sm text-neutral-700 dark:text-neutral-200">正在恢复学习位置…</div>;
}
