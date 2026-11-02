/**
 * SearchPage — P1-2 全站搜索结果页
 *
 * URL: /search?q=langchain
 *
 * 结构:
 *   - 顶部:大搜索词(读 URL ?q=) + 命中数
 *   - 4 tab:全部 (default) / 课程 / 学位 / 黑客松 / 讲师
 *   - 列表:内联卡片(按 type 渲染对应卡片,简化复用 P0-5 home 的风格)
 *   - 加载:Skeleton (rectangle h-32 count=6)
 *   - 0 结果:EmptyState
 *
 * 响应式:与 HomePage / mock 一致 — 走 token + grid
 *
 * 设计约束:
 *   - 不引新依赖,复用 P0-4 基础组件 + searchApi
 *   - 后端尚未暴露可验证的时间字段，因此不展示无效的“最新”排序
 *   - 暗色:全部走 token
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search as SearchIcon,
  BookOpen,
  GraduationCap,
  Trophy,
  User as UserIcon,
  Clock,
  ArrowUpRight,
  MapPin,
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { buttonClassName } from '../components/ui/Button';
import { searchAll, groupResults, type SearchResult, type SearchResultType } from '../lib/searchApi';
import { cn } from '../lib/cn';
import { firstCourseTag } from '../lib/courseTags';

const TYPE_TABS: { key: SearchResultType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'course', label: '课程' },
  { key: 'degree', label: '学位' },
  { key: 'hackathon', label: '黑客松' },
  { key: 'instructor', label: '讲师' },
];

// 课程封面渐变(跟 HomePage 一致 — brutalist 全黑白)
function getCourseCoverGradient(tags: string | undefined): string {
  const t = (tags ?? '').toLowerCase();
  if (t.includes('rag')) return 'from-[#171717] to-[#262626]';
  if (t.includes('mlops') || t.includes('deploy') || t.includes('vllm')) return 'from-[#171717] to-[#262626]';
  if (t.includes('fine') || t.includes('tune') || t.includes('lora')) return 'from-[#171717] to-[#262626]';
  if (t.includes('llm') || t.includes('langchain')) return 'from-[#171717] to-[#262626]';
  return 'from-[#171717] to-[#262626]';
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get('q') ?? '';
  const requestedType = searchParams.get('type');
  const urlType: SearchResultType | 'all' = TYPE_TABS.some((tab) => tab.key === requestedType)
    ? requestedType as SearchResultType | 'all'
    : 'all';

  const [input, setInput] = useState(urlQ);
  const [debouncedQ, setDebouncedQ] = useState(urlQ);
  const [activeType, setActiveType] = useState<SearchResultType | 'all'>(urlType);

  // 同步 URL → state
  useEffect(() => {
    setInput(urlQ);
    setDebouncedQ(urlQ);
  }, [urlQ]);
  useEffect(() => {
    setActiveType(urlType);
  }, [urlType]);

  // 输入 debounce 300ms(比 CommandPalette 慢一点,毕竟大页面)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(input);
      // 同步到 URL(不刷页面)
      const next = new URLSearchParams(searchParams);
      if (input.trim()) next.set('q', input.trim());
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // 拉数据(用 URL 上的 q,确保 SSR / 直链可重现)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search-page', debouncedQ],
    queryFn: () => searchAll(debouncedQ),
    enabled: debouncedQ.trim().length > 0,
    staleTime: 30_000,
  });

  // 按 tab 过滤
  const groups = useMemo(() => {
    if (!data) return [];
    const g = groupResults(data.results);
    if (activeType === 'all') return g;
    return g.filter((x) => x.type === activeType);
  }, [data, activeType]);

  const totalCount = useMemo(() => {
    if (!data) return 0;
    return data.counts.course + data.counts.degree + data.counts.hackathon + data.counts.instructor;
  }, [data]);

  const handleTypeChange = (t: SearchResultType | 'all') => {
    setActiveType(t);
    const next = new URLSearchParams(searchParams);
    if (t === 'all') next.delete('type');
    else next.set('type', t);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-950 min-h-[60vh]">
      {/* 顶部 header */}
      <section className="bg-neutral-0 dark:bg-neutral-100 border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-600 mb-2">
            <SearchIcon className="w-3 h-3" />
            / Search
          </div>
          <h1 className="text-3xl md:text-display-md font-bold text-neutral-900 dark:text-neutral-900">
            {urlQ ? (
              <>
                搜索: <span className="text-[#171717] underline underline-offset-2">「{urlQ}」</span>
              </>
            ) : (
              '全站搜索'
            )}
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-600">
            {isLoading
              ? '搜索中...'
              : urlQ
                ? `共找到 ${totalCount} 条结果`
                : '输入关键词开始搜索'}
            {data?.hasFailures && (
              <span className="ml-2 text-warning-500">(部分服务暂不可用)</span>
            )}
          </p>

          {/* 搜索框(在搜索页内可以编辑关键字) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setDebouncedQ(input);
            }}
            className="mt-6 max-w-2xl"
          >
            <Input
              type="search"
              size="lg"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="搜索课程 / 学位 / 黑客松 / 讲师..."
              leftIcon={<SearchIcon className="w-4 h-4" />}
              fullWidth
            />
          </form>
        </div>
      </section>

      {/* 结果类型筛选 */}
      <section className="bg-neutral-0 dark:bg-neutral-100 border-b border-neutral-200 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="搜索结果类型">
            {TYPE_TABS.map((t) => {
              const count = t.key === 'all'
                ? totalCount
                : data?.counts[t.key as SearchResultType] ?? 0;
              const active = activeType === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleTypeChange(t.key)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-black uppercase tracking-widest transition-colors rounded-md',
                    active
                      ? 'bg-[#171717] text-white'
                      : 'bg-transparent text-neutral-600 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-100',
                  )}
                >
                  {t.label}
                  <span className={cn('ml-1.5 font-mono', active ? 'text-white/80' : 'text-neutral-400')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 列表 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {isLoading || isFetching ? (
          <div className="grid sm:grid-cols-2 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton variant="rectangle" className="h-32 w-full" />
                <div className="mt-3 space-y-2">
                  <Skeleton variant="text" />
                  <Skeleton variant="text" count={2} />
                </div>
              </Card>
            ))}
          </div>
        ) : groups.every((g) => g.items.length === 0) ? (
          <EmptyState
            icon={<SearchIcon className="w-6 h-6" />}
            title={urlQ ? '没找到相关内容' : '请输入搜索词'}
            description={
              urlQ
                ? '试试其他关键词,例如「LangChain」「RAG」「Agent」'
                : '用 ⌘K 调出全站搜索,或在搜索框输入关键字'
            }
            action={
              urlQ ? (
                <Link to="/courses" className={buttonClassName({ variant: 'primary', size: 'md' })}>
                  浏览全部课程
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="space-y-10">
            {groups.map((g) => {
              if (g.items.length === 0) return null;
              return (
                <div key={g.type}>
                  {activeType === 'all' && (
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <TypeIcon type={g.type} />
                      {TYPE_LABEL[g.type]}
                      <span className="text-xs font-mono text-neutral-400">
                        ({g.items.length})
                      </span>
                    </h2>
                  )}
                  <div className="grid sm:grid-cols-2 gap-5">
                    {g.items.map((item) => (
                      <ResultCard key={`${g.type}-${item.id}`} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// =============================================================
// 内部小组件
// =============================================================

const TYPE_LABEL: Record<SearchResultType, string> = {
  course: '课程',
  degree: '学位',
  hackathon: '黑客松',
  instructor: '讲师',
};

function TypeIcon({ type }: { type: SearchResultType }) {
  const className = 'w-4 h-4 text-[#171717]';
  switch (type) {
    case 'course':
      return <BookOpen className={className} />;
    case 'degree':
      return <GraduationCap className={className} />;
    case 'hackathon':
      return <Trophy className={className} />;
    case 'instructor':
      return <UserIcon className={className} />;
  }
}

// 简单 Card 包装(Skeleton 用的)
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-neutral-0 dark:bg-neutral-100 border border-neutral-200 p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

// 渲染单个结果(按 type 走不同卡片样式)
function ResultCard({ item }: { item: SearchResult }) {
  switch (item.type) {
    case 'course':
      return <CourseResultCard item={item} />;
    case 'degree':
      return <DegreeResultCard item={item} />;
    case 'hackathon':
      return <HackathonResultCard item={item} />;
    case 'instructor':
      return <InstructorResultCard item={item} />;
  }
}

function CourseResultCard({ item }: { item: SearchResult }) {
  const tags = firstCourseTag(item.meta);
  return (
    <Link
      to={item.href}
      className="group rounded-xl bg-neutral-0 dark:bg-neutral-100 border border-neutral-200 hover:border-[#171717] hover:shadow-md transition overflow-hidden flex flex-col"
    >
      <div className={`aspect-video bg-gradient-to-br ${getCourseCoverGradient(tags)} relative overflow-hidden`}>
        {/* P0-fix (2026-10-16): 渲染课程封面图,与 CourseListPage/HomePage 一致 */}
        {item.thumbnail && (
          <img
            src={item.thumbnail}
            alt={`${item.title} 封面`}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {tags && (
          <span className="relative z-[2] absolute top-3 left-3 text-xs px-2 py-0.5 rounded-full bg-neutral-0/90 dark:bg-neutral-0/90 font-medium text-neutral-900">
            {tags}
          </span>
        )}
        {item.badge && (
          <span
            className={cn(
              'absolute z-[2] top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium',
              item.badge === '免费'
                ? 'bg-success-500 text-white'
                : item.badge === '公益'
                ? 'bg-warning-100 text-warning-500 border border-warning-500'
                : 'bg-xp-500 text-white font-mono',
            )}
          >
            {item.badge}
          </span>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-semibold text-base group-hover:text-[#171717] transition line-clamp-1">
          {item.title}
        </h3>
        {item.subtitle && (
          <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-600 line-clamp-2">
            {item.subtitle}
          </p>
        )}
        <div className="mt-auto pt-3 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-600 border-t border-neutral-200">
          <span className="flex items-center gap-1 truncate">
            <Clock className="w-3 h-3" />
            <span className="truncate">{item.subtitle ? '' : '点击查看详情'}</span>
          </span>
          <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

function DegreeResultCard({ item }: { item: SearchResult }) {
  return (
    <Link
      to={item.href}
      className="group rounded-xl bg-neutral-0 dark:bg-neutral-100 border border-neutral-200 hover:border-[#171717] hover:shadow-md transition p-5 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#EEEDE9] text-[#171717] text-[10px] font-black uppercase tracking-widest rounded-full">
          <GraduationCap className="w-3 h-3" /> Nano Degree
        </span>
        {item.badge && (
          <span
            className={cn(
              'text-[10px] font-black uppercase tracking-widest',
              item.badge === '免费' ? 'text-success-500' : 'text-xp-500',
            )}
          >
            {item.badge}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-base group-hover:text-[#171717] transition line-clamp-1">
        {item.title}
      </h3>
      {item.subtitle && (
        <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-600 line-clamp-2">
          {item.subtitle}
        </p>
      )}
      <div className="mt-auto pt-3 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-600 border-t border-neutral-200">
        {item.meta ? (
          <span className="font-mono">{item.meta}</span>
        ) : (
          <span />
        )}
        <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </div>
    </Link>
  );
}

function HackathonResultCard({ item }: { item: SearchResult }) {
  return (
    <Link
      to={item.href}
      className="group rounded-xl bg-neutral-0 dark:bg-neutral-100 border border-neutral-200 hover:border-[#171717] hover:shadow-md transition p-5 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-full',
            item.badge === '进行中'
              ? 'bg-success-500 text-white'
              : item.badge === '评审中'
              ? 'bg-warning-500 text-white'
              : item.badge === '已结束'
              ? 'bg-neutral-200 text-neutral-600'
              : 'bg-[#EEEDE9] text-[#171717]',
          )}
        >
          <Trophy className="w-3 h-3" /> {item.badge ?? '即将开始'}
        </span>
      </div>
      <h3 className="font-semibold text-base group-hover:text-[#171717] transition line-clamp-1">
        {item.title}
      </h3>
      {item.subtitle && (
        <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-600 line-clamp-2">
          {item.subtitle}
        </p>
      )}
      <div className="mt-auto pt-3 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-600 border-t border-neutral-200">
        {item.meta ? (
          <span className="flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{item.meta}</span>
          </span>
        ) : (
          <span />
        )}
        <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </div>
    </Link>
  );
}

function InstructorResultCard({ item }: { item: SearchResult }) {
  // 拿首字当头像 placeholder
  const initial = item.title.charAt(0).toUpperCase();
  return (
    <Link
      to={item.href}
      className="group rounded-xl bg-neutral-0 dark:bg-neutral-100 border border-neutral-200 hover:border-[#171717] hover:shadow-md transition p-5 flex items-start gap-4"
    >
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#171717] to-[#262626] flex items-center justify-center text-white text-xl font-black shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-base group-hover:text-[#171717] transition line-clamp-1">
          {item.title}
        </h3>
        {item.subtitle && (
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-600 line-clamp-1">
            {item.subtitle}
          </p>
        )}
        {item.meta && (
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-600 font-mono">
            {item.meta}
          </p>
        )}
      </div>
      <ArrowUpRight className="w-4 h-4 text-neutral-400 group-hover:text-[#171717] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0 mt-1" />
    </Link>
  );
}
