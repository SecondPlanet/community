import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CourseQuestionComposer } from './CourseQuestionComposer';
import { aiCoursesApi } from './aiCoursesApi';
import type { CreateLearningProjectInput } from './aiCourses.types';
import { aiCourseKeys, learningHomeKeys } from './queryKeys';
import { mapAiCourseError } from './aiCourseErrors';
import { Button } from '../../components/ui/Button';

export function CreateAiCoursePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const onboarding = searchParams.get('onboarding') === '1';
  const createRequest = useRef<{ canonicalInput: string; key: string } | null>(null);
  const [retryAt, setRetryAt] = useState<Date | null>(null);
  const create = useMutation({
    mutationFn: (input: CreateLearningProjectInput) => {
      const canonicalInput = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.canonicalInput !== canonicalInput) {
        createRequest.current = { canonicalInput, key: crypto.randomUUID() };
      }
      return aiCoursesApi.createProject(input, createRequest.current.key);
    },
    onSuccess: (project) => {
      // The 202 response is intentionally not a LearningProjectDetail. Putting
      // it under the detail key would keep the incomplete shape fresh for five
      // minutes and crash the plan page when it reads course.title.
      queryClient.removeQueries({ queryKey: aiCourseKeys.detail(project.projectId), exact: true });
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.listRoot() });
      navigate(`/ai-courses/${project.projectId}/plan`);
    },
  });
  const error = create.isError ? mapAiCourseError(create.error) : null;
  useEffect(() => {
    if (error?.retryAfterSeconds) setRetryAt(new Date(Date.now() + error.retryAfterSeconds * 1000));
  }, [error?.retryAfterSeconds]);

  // C-07 方案 A: 注册后 onboarding。如果用户**名下已有 LearningProject**,
  // 直接落首页,跳过 onboarding。getLearningHome 的 items 是混合 ai_personal /
  // platform 的"我的首页"流,长度 > 0 即视为"名下有项目"。
  const learningHome = useQuery({
    queryKey: learningHomeKeys.all,
    queryFn: () => aiCoursesApi.getLearningHome(),
    enabled: onboarding,
    retry: false,
  });
  const [hasRedirected, setHasRedirected] = useState(false);
  useEffect(() => {
    if (!onboarding) return;
    if (hasRedirected) return;
    if (learningHome.isSuccess && learningHome.data.items.length > 0) {
      setHasRedirected(true);
      navigate('/', { replace: true });
    }
  }, [onboarding, hasRedirected, learningHome.isSuccess, learningHome.data, navigate]);

  const handleSkip = () => {
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F1F0EB] px-4 py-8 dark:bg-neutral-950 dark:text-neutral-900 md:px-8 md:py-14 [&_.bg-neutral-0]:dark:bg-neutral-100 [&_.bg-white]:dark:bg-neutral-100 [&_.border-neutral-200]:dark:border-neutral-400 [&_.text-neutral-950]:dark:text-neutral-900 [&_.text-neutral-600]:dark:text-neutral-800 [&_.text-neutral-500]:dark:text-neutral-800 [&_.text-neutral-700]:dark:text-neutral-800 [&_.text-neutral-800]:dark:text-neutral-900">
      <div className="mx-auto max-w-4xl">
        <Link to="/ai-courses" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950">
          <ArrowLeft className="h-4 w-4" /> 返回课程工坊
        </Link>
        <div className="mb-8 mt-5">
          {onboarding && (
            <p className="text-sm font-semibold text-neutral-500">
              欢迎，先告诉 AI 你想学什么
            </p>
          )}
          <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-neutral-950 md:text-6xl">
            从一个真实问题开始。
          </h1>
          {onboarding && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">
                可随时跳过，之后从首页也能开始。
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSkip}
                data-testid="onboarding-skip"
              >
                跳过
              </Button>
            </div>
          )}
        </div>
        <CourseQuestionComposer
          submitting={create.isPending || Boolean(retryAt)}
          error={error?.message ?? null}
          errorActionHref={error?.feedbackHref}
          retryAt={retryAt}
          onRetryReady={() => setRetryAt(null)}
          onSubmit={(input) => create.mutate(input)}
        />
      </div>
    </div>
  );
}