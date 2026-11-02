import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Clock3, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { aiCoursesApi } from './aiCoursesApi';
import { aiCourseKeys } from './queryKeys';
import type { LearningProjectListItem } from './aiCourses.types';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CourseQuestionComposer } from './CourseQuestionComposer';
import type { CreateLearningProjectInput } from './aiCourses.types';
import { trackAiCourseEvent } from './trackAiCourseEvent';
import { mapAiCourseError } from './aiCourseErrors';

const statusLabel: Record<LearningProjectListItem['status'], string> = {
  planning: '正在设计蓝图',
  plan_ready: '蓝图待确认',
  generating_first_lesson: '正在准备第一节',
  ready: '可以开始',
  learning: '学习中',
  completed: '已完成',
  failed: '生成失败',
  archived: '已归档',
};

function ProjectCard({ project, onArchive }: { project: LearningProjectListItem; onArchive(id: string): void }) {
  const progress = Math.max(0, Math.min(100, project.totalLessons > 0
    ? Math.round((project.completedLessons / project.totalLessons) * 100)
    : 0));
  const destination = project.status === 'planning' || project.status === 'plan_ready' || project.status === 'generating_first_lesson' || project.status === 'failed'
    ? `/ai-courses/${project.id}/plan`
    : project.continueHref;
  const displayTitle = project.status === 'failed' && project.course.title.startsWith('正在创建：')
    ? project.seedText
    : project.course.title;
  const actionLabel = project.status === 'failed'
    ? '查看失败原因并重试'
    : project.status === 'plan_ready'
      ? '查看课程蓝图'
      : project.status === 'planning' || project.status === 'generating_first_lesson'
        ? '查看生成进度'
        : '继续学习';

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <span className={project.status === 'failed'
          ? 'rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700'
          : 'rounded-full bg-[#E9F4DD] px-3 py-1 text-xs font-semibold text-[#31551F]'}>{statusLabel[project.status]}</span>
        <button
          type="button"
          onClick={() => onArchive(project.id)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
          aria-label={`归档 ${displayTitle}`}
          title="归档课程"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
      <h2 className="mt-5 line-clamp-2 text-xl font-semibold tracking-tight text-neutral-950">{displayTitle}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">{project.seedText}</p>
      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{project.completedLessons}/{project.totalLessons || '—'} 节</span>
          <span>{project.masteryLabel ?? `${progress}%`}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-neutral-950 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <Link
          to={destination}
          className="mt-5 flex min-h-11 items-center justify-between border-t border-neutral-200 pt-4 text-sm font-semibold text-neutral-950"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </Link>
      </div>
    </article>
  );
}

export function AiCourseHubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<LearningProjectListItem | null>(null);
  const [undoProject, setUndoProject] = useState<LearningProjectListItem | null>(null);
  const [retryAt, setRetryAt] = useState<Date | null>(null);
  const createRequest = useRef<{ key: string; input: string } | null>(null);
  const projects = useInfiniteQuery({
    queryKey: aiCourseKeys.list({ archived: showArchived }),
    queryFn: ({ pageParam }) => aiCoursesApi.listProjects({ cursor: pageParam, limit: 12, archived: showArchived }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const archive = useMutation({
    mutationFn: (projectId: string) => aiCoursesApi.archiveProject(projectId),
    onSuccess: (_, projectId) => {
      const archived = items.find((item) => item.id === projectId) ?? null;
      setUndoProject(archived);
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.listRoot() });
    },
  });
  const restore = useMutation({
    mutationFn: (projectId: string) => aiCoursesApi.restoreProject(projectId),
    onSuccess: () => {
      setUndoProject(null);
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.listRoot() });
    },
  });
  const create = useMutation({
    mutationFn: (input: CreateLearningProjectInput) => {
      const canonical = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.input !== canonical) {
        createRequest.current = { key: crypto.randomUUID(), input: canonical };
      }
      return aiCoursesApi.createProject(input, createRequest.current.key);
    },
    onSuccess: (result) => {
      queryClient.removeQueries({ queryKey: aiCourseKeys.detail(result.projectId), exact: true });
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.listRoot() });
      navigate(`/ai-courses/${result.projectId}/plan`);
    },
  });
  const items = useMemo(() => {
    const merged = projects.data?.pages.flatMap((page) => page.items) ?? [];
    return [...new Map(merged.map((item) => [item.id, item])).values()];
  }, [projects.data?.pages]);
  const continueProject = !showArchived ? items[0] : undefined;
  const createError = create.isError ? mapAiCourseError(create.error) : null;

  useEffect(() => {
    if (!undoProject) return;
    const timer = window.setTimeout(() => setUndoProject(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undoProject]);
  useEffect(() => {
    if (createError?.retryAfterSeconds) setRetryAt(new Date(Date.now() + createError.retryAfterSeconds * 1000));
  }, [createError?.retryAfterSeconds]);

  return (
    <div className="min-h-screen bg-[#F1F0EB] pb-24 dark:bg-neutral-950 dark:text-neutral-900 [&_.bg-white]:dark:bg-neutral-100 [&_.border-neutral-200]:dark:border-neutral-400 [&_.text-neutral-950]:dark:text-neutral-900 [&_.text-neutral-600]:dark:text-neutral-800 [&_.text-neutral-500]:dark:text-neutral-800">
      <section className="border-b border-neutral-200 bg-[#DCEBFF] px-4 py-14 dark:border-neutral-700 dark:bg-[#152A43] md:px-8 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-end gap-8 lg:grid-cols-[1fr_420px]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-950/10 bg-white/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] dark:border-white/20 dark:bg-neutral-900/70 dark:text-neutral-100">
                <Sparkles className="h-4 w-4" /> 课程工坊
              </div>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-neutral-950 sm:text-5xl md:text-7xl md:tracking-[-0.055em]">
                把每一个好问题，<br />变成自己的课程。
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-700 dark:text-white/80 md:text-lg">
                AI 先为你设计路径，再生成深度讲义、理解测试和个性化辅导。课程属于你，也跟着你的理解不断变化。
              </p>
            </div>
            <div className="rounded-3xl border border-neutral-950/10 bg-neutral-950 p-6 text-white shadow-2xl">
              <div className="flex items-center gap-3"><BookOpenCheck className="h-6 w-6" /><span className="font-semibold">一次完整学习闭环</span></div>
              <ol className="mt-5 space-y-4 text-sm text-neutral-300">
                <li className="flex gap-3"><span className="text-white">01</span>提出问题，确认课程蓝图</li>
                <li className="flex gap-3"><span className="text-white">02</span>阅读逐节生成的深度讲义</li>
                <li className="flex gap-3"><span className="text-white">03</span>测试理解，让 AI 定位薄弱点</li>
              </ol>
              <Button onClick={() => navigate('/ai-courses/new')} variant="secondary" fullWidth className="mt-6" leftIcon={<Plus className="h-4 w-4" />}>
                创建一门新课程
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        {!showArchived && continueProject && (
          <Link onClick={() => trackAiCourseEvent({ eventType: 'personal_next_step_clicked', metadata: { projectId: continueProject.id, action: 'hub_continue' } })} to={continueProject.status === 'planning' || continueProject.status === 'plan_ready' || continueProject.status === 'generating_first_lesson' || continueProject.status === 'failed' ? `/ai-courses/${continueProject.id}/plan` : continueProject.continueHref} className="mb-8 block rounded-3xl bg-neutral-950 p-6 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 dark:text-neutral-600">继续学习</p>
            <div className="mt-3 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold md:text-3xl">{continueProject.course.title}</h2><p className="mt-2 text-sm text-neutral-300">{continueProject.activeLesson?.title ?? statusLabel[continueProject.status]}</p></div><ArrowRight className="h-6 w-6 shrink-0" aria-hidden="true" /></div>
          </Link>
        )}
        {!showArchived && (
          <div className="mb-10">
            <CourseQuestionComposer compact submitting={create.isPending || Boolean(retryAt)} error={createError?.message ?? null} errorActionHref={createError?.feedbackHref} retryAt={retryAt} onRetryReady={() => setRetryAt(null)} onSubmit={(input) => create.mutate(input)} />
          </div>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-neutral-500"><Clock3 className="h-4 w-4" />你的学习空间</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{showArchived ? '已归档课程' : '我的 AI 课程'}</h2>
          </div>
          <div className="flex flex-wrap gap-4"><button type="button" className="min-h-11 text-sm font-semibold" onClick={() => setShowArchived((value) => !value)}>{showArchived ? '返回进行中课程' : '查看归档'}</button>{!showArchived && <Link to="/ai-courses/new" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-neutral-950"><Plus className="h-4 w-4" /> 新建课程</Link>}</div>
        </div>

        {projects.isPending ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="正在加载课程">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-2xl" />)}
          </div>
        ) : projects.isError ? (
          <div role="alert" className="mt-8 rounded-2xl border border-danger-500/30 bg-white p-8">
            <h3 className="font-semibold text-neutral-950">课程列表暂时无法加载</h3>
            <p className="mt-2 text-sm text-neutral-600">网络恢复后可以继续，不会影响已经创建的课程。</p>
            <Button variant="secondary" className="mt-5" onClick={() => void projects.refetch()}>重新加载</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-neutral-500" />
            <h3 className="mt-5 text-2xl font-semibold text-neutral-950">{showArchived ? '还没有归档课程' : '你的第一门课程，从一个困惑开始'}</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-600">{showArchived ? '归档后的课程会出现在这里，并且可以随时恢复。' : '不需要先整理成完整主题。告诉 AI 你哪里不懂、为什么想学，它会先帮你搭好路径。'}</p>
            {!showArchived && <Button className="mt-6" onClick={() => navigate('/ai-courses/new')} rightIcon={<ArrowRight className="h-4 w-4" />}>开始创建</Button>}
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((project) => showArchived
                ? <article key={project.id} className="rounded-2xl border border-neutral-200 bg-white p-5"><h3 className="text-xl font-semibold">{project.course.title}</h3><p className="mt-2 text-sm text-neutral-600">{project.seedText}</p><Button variant="secondary" className="mt-5" isLoading={restore.isPending} onClick={() => restore.mutate(project.id)}>恢复课程</Button></article>
                : <ProjectCard key={project.id} project={project} onArchive={() => setArchiveTarget(project)} />)}
            </div>
            {projects.hasNextPage && (
              <div className="mt-8 flex justify-center">
                <Button variant="secondary" isLoading={projects.isFetchingNextPage} onClick={() => void projects.fetchNextPage()}>加载更多</Button>
              </div>
            )}
          </>
        )}
        {(archive.isError || restore.isError) && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{mapAiCourseError(archive.error ?? restore.error).message}</p>}
      </section>
      <ConfirmDialog open={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveTarget ? archive.mutateAsync(archiveTarget.id) : undefined} title="归档这门课程？" description="归档会停止正在排队的生成任务，你可以稍后从归档列表恢复。" confirmText="确认归档" />
      {undoProject && <div role="status" className="fixed bottom-20 left-1/2 z-40 flex w-[min(92vw,440px)] -translate-x-1/2 items-center justify-between gap-4 rounded-xl bg-neutral-950 px-4 py-3 text-sm text-white shadow-xl"><span className="truncate">已归档 {undoProject.course.title}</span><button type="button" className="min-h-11 shrink-0 font-semibold underline" onClick={() => restore.mutate(undoProject.id)}>撤销</button></div>}
    </div>
  );
}
