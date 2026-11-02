import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { aiCoursesApi } from '../ai-courses/aiCoursesApi';
import { learningHomeKeys } from '../ai-courses/queryKeys';
import { Button, buttonClassName } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAiCourseCapability } from '../ai-courses/aiCourseCapability';

export function MyLearningHomePage() {
  const aiCourseCapability = useAiCourseCapability();
  const aiCoursesEnabled = aiCourseCapability.data?.enabled === true;
  const home = useInfiniteQuery({
    queryKey: learningHomeKeys.all,
    queryFn: ({ pageParam }) => aiCoursesApi.getLearningHome(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = useMemo(() => {
    const merged = home.data?.pages.flatMap((page) => page.items) ?? [];
    const visible = aiCoursesEnabled ? merged : merged.filter((item) => item.kind !== 'ai_personal');
    return [...new Map(visible.map((item) => [`${item.kind}:${item.id}`, item])).values()];
  }, [aiCoursesEnabled, home.data?.pages]);

  return (
    <main className="min-h-full bg-[#F1F0EB] px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 border-b border-neutral-300 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">My learning</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-neutral-950 md:text-6xl">继续上次的思考。</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600">{aiCoursesEnabled ? '平台课程和你自己创建的 AI 课程，都从这里接着学。' : '你的平台课程都从这里接着学。'}</p>
          </div>
          {aiCoursesEnabled && <Link to="/ai-courses/new" className={buttonClassName()}><Sparkles className="h-4 w-4" aria-hidden="true" /><span>创建自己的课程</span></Link>}
        </div>

        {home.isPending ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-48 rounded-2xl" />)}</div>
        ) : home.isError ? (
          <section role="alert" className="mt-8 rounded-2xl border border-neutral-200 bg-white p-8"><h2 className="font-semibold">学习记录暂时无法加载</h2><Button variant="secondary" className="mt-4" onClick={() => void home.refetch()}>重新加载</Button></section>
        ) : items.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-dashed border-neutral-300 bg-white p-6 text-center sm:p-10"><BookOpen className="mx-auto h-8 w-8" aria-hidden="true" /><h2 className="mt-4 text-2xl font-semibold">还没有进行中的学习</h2><p className="mt-2 text-sm text-neutral-600">{aiCoursesEnabled ? '选择平台课程，或者从一个问题开始创建你的第一门 AI 课程。' : '选择一门平台课程开始学习。'}</p><div className="mx-auto mt-6 flex max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center"><Link to="/courses" className={buttonClassName({ variant: 'secondary', fullWidth: true })}>浏览课程</Link>{aiCoursesEnabled && <Link to="/ai-courses/new" className={buttonClassName({ fullWidth: true })}>问一个问题</Link>}</div></section>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {items.map((item) => {
                const progress = Math.min(100, Math.max(0, item.progress));
                return (
                <Link key={`${item.kind}:${item.id}`} to={item.continueHref} className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 sm:p-6">
                  <div className="flex items-center justify-between"><span className={item.kind === 'ai_personal' ? 'rounded-full bg-[#DCEBFF] px-3 py-1 text-xs font-semibold' : 'rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold'}>{item.kind === 'ai_personal' ? 'AI 自建课程' : '平台课程'}</span><ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden="true" /></div>
                  <h2 className="mt-7 text-2xl font-semibold tracking-tight text-neutral-950">{item.title}</h2>
                  <div className="mt-8 flex items-center justify-between text-xs text-neutral-500"><span>学习进度</span><span>{progress}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label={`${item.title}学习进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-neutral-950" style={{ width: `${progress}%` }} /></div>
                </Link>
              );})}
            </div>
            {home.hasNextPage && <div className="mt-8 flex justify-center"><Button variant="secondary" isLoading={home.isFetchingNextPage} onClick={() => void home.fetchNextPage()}>加载更多</Button></div>}
          </>
        )}
      </div>
    </main>
  );
}
