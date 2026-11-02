import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import { aiCoursesApi } from './aiCoursesApi';
import { aiCourseKeys } from './queryKeys';
import { LessonContentRenderer } from '../dashboard/components/LessonContentRenderer';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Drawer } from '../../components/ui/Drawer';
import { cn } from '../../lib/cn';
import { AssessmentPanel } from './AssessmentPanel';
import { ProjectTutorPanel } from './ProjectTutorPanel';
import { LearningWorkspace } from '../dashboard/components/LearningWorkspace';
import { useLessonActivity } from './hooks/useLessonActivity';
import { progressApi } from '../../lib/progressApi';
import { learningHomeKeys } from './queryKeys';
import { trackAiCourseEvent } from './trackAiCourseEvent';
import { mapAiCourseError } from './aiCourseErrors';
import type { LearningProjectDetail } from './aiCourses.types';

export function canonicalVisibleLessonId(
  chapters: LearningProjectDetail['chapters'],
  requestedLessonId: string,
): string | null {
  const all = chapters.flatMap((chapter) => chapter.lessons);
  const requestedIndex = all.findIndex((lesson) => lesson.id === requestedLessonId);
  if (requestedIndex < 0) return null;
  const visible = all
    .map((lesson, index) => ({ lesson, index }))
    .filter(({ lesson }) => !lesson.isHidden && !lesson.deletedAt);
  return visible.sort((left, right) =>
    Math.abs(left.index - requestedIndex) - Math.abs(right.index - requestedIndex) || left.index - right.index,
  )[0]?.lesson.id ?? null;
}

export function PersonalLearningPage() {
  const [tutorOpen, setTutorOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'outline' | 'lesson' | 'tutor'>('lesson');
  const [tutorViewportHeight, setTutorViewportHeight] = useState<number | null>(null);
  const [courseCompleted, setCourseCompleted] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const generationKeys = useRef<Map<string, string>>(new Map());
  const { projectId, lessonId } = useParams<{ projectId: string; lessonId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useQuery({ queryKey: aiCourseKeys.detail(projectId ?? ''), queryFn: () => aiCoursesApi.getProject(projectId!), enabled: Boolean(projectId) });
  const visibleLessons = project.data?.chapters.flatMap((chapter) => chapter.lessons.filter((lesson) => !lesson.isHidden && !lesson.deletedAt)) ?? [];
  const selected = visibleLessons.find((lesson) => lesson.id === lessonId);
  const currentIndex = visibleLessons.findIndex((lesson) => lesson.id === lessonId);
  const previous = visibleLessons[currentIndex - 1];
  const next = visibleLessons[currentIndex + 1];

  useEffect(() => {
    if (!projectId || project.isPending || project.isError || lessonId) return;
    const next = project.data?.activeLesson && visibleLessons.some((lesson) => lesson.id === project.data?.activeLesson?.id)
      ? project.data.activeLesson.id
      : visibleLessons[0]?.id;
    if (next) navigate(`/ai-courses/${projectId}/learn/${next}`, { replace: true });
  }, [lessonId, navigate, project.data, project.isError, project.isPending, projectId, visibleLessons]);

  useEffect(() => {
    if (!projectId || !lessonId || !project.data || selected) return;
    const canonicalLessonId = canonicalVisibleLessonId(project.data.chapters, lessonId);
    if (canonicalLessonId) {
      navigate(`/ai-courses/${projectId}/learn/${canonicalLessonId}`, { replace: true });
    }
  }, [lessonId, navigate, project.data, projectId, selected]);

  const content = useQuery({
    queryKey: aiCourseKeys.lessonContent(projectId ?? '', lessonId ?? ''),
    queryFn: () => aiCoursesApi.getLessonContent(projectId!, lessonId!),
    enabled: Boolean(projectId && lessonId && selected && project.data?.status !== 'archived'),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status !== 'queued' && status !== 'generating') return false;
      return document.visibilityState === 'visible' ? 2000 : 10000;
    },
  });
  const generate = useMutation({
    mutationFn: () => {
      let key = generationKeys.current.get(lessonId!);
      if (!key) { key = crypto.randomUUID(); generationKeys.current.set(lessonId!, key); }
      return aiCoursesApi.generateLessonContent(projectId!, lessonId!, 'generate', key);
    },
    onSuccess: () => {
      generationKeys.current.delete(lessonId!);
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.lessonContent(projectId!, lessonId!) });
    },
  });
  const complete = useMutation({
    mutationFn: () => progressApi.completeLesson(lessonId!),
    onSuccess: async (result) => {
      trackAiCourseEvent({ lessonId, eventType: 'personal_next_step_clicked', metadata: { projectId, action: next ? 'complete_and_continue' : 'complete_course' } });
      await queryClient.invalidateQueries({ queryKey: aiCourseKeys.detail(projectId!) });
      await queryClient.invalidateQueries({ queryKey: learningHomeKeys.all });
      if (result.courseProgress.isCompleted) setCourseCompleted(true);
      if (next) {
        try {
          const nextContent = await queryClient.fetchQuery({
            queryKey: aiCourseKeys.lessonContent(projectId!, next.id),
            queryFn: () => aiCoursesApi.getLessonContent(projectId!, next.id),
            staleTime: 0,
          });
          if (nextContent.status === 'empty' || nextContent.status === 'failed') {
            let key = generationKeys.current.get(next.id);
            if (!key) {
              key = crypto.randomUUID();
              generationKeys.current.set(next.id, key);
            }
            await aiCoursesApi.generateLessonContent(projectId!, next.id, 'generate', key);
            void queryClient.invalidateQueries({ queryKey: aiCourseKeys.lessonContent(projectId!, next.id) });
          }
        } catch {
          // 下一课预生成是 best effort，不阻断已成功的完成操作。
        }
        navigate(`/ai-courses/${projectId}/learn/${next.id}`);
      }
    },
  });
  const restore = useMutation({
    mutationFn: () => aiCoursesApi.restoreProject(projectId!),
    onSuccess: (detail) => queryClient.setQueryData(aiCourseKeys.detail(projectId!), detail),
  });

  useEffect(() => {
    if (!projectId || !lessonId || !selected) return;
    trackAiCourseEvent({ lessonId, eventType: 'personal_lesson_opened', metadata: { projectId } });
  }, [lessonId, projectId, selected]);

  useLessonActivity({
    projectId: projectId ?? '',
    lessonId: lessonId ?? '',
    ready: content.data?.status === 'ready' && Array.isArray(content.data.blocks),
    containerRef: contentRef,
    initialBlockId: project.data?.activeLesson?.id === lessonId ? project.data.activeBlockId : null,
    initialBlockOffset: project.data?.activeLesson?.id === lessonId ? project.data.activeBlockOffset : null,
  });

  useEffect(() => {
    if (!tutorOpen || typeof window.matchMedia !== 'function') return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setTutorOpen(false);
    };
    closeOnDesktop(desktop);
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [tutorOpen]);

  useEffect(() => {
    if (!tutorOpen || !window.visualViewport) {
      setTutorViewportHeight(null);
      return;
    }
    const viewport = window.visualViewport;
    const update = () => setTutorViewportHeight(viewport.height);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, [tutorOpen]);

  if (project.isPending) return <div role="status" className="min-h-screen bg-[#F1F0EB] p-6"><Skeleton className="h-16" /><div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]"><Skeleton className="h-[70vh]" /><Skeleton className="h-[70vh]" /></div></div>;
  if (project.data?.status === 'archived') return <div className="flex min-h-[100dvh] items-center justify-center bg-[#F1F0EB] px-4 text-center dark:bg-neutral-950"><div className="max-w-md"><h1 className="text-3xl font-semibold dark:text-white">这门课程已归档</h1><p className="mt-3 text-neutral-600 dark:text-neutral-300">恢复后才能继续学习、记录进度和使用课程导师。</p><Button className="mt-6" isLoading={restore.isPending} onClick={() => restore.mutate()}>恢复课程</Button>{restore.isError && <p role="alert" className="mt-3 text-sm text-red-700">恢复失败，请稍后重试。</p>}</div></div>;
  if (project.isError || !project.data || (lessonId && !selected && canonicalVisibleLessonId(project.data.chapters, lessonId) === null)) return <div className="flex min-h-screen items-center justify-center bg-[#F1F0EB] px-4 text-center"><div><h1 className="text-3xl font-semibold">找不到这个课时</h1><p className="mt-3 text-neutral-600">它不属于当前课程，或已经不可用。</p><Button className="mt-6" onClick={() => navigate('/ai-courses')}>返回我的课程</Button></div></div>;
  if (lessonId && !selected) return <div role="status" className="flex min-h-screen items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin" /><span className="ml-3">正在进入最近的有效课时…</span></div>;
  if (!lessonId || !selected) return <div role="status" className="flex min-h-screen items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin" /><span className="ml-3">正在进入课程…</span></div>;

  return (
    <div className="flex h-screen h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F7F6F2] dark:bg-neutral-950 dark:text-neutral-900 [&_.bg-white]:dark:bg-neutral-100 [&_.border-neutral-200]:dark:border-neutral-400 [&_.text-neutral-950]:dark:text-neutral-900 [&_.text-neutral-600]:dark:text-neutral-800 [&_.text-neutral-500]:dark:text-neutral-800 [&_.text-neutral-700]:dark:text-neutral-800 [&_.text-neutral-800]:dark:text-neutral-900">
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-4 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur dark:bg-neutral-100/95 md:px-6">
        <Link to="/ai-courses" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-neutral-100" aria-label="返回课程工坊"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-neutral-950">{project.data.course.title}</p><p className="truncate text-xs text-neutral-600 dark:text-neutral-800">{selected.title}</p></div>
        <span className="hidden items-center gap-2 rounded-full bg-[#DCEBFF] px-3 py-1.5 text-xs font-medium dark:bg-[#17304F] dark:text-blue-100 md:inline-flex"><Sparkles className="h-4 w-4" />AI 个人课程</span>
        <button type="button" aria-label="在抽屉中打开课程导师" onClick={() => setTutorOpen(true)} className="hidden h-11 items-center gap-2 rounded-full border border-neutral-200 px-4 text-sm font-medium md:flex xl:hidden"><MessageCircle className="h-4 w-4" />课程导师</button>
      </header>
      <LearningWorkspace
        tabs={[{ id: 'outline', label: '目录', panelId: 'personal-outline-panel' }, { id: 'lesson', label: '学习', panelId: 'personal-lesson-panel' }, { id: 'tutor', label: '导师', panelId: 'personal-tutor-panel' }]}
        activeTab={mobileTab}
        onTabChange={(id) => setMobileTab(id as 'outline' | 'lesson' | 'tutor')}
        contentRef={contentRef}
        outlineClassName="overflow-y-auto bg-white p-4"
        contentClassName="overflow-y-auto px-4 py-7 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:py-10"
        outline={project.data.chapters.map((chapter, chapterIndex) => (
          <section key={chapter.id} className="mb-6"><h2 className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-600 dark:text-neutral-300">{chapterIndex + 1}. {chapter.title}</h2><div className="mt-2 space-y-1">{chapter.lessons.filter((item) => !item.isHidden && !item.deletedAt).map((item) => <Link key={item.id} to={`/ai-courses/${projectId}/learn/${item.id}`} onClick={() => setMobileTab('lesson')} aria-current={item.id === lessonId ? 'page' : undefined} className={cn('block min-h-11 rounded-xl px-3 py-3 text-sm leading-5', item.id === lessonId ? 'bg-neutral-950 font-medium text-white' : 'text-neutral-700 hover:bg-neutral-100')}>{item.title}</Link>)}</div></section>
        ))}
        assistant={<ProjectTutorPanel projectId={projectId} lessonId={lessonId} />}
        content={<>
          <div className="mx-auto max-w-[760px]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-600 dark:text-neutral-300"><BookOpen className="h-4 w-4" />第 {currentIndex + 1} 节</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-neutral-950 md:text-5xl">{selected.title}</h1>
            {selected.description && <p className="mt-4 text-base leading-7 text-neutral-600">{selected.description}</p>}
          </div>

          {content.isPending ? <div role="status" className="mx-auto mt-10 max-w-[760px]"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="mt-5 h-5" count={8} /></div>
            : content.isError || content.data?.status === 'empty' || content.data?.status === 'failed' || (content.data?.status === 'ready' && !Array.isArray(content.data.blocks)) ? <div role="alert" className="mx-auto mt-10 max-w-[760px] rounded-2xl border border-neutral-200 bg-white p-8 text-center"><Sparkles className="mx-auto h-7 w-7" /><h2 className="mt-4 text-xl font-semibold">这节讲义还没有准备好</h2><p className="mt-2 text-sm text-neutral-600">{content.isError ? mapAiCourseError(content.error).message : '生成后会保留在课程中，之后可以随时回来复习。'}</p><Button className="mt-6" isLoading={generate.isPending} onClick={() => generate.mutate()} leftIcon={<RefreshCw className="h-4 w-4" />}>生成本节讲义</Button>{generate.isError && <p className="mt-3 text-sm text-red-700">{mapAiCourseError(generate.error).message}</p>}</div>
            : content.data.status === 'queued' || content.data.status === 'generating' ? <div role="status" className="mx-auto mt-10 max-w-[760px] rounded-2xl border border-neutral-200 bg-white p-8"><LoaderCircle className="h-6 w-6 animate-spin" /><h2 className="mt-4 text-xl font-semibold">正在生成这节讲义</h2><p className="mt-2 text-sm text-neutral-600">AI 正在组织概念、例子和理解检查。</p></div>
            : <div className="mt-10"><LessonContentRenderer blocks={content.data.blocks} /></div>}

          {content.data?.status === 'ready' && Array.isArray(content.data.blocks) && <div id="personal-assessment"><AssessmentPanel key={lessonId} projectId={projectId} lessonId={lessonId} /></div>}

          <nav className="mx-auto flex max-w-[760px] items-center justify-between border-t border-neutral-200 py-6" aria-label="课时切换">
            {previous ? <Link to={`/ai-courses/${projectId}/learn/${previous.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"><ChevronLeft className="h-4 w-4" />上一节</Link> : <span />}
            {next ? <span className="text-sm text-neutral-600 dark:text-neutral-300">完成本节后进入下一节<ChevronRight className="ml-1 inline h-4 w-4" /></span> : <span className="text-sm text-neutral-600 dark:text-neutral-300">已到课程末尾</span>}
          </nav>
          <div className="sticky bottom-0 z-10 mx-auto flex min-h-14 max-w-[760px] items-center justify-end border-t border-neutral-200 bg-[#F7F6F2]/95 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
            {courseCompleted || project.data.status === 'completed' ? <div className="flex flex-wrap items-center justify-end gap-3"><a href="#personal-assessment" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">复习理解测试</a><Button onClick={() => navigate('/ai-courses')} leftIcon={<CheckCircle2 className="h-4 w-4" />}>课程已完成 · 回到学习中心</Button></div> : <Button isLoading={complete.isPending} onClick={() => complete.mutate()} leftIcon={<CheckCircle2 className="h-4 w-4" />}>{next ? '完成并进入下一节' : '完成本节'}</Button>}
          </div>
          {complete.isError && <p role="alert" className="mx-auto mt-2 max-w-[760px] text-sm text-red-700">完成状态保存失败，请重试。</p>}
        </>}
      />
      <Drawer open={tutorOpen} onClose={() => setTutorOpen(false)} title="课程导师" width={448}>
        <div style={tutorViewportHeight ? { height: `${tutorViewportHeight}px` } : { height: '100%' }}>
          <ProjectTutorPanel projectId={projectId} lessonId={lessonId} />
        </div>
      </Drawer>
    </div>
  );
}
