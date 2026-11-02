import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react';
import { aiCoursesApi } from './aiCoursesApi';
import type { EditableCoursePlan, LearningProjectDetail } from './aiCourses.types';
import { aiCourseKeys } from './queryKeys';
import { useAiJob } from './hooks/useAiJob';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { mapAiCourseError } from './aiCourseErrors';
import { getHttpStatus } from '../../lib/apiError';
import { trackAiCourseEvent } from './trackAiCourseEvent';
import { EditableCoursePlanSchema, issueTargetId } from './editableCoursePlanSchema';
import type { ZodIssue } from 'zod';

function GenerationProgress({
  stage,
  progress,
  currentStep,
}: {
  stage: 'plan' | 'lesson';
  progress: number;
  currentStep?: string | null;
}) {
  const steps = stage === 'plan'
    ? ['理解你的问题', '组织知识路径', '设计课程章节', '等待你确认课程蓝图']
    : ['读取课程蓝图', '撰写第一节讲义', '准备理解测试', '即将进入学习'];
  const active = Math.min(steps.length - 1, Math.floor((Math.max(0, progress) / 100) * steps.length));
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm md:p-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
        <LoaderCircle className="h-6 w-6 animate-spin motion-reduce:animate-none" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold text-neutral-950">
        {stage === 'plan' ? '正在设计你的课程' : '正在准备第一节讲义'}
      </h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600">可以先离开这个页面，生成会在后台继续。</p>
      <div className="mt-8 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
        <div className="h-full rounded-full bg-neutral-950 transition-all duration-500" style={{ width: `${Math.max(4, progress)}%` }} />
      </div>
      <p aria-live="polite" className="mt-3 text-sm font-medium text-neutral-800">{currentStep ?? steps[active]}</p>
      <ol className="mt-8 grid gap-3 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-sm', index <= active ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 text-neutral-500')}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs">{index < active ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function move<T>(items: T[], from: number, direction: -1 | 1) {
  const to = from + direction;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function PlanEditor({
  plan,
  disabled,
  onChange,
  onAnnouncement,
}: {
  plan: EditableCoursePlan;
  disabled: boolean;
  onChange(plan: EditableCoursePlan): void;
  onAnnouncement(message: string): void;
}) {
  const visibleCount = plan.chapters.flatMap((chapter) => chapter.lessons).filter((lesson) => !lesson.isHidden).length;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 md:p-8">
        <label className="text-sm font-medium text-neutral-700">
          课程标题
          <input
            id="plan-title"
            value={plan.title}
            disabled={disabled}
            onChange={(event) => onChange({ ...plan, title: event.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-xl font-semibold outline-none focus:border-neutral-950"
          />
        </label>
        <label className="mt-5 block text-sm font-medium text-neutral-700">
          学完后你将能够
          <textarea
            id="plan-learning-outcome"
            value={plan.learningOutcome}
            disabled={disabled}
            onChange={(event) => onChange({ ...plan, learningOutcome: event.target.value })}
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-neutral-200 px-4 py-3 leading-6 outline-none focus:border-neutral-950"
          />
        </label>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-neutral-600">
          <span className="rounded-full bg-neutral-100 px-3 py-1.5">{plan.level}</span>
          <span className="rounded-full bg-neutral-100 px-3 py-1.5">约 {plan.estimatedMinutes} 分钟</span>
          <span className="rounded-full bg-neutral-100 px-3 py-1.5">{visibleCount} 个可见课时</span>
        </div>
      </section>

      {plan.chapters.map((chapter, chapterIndex) => (
        <section key={chapter.tempKey} className="rounded-3xl border border-neutral-200 bg-white p-5 md:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCEBFF] text-sm font-semibold">{chapterIndex + 1}</span>
            <div className="min-w-0 flex-1">
              <input
                id={`plan-chapter-${chapterIndex}-title`}
                value={chapter.title}
                disabled={disabled}
                onChange={(event) => {
                  const chapters = [...plan.chapters];
                  chapters[chapterIndex] = { ...chapter, title: event.target.value };
                  onChange({ ...plan, chapters });
                }}
                aria-label={`第 ${chapterIndex + 1} 章标题`}
                className="w-full border-0 bg-transparent text-lg font-semibold text-neutral-950 outline-none"
              />
              <p className="mt-1 text-sm leading-6 text-neutral-600">{chapter.objective}</p>
            </div>
            <div className="flex gap-1">
              <button type="button" disabled={disabled || chapterIndex === 0} onClick={() => { onChange({ ...plan, chapters: move(plan.chapters, chapterIndex, -1) }); onAnnouncement(`${chapter.title} 已移到第 ${chapterIndex} 章`); }} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-neutral-100 disabled:opacity-30" aria-label={`上移第 ${chapterIndex + 1} 章`}><ArrowUp className="h-4 w-4" /></button>
              <button type="button" disabled={disabled || chapterIndex === plan.chapters.length - 1} onClick={() => { onChange({ ...plan, chapters: move(plan.chapters, chapterIndex, 1) }); onAnnouncement(`${chapter.title} 已移到第 ${chapterIndex + 2} 章`); }} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-neutral-100 disabled:opacity-30" aria-label={`下移第 ${chapterIndex + 1} 章`}><ArrowDown className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {chapter.lessons.map((lesson, lessonIndex) => (
              <div key={lesson.tempKey} className={cn('flex items-center gap-3 rounded-xl border p-3', lesson.isHidden ? 'border-dashed border-neutral-200 bg-neutral-50 text-neutral-500' : 'border-neutral-200')}>
                <span className="w-8 text-center text-xs font-medium text-neutral-400">{chapterIndex + 1}.{lessonIndex + 1}</span>
                <input
                  id={`plan-chapter-${chapterIndex}-lesson-${lessonIndex}-title`}
                  value={lesson.title}
                  disabled={disabled}
                  onChange={(event) => {
                    const chapters = [...plan.chapters];
                    const lessons = [...chapter.lessons];
                    lessons[lessonIndex] = { ...lesson, title: event.target.value };
                    chapters[chapterIndex] = { ...chapter, lessons };
                    onChange({ ...plan, chapters });
                  }}
                  aria-label={`课时 ${chapterIndex + 1}.${lessonIndex + 1} 标题`}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                />
                <span className="hidden text-xs text-neutral-400 sm:block">{lesson.estimatedMinutes} 分钟</span>
                <button
                  type="button"
                  disabled={disabled || (!lesson.isHidden && visibleCount <= 1)}
                  onClick={() => {
                    const chapters = [...plan.chapters];
                    const lessons = [...chapter.lessons];
                    lessons[lessonIndex] = { ...lesson, isHidden: !lesson.isHidden };
                    chapters[chapterIndex] = { ...chapter, lessons };
                    onChange({ ...plan, chapters });
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-neutral-100 disabled:opacity-30"
                  aria-label={lesson.isHidden ? `显示 ${lesson.title}` : `隐藏 ${lesson.title}`}
                >
                  {lesson.isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AiCoursePlanPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EditableCoursePlan | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [validationIssues, setValidationIssues] = useState<ZodIssue[]>([]);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const project = useQuery({
    queryKey: aiCourseKeys.detail(projectId ?? ''),
    queryFn: () => aiCoursesApi.getProject(projectId!),
    enabled: Boolean(projectId),
  });
  const job = useAiJob(projectId, activeJobId ?? project.data?.currentJobId);

  useEffect(() => {
    if (project.data?.plan && draft === null) setDraft(project.data.plan);
  }, [draft, project.data?.plan]);
  useEffect(() => {
    if (project.data?.id) pageHeadingRef.current?.focus();
  }, [project.data?.id]);
  useEffect(() => {
    if (job.data?.status === 'succeeded' && job.data.resultRef.continueHref) {
      navigate(job.data.resultRef.continueHref, { replace: true });
    }
  }, [job.data, navigate]);
  // The project query and job query update independently. If the job finishes
  // between polling ticks, the project can already be ready while the page is
  // still waiting on stale job data. Use the canonical project continuation as
  // a second completion signal so users never remain stuck on the progress UI.
  useEffect(() => {
    if (activeJobId && project.data?.status === 'ready' && project.data.continueHref) {
      navigate(project.data.continueHref, { replace: true });
    }
  }, [activeJobId, navigate, project.data?.continueHref, project.data?.status]);

  const save = useMutation({
    mutationFn: (plan: EditableCoursePlan) => aiCoursesApi.patchPlan(projectId!, plan),
    onSuccess: (data) => {
      queryClient.setQueryData(aiCourseKeys.detail(projectId!), data);
      if (data.plan) setDraft(data.plan);
    },
  });
  const approve = useMutation({
    mutationFn: (planVersion: number) => aiCoursesApi.approvePlan(projectId!, planVersion),
    onSuccess: (response) => {
      setActiveJobId(response.jobId);
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.detail(projectId!) });
    },
  });
  const retry = useMutation({
    mutationFn: (jobId: string) => aiCoursesApi.retryJob(projectId!, jobId),
    onSuccess: (next) => setActiveJobId(next.id),
  });
  const dirty = useMemo(() => Boolean(draft && project.data?.plan && JSON.stringify(draft) !== JSON.stringify(project.data.plan)), [draft, project.data?.plan]);
  const blocker = useBlocker(dirty && !save.isPending && !approve.isPending);
  const isGenerating = project.data?.status === 'planning' || project.data?.status === 'generating_first_lesson' || job.data?.status === 'queued' || job.data?.status === 'running';

  if (project.isPending) return <div role="status" className="mx-auto max-w-5xl px-4 py-12"><Skeleton className="h-12 w-2/3" /><Skeleton className="mt-8 h-96 rounded-3xl" /></div>;
  if (project.isError || !project.data) return <div role="alert" className="mx-auto max-w-3xl px-4 py-20 text-center"><h1 className="text-2xl font-semibold">找不到这门课程</h1><p className="mt-3 text-neutral-600">它可能已被删除，或你没有访问权限。</p><Button className="mt-6" onClick={() => navigate('/ai-courses')}>返回课程工坊</Button></div>;

  const detail: LearningProjectDetail = project.data;
  const validate = (plan: EditableCoursePlan) => {
    const result = EditableCoursePlanSchema.safeParse(plan);
    const issues = result.success ? [] : result.error.issues;
    setValidationIssues(issues);
    if (issues.length > 0) {
      const target = issueTargetId(issues[0].path);
      if (target) requestAnimationFrame(() => document.getElementById(target)?.focus());
      return false;
    }
    return true;
  };
  const saveDraft = () => {
    if (!draft) return;
    if (validate(draft)) save.mutate(draft);
  };
  const approveDraft = () => {
    if (!draft) return;
    if (validate(draft)) {
      trackAiCourseEvent({ eventType: 'personal_next_step_clicked', metadata: { projectId, action: 'approve_plan' } });
      approve.mutate(draft.planVersion);
    }
  };
  return (
    <div className="min-h-screen bg-[#F1F0EB] px-4 py-8 dark:bg-neutral-950 dark:text-neutral-900 md:px-8 md:py-12 [&_.bg-white]:dark:bg-neutral-100 [&_.border-neutral-200]:dark:border-neutral-400 [&_.text-neutral-950]:dark:text-neutral-900 [&_.text-neutral-600]:dark:text-neutral-800 [&_.text-neutral-500]:dark:text-neutral-800 [&_.text-neutral-700]:dark:text-neutral-800">
      <div className="mx-auto max-w-5xl">
        <Link to="/ai-courses" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" /> 返回我的课程</Link>
        <header className="mb-8 mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-500"><Sparkles className="h-4 w-4" />课程蓝图</p>
            <h1 ref={pageHeadingRef} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950 outline-none md:text-5xl">{detail.course.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">{detail.seedText}</p>
          </div>
          {draft && detail.status === 'plan_ready' && (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!dirty} isLoading={save.isPending} onClick={saveDraft} leftIcon={<Save className="h-4 w-4" />}>保存蓝图</Button>
              <Button disabled={dirty} isLoading={approve.isPending} onClick={approveDraft} rightIcon={<ArrowRight className="h-4 w-4" />}>生成第一节</Button>
            </div>
          )}
        </header>

        {validationIssues.length > 0 && <div role="alert" tabIndex={-1} className="mb-5 rounded-xl border border-danger-500/30 bg-white p-4 text-sm text-danger-500"><p className="font-semibold">课程蓝图还有 {validationIssues.length} 处需要修改：</p><ul className="mt-2 list-disc space-y-1 pl-5">{validationIssues.slice(0, 5).map((issue, index) => <li key={`${issue.path.join('.')}-${index}`}>{issue.message}</li>)}</ul></div>}
        {(save.isError || approve.isError) && <div role="alert" className="mb-5 rounded-xl border border-danger-500/30 bg-white p-4 text-sm text-danger-500"><p>{mapAiCourseError(save.error ?? approve.error).message}</p>{getHttpStatus(save.error ?? approve.error) === 409 && <Button variant="secondary" className="mt-3" onClick={async () => { const latest = await project.refetch(); if (latest.data?.plan) { setDraft(latest.data.plan); setValidationIssues([]); save.reset(); approve.reset(); } }}>载入最新蓝图</Button>}</div>}

        {isGenerating ? (
          <GenerationProgress stage={detail.status === 'generating_first_lesson' ? 'lesson' : 'plan'} progress={job.data && (job.data.status === 'queued' || job.data.status === 'running') ? job.data.progress : 5} currentStep={job.data && (job.data.status === 'queued' || job.data.status === 'running') ? job.data.currentStep : detail.status === 'planning' ? '正在理解你的学习目标' : null} />
        ) : job.data?.status === 'failed' || detail.status === 'failed' ? (
          <div role="alert" className="rounded-3xl border border-danger-500/30 bg-white p-8">
            <h2 className="text-2xl font-semibold text-neutral-950">这次生成没有完成</h2>
            <p className="mt-3 text-sm text-neutral-600">{job.data?.status === 'failed' ? job.data.errorMessage : detail.lastErrorMessage ?? '可以重试，已经完成的内容不会丢失。'}</p>
            {/* v1.9-alpha.1 (A-07): UX-AUDIT C-16 — 当 job.data 被 clear(只剩 detail.status='failed')
                时也提供重试入口。fallback 拿 project.data.currentJobId,它就是这条失败 job 的 id。 */}
            {(job.data?.status === 'failed' && job.data.retryable) ||
            (detail.status === 'failed' && detail.currentJobId) ? (
              <Button
                className="mt-6"
                isLoading={retry.isPending}
                onClick={() =>
                  retry.mutate(job.data?.id ?? detail.currentJobId!)
                }
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                重新生成
              </Button>
            ) : null}
          </div>
        ) : draft ? (
          <><p className="sr-only" aria-live="polite">{announcement}</p><PlanEditor plan={draft} disabled={save.isPending || approve.isPending} onChange={setDraft} onAnnouncement={setAnnouncement} /></>
        ) : (
          <GenerationProgress stage="plan" progress={95} currentStep="等待课程蓝图写入" />
        )}
      </div>
      <ConfirmDialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} title="离开课程蓝图？" description="尚未保存的修改会丢失。" confirmText="放弃修改并离开" />
    </div>
  );
}
