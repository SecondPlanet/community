/**
 * InstructorListPage — 讲师墙 (公开, /instructors)
 *
 * 2026-08-04 新建: 之前只有详情页, 没列表入口, 学员发现讲师只能靠
 * Home 段 / 课程详情 / 搜索。
 *
 * 关键能力:
 *   - 专长 chip 筛选 (后端 /instructors/expertises 拉, 8 宫格)
 *   - 搜索 (按 name / title / headline, 走 query 串, 300ms debounce)
 *   - 排序 (推荐 / 名字 / 最新, 默认推荐 = orderIndex asc)
 *   - 卡片: 头像 + 名字 + title + headline + 专长 chip + 课程数
 *   - 整卡可点, 跳到 /instructors/:slug
 *
 * 复用组件: SearchInput / Skeleton / EmptyState / QueryErrorState / Seo
 * (跟 CourseListPage 风格统一 — brutalist 硬边 + #171717 hover)
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, BookOpen, X as XIcon, GraduationCap } from 'lucide-react';
import { Seo } from '../../components/Seo';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import { Button } from '../../components/ui/Button';
import { QueryErrorState } from '../../components/QueryErrorState';
import { instructorsApi, type InstructorSummary } from '../../lib/instructorsApi';
import { cn } from '../../lib/cn';

type SortKey = 'orderIndex' | 'name' | 'recent';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'orderIndex', label: '推荐' },
  { key: 'name', label: '姓名' },
  { key: 'recent', label: '最新' },
];

export function InstructorListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const urlExpertise = searchParams.get('expertise') ?? '';
  const urlSort = (searchParams.get('sort') as SortKey) || 'orderIndex';
  const urlPage = Number(searchParams.get('page') ?? '1') || 1;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [activeExpertiseId, setActiveExpertiseId] = useState<string>(urlExpertise);
  const [sort, setSort] = useState<SortKey>(urlSort);
  const [page, setPage] = useState<number>(urlPage);

  // 300ms debounce: searchInput → 推到 URL → 触发 query
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchInput) next.set('q', searchInput);
      else next.delete('q');
      next.delete('page'); // 搜过重置到第 1 页
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // 同步: 外部 URL 变化时, 同步本地 state (后退按钮等)
  useEffect(() => {
    setSearchInput(urlSearch);
    setActiveExpertiseId(urlExpertise);
    setSort(urlSort);
    setPage(urlPage);
  }, [urlSearch, urlExpertise, urlSort, urlPage]);

  // 专长列表
  const expertisesQuery = useQuery({
    queryKey: ['instructors', 'expertises'],
    queryFn: () => instructorsApi.listExpertises(),
    staleTime: 5 * 60_000,
  });

  // 讲师列表
  const listQuery = useQuery({
    queryKey: ['instructors', 'list', { search: urlSearch, expertiseIds: activeExpertiseId ? [activeExpertiseId] : [], sort, page }],
    queryFn: () =>
      instructorsApi.list({
        search: urlSearch || undefined,
        expertiseIds: activeExpertiseId ? [activeExpertiseId] : undefined,
        sort,
        page,
        limit: 24,
      }),
    placeholderData: (prev) => prev,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const expertises = expertisesQuery.data ?? [];

  const hasActiveFilter = Boolean(urlSearch || activeExpertiseId);

  const setUrlParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-0">
      <Seo
        title="讲师 · SecondPlanet"
        description="来自一线的 AI / 云 / 安全 / 产品 讲师 — 正在写代码、做产品的人，不是 PPT 复读机"
        path="/instructors"
      />

      {/* ───── Hero ───── */}
      <section className="border-b border-neutral-200 bg-neutral-0 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-neutral-500">/ Instructors</p>
          <h1 className="mt-3 text-4xl font-black tracking-tighter md:text-6xl">
            来自一线的讲师
          </h1>
          <p className="mt-4 max-w-2xl text-base text-neutral-600 dark:text-neutral-400">
            不是 PPT 复读机, 是正在写代码、正在做产品的人。<br />
            按专长筛选, 找到你下一段学习的引路人。
          </p>

          {/* 搜索框 */}
          <div className="mt-8 max-w-xl">
            <SearchInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索讲师名字 / 头衔 / 一句话简介…"
              leftAddon={<SearchIcon className="h-4 w-4" />}
              ariaLabel="搜索讲师"
            />
          </div>
        </div>
      </section>

      {/* ───── 主体 ───── */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          {/* 左侧 — 筛选侧栏 */}
          <aside className="space-y-6">
            {/* 专长 chip */}
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-neutral-500">专长</h2>
              {expertisesQuery.isLoading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-3/4" />
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip
                    active={!activeExpertiseId}
                    onClick={() => setUrlParam('expertise', null)}
                    label="全部"
                  />
                  {expertises.map((e) => (
                    <Chip
                      key={e.id}
                      active={activeExpertiseId === e.id}
                      onClick={() => setUrlParam('expertise', e.id === activeExpertiseId ? null : e.id)}
                      label={e.label}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 排序 */}
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-neutral-500">排序</h2>
              <div className="mt-3 flex flex-wrap gap-1">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setUrlParam('sort', o.key === 'orderIndex' ? null : o.key)}
                    className={cn(
                      'flex h-9 items-center px-3 text-left text-sm transition-colors',
                      sort === o.key
                        ? 'bg-[#171717] text-white'
                        : 'border border-neutral-200 text-neutral-700 hover:border-[#171717] dark:border-neutral-800 dark:text-neutral-300',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 清除 */}
            {hasActiveFilter && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchInput('');
                  setSearchParams(new URLSearchParams(), { replace: true });
                }}
                className="text-xs"
              >
                <XIcon className="h-3.5 w-3.5" /> 清除全部筛选
              </Button>
            )}
          </aside>

          {/* 右侧 — 列表 */}
          <section>
            {/* 计数 + 排序条 (移动端) */}
            <div className="mb-5 flex items-center justify-between text-sm text-neutral-500">
              <span>共 {total} 位讲师</span>
            </div>

            {listQuery.isError ? (
              <QueryErrorState
                error={listQuery.error}
                onRetry={() => listQuery.refetch()}
                title="无法加载讲师列表"
              />
            ) : listQuery.isLoading ? (
              <InstructorGridSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<GraduationCap className="h-5 w-5" />}
                title="没有匹配的讲师"
                description="试试清除筛选, 或换个搜索词。"
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((inst) => (
                  <InstructorCard key={inst.id} instructor={inst} />
                ))}
              </div>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-2 text-sm">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setUrlParam('page', String(Math.max(1, page - 1)))}
                >
                  上一页
                </Button>
                <span className="text-neutral-500">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setUrlParam('page', String(Math.min(totalPages, page + 1)))}
                >
                  下一页
                </Button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-8 items-center px-3 py-1 text-xs font-semibold transition-colors',
        active
          ? 'bg-[#171717] text-white'
          : 'border border-neutral-200 bg-neutral-0 text-neutral-700 hover:border-[#171717] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300',
      )}
    >
      {label}
    </button>
  );
}

function InstructorCard({ instructor }: { instructor: InstructorSummary }) {
  return (
    <Link
      to={`/instructors/${instructor.slug}`}
      className="group flex h-full flex-col border border-neutral-200 bg-neutral-0 p-5 transition-colors hover:border-[#171717] dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#171717] text-2xl font-black text-white">
          {instructor.avatarUrl ? (
            <img src={instructor.avatarUrl} alt={`${instructor.name} 的头像`} className="h-full w-full object-cover" />
          ) : (
            instructor.name.charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold group-hover:underline">{instructor.name}</h3>
          {instructor.title && (
            <p className="truncate text-sm text-neutral-600 dark:text-neutral-400">
              {[instructor.title, instructor.company].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {instructor.headline && (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-neutral-700 dark:text-neutral-300">
          {instructor.headline}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {instructor.expertiseLinks.slice(0, 3).map(({ expertise }) => (
          <span key={expertise.id} className="rounded-full bg-[#EEEDE9] px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {expertise.label}
          </span>
        ))}
        {instructor.expertiseLinks.length > 3 && (
          <span className="text-[10px] text-neutral-500">+{instructor.expertiseLinks.length - 3}</span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          {instructor._count.courseLinks} 门课程
        </span>
        {instructor.yearsOfExperience != null && (
          <span>{instructor.yearsOfExperience} 年经验</span>
        )}
      </div>
    </Link>
  );
}

function InstructorGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3 border border-neutral-200 bg-neutral-0 p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-start gap-4">
            <Skeleton variant="circle" className="h-16 w-16" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-12 w-full" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
