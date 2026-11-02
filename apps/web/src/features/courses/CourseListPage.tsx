/**
 * CourseListPage — P1-2 升级版(按 mock-course-list.html 重写)
 *
 * 重大变化(相对前一版):
 *   1. URL ?q= 接真 search 状态,300ms debounce 实时拉取
 *   2. 左侧:完整筛选侧栏
 *      - 分类(LLM 应用 / RAG / Agent / MLOps / 基础理论 / AI 产品)
 *      - 难度(Beginner / Intermediate / Advanced / Expert)
 *      - 时长(4 档)
 *      - 收费(免费 / 付费 / 公益)  ← 原有 4 tab 升级成"收费"区块
 *      - 标签(动态从结果里提取 top 8)
 *      - 讲师(动态从结果里提取)
 *      - 评分(4.0+ / 3.0+ / 全部)
 *      - 清除全部筛选按钮
 *   3. 右侧:排序条(最新 / 最热门 / 评分)+ 计数
 *   4. 卡片:复用 P0-5 home 的 Card 风格(rounded-xl + hover #171717,brutalist 硬边)
 *   5. mobile:筛选侧栏折叠成顶部一行(可点开 filter sheet),排序条保留
 *   6. 暗色:全部走 token
 *
 * 排序由后端 /api/v1/courses?sort=popular|recent|rating 完成。
 * 评分筛选基于接口返回的真实 review 平均分。
 *
 * 设计约束:
 *   - 不引新依赖,复用 P0-4 Button/Card/EmptyState/Skeleton/Input + 现有 lucide
 *   - 4 个收费 tab 改为"收费"区块里的复选框(规格对齐 mock)
 *   - 旧 courseType 过滤器(自有/合作/公开/第三方)合并到"分类"区块作为补充
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Seo } from '../../components/Seo';
import {
  Search as SearchIcon,
  Star,
  ArrowUpRight,
  X as XIcon,
  SlidersHorizontal as FilterIcon,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import { Button } from '../../components/ui/Button';
import { QueryErrorState } from '../../components/QueryErrorState';
import { cn } from '../../lib/cn';
import { useEnum, useList, usePageSettings, useI18n, pickPage } from '../../lib/cms';
import { useCollapsibleHero } from '../../hooks/useCollapsibleHero';
import { usePagination } from '../../hooks/usePagination';
import { firstCourseTag, parseCourseTags } from '../../lib/courseTags';

// =============================================================
// 类型(与 API 实际返回对齐)
// =============================================================
interface CourseInstructorLink {
  id: string;
  role: 'instructor' | 'mentor';
  isPrimary: boolean;
  instructor: {
    id: string;
    slug: string;
    name: string;
    avatarUrl?: string | null;
  };
}

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  instructor: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  costType: 'free' | 'paid' | 'charity';
  courseType: 'own' | 'partner' | 'public' | 'third_party';
  externalUrl?: string;
  price: number;
  tags: string;
  rating: number;
  reviewCount: number;
  enrollmentCount: number;
  createdAt: string;
  // 2026-08-04: 多讲师挂载 — 卡片上展示讲师头像, 跳讲师主页
  courseLinks?: CourseInstructorLink[];
}

type SortKey = 'popular' | 'recent' | 'rating';

// 时长档位(从 duration 字符串解析小时数 → 归类)
function durationBucket(d: string): 'lt4' | '4to8' | '8to12' | 'gt12' {
  const m = /([\d.]+)\s*h/i.exec(d ?? '');
  const hours = m ? parseFloat(m[1]) : 0;
  if (hours <= 0) return 'lt4';
  if (hours < 4) return 'lt4';
  if (hours < 8) return '4to8';
  if (hours < 12) return '8to12';
  return 'gt12';
}

const DURATION_LABELS: Record<ReturnType<typeof durationBucket>, string> = {
  lt4: '4 小时以内',
  '4to8': '4-8 小时',
  '8to12': '8-12 小时',
  gt12: '12 小时以上',
};

// 课程分类只来自后台 course_categories 表；空表显示空筛选，不伪造分类。
function useCategories() {
  const { data } = useList<{ key: string; label: string; isActive?: boolean }>('course-categories');
  return (data ?? [])
    .filter((category) => category.isActive !== false)
    .map((category) => ({ key: category.key, label: category.label }));
}

const LEVELS: Array<Course['level']> = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
// P0 (audit 2026-07-24): 删 inline FALLBACK_LEVEL_LABELS, useEnum('course_level') 内部
// course_level label 由 enum_translations 表提供。

// =============================================================
// 主组件
// =============================================================
export function CourseListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get('q') ?? '';
  const { getLabel: getLevelLabel } = useEnum('course_level');
  const levelLabel = (lv: Course['level']) => getLevelLabel(lv) || lv;

  // CMS-driven copy
  const CATEGORIES = useCategories();
  const { data: hotKws } = useList<{ keyword: string; scope?: string; isActive?: boolean }>('hot-keywords');
  const hotKeywords = useMemo(() => {
    if (hotKws && hotKws.length > 0) {
      return hotKws
        .filter((k) => (k.scope ?? 'courses') === 'courses' && k.isActive !== false)
        .map((k) => k.keyword);
    }
    return ['LangChain', 'RAG', 'Agent', 'vLLM', 'Fine-tuning'];
  }, [hotKws]);
  const { data: pageData } = usePageSettings('courses', [
    'list.h1', 'list.sub_template', 'list.search_placeholder',
    'list.hot_label', 'list.sort_label', 'list.empty_title',
    'list.empty_title_template', 'list.empty_desc', 'list.clear_filters', 'list.loading',
  ]);
  const { t } = useI18n();
  const coursesH1 = pickPage(pageData, 'list.h1', 'zh-CN', t('courses.list.h1', '课程大厅'));

  // 向下滚 → 收起顶部 hero (含搜索框), 向上滚 → 展开 (iOS Safari / Twitter 风格)
  const { ref: heroRef, isCollapsed } = useCollapsibleHero<HTMLElement>({ threshold: 120 });

  const [input, setInput] = useState(urlQ);
  const [debouncedQ, setDebouncedQ] = useState(urlQ);
  const [costFilter, setCostFilter] = useState<Set<Course['costType']>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<Course['level']>>(new Set());
  const [selectedDurations, setSelectedDurations] = useState<Set<ReturnType<typeof durationBucket>>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedInstructors, setSelectedInstructors] = useState<Set<string>>(new Set());
  const [minRating, setMinRating] = useState<0 | 3 | 4 | 5>(0);
  const [sort, setSort] = useState<SortKey>('popular');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // 同步 URL → input
  useEffect(() => {
    setInput(urlQ);
    setDebouncedQ(urlQ);
  }, [urlQ]);

  // debounce 300ms → 同步到 URL
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(input);
      const next = new URLSearchParams(searchParams);
      if (input.trim()) next.set('q', input.trim());
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // 搜索与排序交给后端；其余多选筛选基于当前结果客户端完成。
  const { data: courses, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['courses', debouncedQ, sort],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set('search', debouncedQ.trim());
      params.set('sort', sort);
      const { data } = await api.get<Course[]>(`/api/v1/courses?${params.toString()}`);
      return data;
    },
    staleTime: 30_000,
  });

  // 客户端筛选
  const filtered = useMemo(() => {
    if (!courses) return [];
    return courses.filter((c) => {
      if (costFilter.size > 0 && !costFilter.has(c.costType)) return false;
      if (selectedLevels.size > 0 && !selectedLevels.has(c.level)) return false;
      if (selectedDurations.size > 0 && !selectedDurations.has(durationBucket(c.duration))) return false;
      if (selectedTags.size > 0) {
        const courseTags = (c.tags ?? '').split(/[,，]/).map((t) => t.trim()).filter(Boolean);
        if (!courseTags.some((t) => selectedTags.has(t))) return false;
      }
      // 讲师筛选: 优先看 courseLinks 里挂的讲师, fallback 老字符串字段
      if (selectedInstructors.size > 0) {
        const linkedNames = (c.courseLinks ?? []).map((l) => l.instructor.name);
        const hits = [c.instructor, ...linkedNames].some((n) => selectedInstructors.has(n));
        if (!hits) return false;
      }
      if (minRating > 0 && (c.rating ?? 0) < minRating) return false;
      return true;
    });
  }, [courses, costFilter, selectedLevels, selectedDurations, selectedTags, selectedInstructors, minRating]);

  const sorted = filtered;

  // P1-4: 客户端分页(每页 24 条),先排序后分页
  const pagination = usePagination(sorted, { pageSize: 24 });

  // 动态提取:tag 频次(从结果里),instructor 列表
  const tagOptions = useMemo(() => {
    if (!courses) return [];
    const counts = new Map<string, number>();
    for (const c of courses) {
      (c.tags ?? '').split(/[,，]/).map((t) => t.trim()).filter(Boolean).forEach((t) => {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      });
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [courses]);

  const instructorOptions = useMemo(() => {
    if (!courses) return [];
    const counts = new Map<string, number>();
    for (const c of courses) {
      // 优先用 courseLinks 里挂的讲师, fallback 老字符串字段
      const names = (c.courseLinks ?? []).map((l) => l.instructor.name);
      if (names.length === 0 && c.instructor) names.push(c.instructor);
      for (const n of names) {
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [courses]);

  const clearAll = () => {
    setCostFilter(new Set());
    setSelectedLevels(new Set());
    setSelectedDurations(new Set());
    setSelectedTags(new Set());
    setSelectedInstructors(new Set());
    setMinRating(0);
  };

  const activeFilterCount =
    costFilter.size +
    selectedLevels.size +
    selectedDurations.size +
    selectedTags.size +
    selectedInstructors.size +
    (minRating > 0 ? 1 : 0);

  return (
    <div className="bg-[#F5F4F0] min-h-screen text-[#171717]">
      <Seo
        title={coursesH1}
        description="从系统化课程中找到你的下一步"
        path="/courses"
      />
      {/* Header banner (collapsible on scroll) */}
      <section
        ref={heroRef}
        className={cn(
          'border-b border-[#171717] bg-[#F5F4F0] transition-all duration-300 ease-out',
          isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[1200px] opacity-100',
        )}
        aria-hidden={isCollapsed}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#171717]">
            {coursesH1}
          </h1>
          <p className="mt-2 text-sm md:text-base text-[#666666]">
            {courses
              ? pickPage(pageData, 'list.sub_template', 'zh-CN', t('courses.list.sub', '从 {count} 门系统化课程中找到你的下一步'))
                  .replace('{count}', String(courses.length))
              : pickPage(pageData, 'list.loading', 'zh-CN', t('common.loading', '加载课程中...'))}
          </p>

          {/* 搜索框(URL 同步) — P1-3 用 SearchInput 加 aria-label */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="mt-6 max-w-2xl"
          >
            <SearchInput
              size="lg"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pickPage(pageData, 'list.search_placeholder', 'zh-CN', t('courses.list.search_placeholder', '搜索课程 / 讲师 / 技能'))}
              rightAddon={
                <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono border border-[#171717] text-[#171717]">
                  ⌘K
                </kbd>
              }
              ariaLabel={t('courses.list.search_placeholder', '搜索课程 / 讲师 / 技能')}
              fullWidth
            />
          </form>

          {/* 热门关键词 chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#666666]">{pickPage(pageData, 'list.hot_label', 'zh-CN', t('courses.list.hot_label', '热门:'))}</span>
            {hotKeywords.map((kw) => (
              <button
                key={kw}
                onClick={() => setInput(kw)}
                className="px-2.5 py-0.5 text-xs font-medium bg-[#EEEDE9] text-[#171717] hover:bg-[#171717] hover:text-white transition-colors"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 主体:左侧筛选 + 右侧列表 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* mobile 筛选按钮(默认折叠) */}
        <div className="lg:hidden mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobileFiltersOpen(true)}
            leftIcon={<FilterIcon className="w-4 h-4" />}
          >
            {t('courses.filter.title', '筛选')} {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <label className="flex items-center gap-2 text-xs text-[#666666]">
            排序
            <select
              aria-label="课程排序"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="min-h-10 border border-[#171717] bg-[#F5F4F0] px-2 text-sm text-[#171717]"
            >
              <option value="popular">最热门</option>
              <option value="recent">最新</option>
              <option value="rating">评分</option>
            </select>
          </label>
          <div className="text-sm text-[#666666]">
            {isLoading ? t('common.loading.dots', '加载中…') : `${t('common.found.label', '共找到')} ${sorted.length} ${t('common.units.courses', '门课程')}`}
          </div>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          {/* 左侧筛选侧栏 — < lg 时用 fixed 弹层,≥ lg 时 sticky in-flow */}
          <aside
            className={cn(
              'space-y-6',
              'lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2',
              mobileFiltersOpen
                ? 'fixed inset-0 z-[150] lg:static lg:z-auto overflow-y-auto bg-[#F5F4F0] p-5 lg:p-0'
                : 'hidden lg:block',
            )}
          >
            {/* mobile 弹层关闭按钮 — lg 时 hidden */}
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <h3 className="text-base font-bold flex items-center gap-2">
                <FilterIcon className="w-4 h-4 text-[#171717]" />
                {t('courses.filter.title', '筛选')} {activeFilterCount > 0 && `(${activeFilterCount})`}
              </h3>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1.5 rounded-md text-[#666666] hover:bg-[#EEEDE9]"
                aria-label="关闭筛选"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <FilterSection title={t("courses.filter.category", "分类")} defaultOpen>
              {CATEGORIES.map((cat) => (
                <label key={cat.key} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedTags.has(cat.key)}
                    onChange={(e) => {
                      const next = new Set(selectedTags);
                      if (e.target.checked) next.add(cat.key);
                      else next.delete(cat.key);
                      setSelectedTags(next);
                    }}
                  />
                  <span>{cat.label}</span>
                </label>
              ))}
            </FilterSection>

            <FilterSection title={t("courses.filter.level", "难度")} defaultOpen>
              <div className="grid grid-cols-2 gap-2">
                {LEVELS.map((lv) => {
                  const active = selectedLevels.has(lv);
                  return (
                    <button
                      key={lv}
                      onClick={() => {
                        const next = new Set(selectedLevels);
                        if (active) next.delete(lv);
                        else next.add(lv);
                        setSelectedLevels(next);
                      }}
                      className={cn(
                        'px-3 py-1.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#171717]',
                        active
                          ? 'bg-[#171717] text-white'
                          : 'bg-[#EEEDE9] text-[#171717] hover:bg-[#171717] hover:text-white',
                      )}
                    >
                      {levelLabel(lv)}
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            <FilterSection title={t("courses.filter.duration", "时长")} defaultOpen>
              {(Object.keys(DURATION_LABELS) as Array<ReturnType<typeof durationBucket>>).map((dk) => {
                const active = selectedDurations.has(dk);
                return (
                  <label key={dk} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <input
                      type="radio"
                      name="duration"
                      checked={active}
                      onChange={() => {
                        const next = new Set(selectedDurations);
                        if (active) next.delete(dk);
                        else next.add(dk);
                        setSelectedDurations(next);
                      }}
                    />
                    <span>{DURATION_LABELS[dk]}</span>
                  </label>
                );
              })}
            </FilterSection>

            <FilterSection title={t("courses.filter.cost", "收费")} defaultOpen>
              {(['free', 'paid', 'charity'] as const).map((k) => {
                const active = costFilter.has(k);
                return (
                  <label key={k} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={active}
                      onChange={(e) => {
                        const next = new Set(costFilter);
                        if (e.target.checked) next.add(k);
                        else next.delete(k);
                        setCostFilter(next);
                      }}
                    />
                    <span>
                      {k === 'free' ? t('course.cost.free', '免费') : k === 'paid' ? t('course.cost.paid', '付费') : t('course.cost.charity', '公益')}
                    </span>
                  </label>
                );
              })}
            </FilterSection>

            {tagOptions.length > 0 && (
              <FilterSection title={t("courses.filter.tag", "标签")}>
                {tagOptions.map(([t, count]) => {
                  const active = selectedTags.has(t);
                  return (
                    <label key={t} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={active}
                        onChange={(e) => {
                          const next = new Set(selectedTags);
                          if (e.target.checked) next.add(t);
                          else next.delete(t);
                          setSelectedTags(next);
                        }}
                      />
                      <span className="flex-1 truncate">{t}</span>
                      <span className="ml-auto text-xs text-[#999999] font-mono">{count}</span>
                    </label>
                  );
                })}
              </FilterSection>
            )}

            {instructorOptions.length > 0 && (
              <FilterSection title={t("courses.filter.instructor", "讲师")}>
                {instructorOptions.map(([name, count]) => {
                  const active = selectedInstructors.has(name);
                  return (
                    <label key={name} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={active}
                        onChange={(e) => {
                          const next = new Set(selectedInstructors);
                          if (e.target.checked) next.add(name);
                          else next.delete(name);
                          setSelectedInstructors(next);
                        }}
                      />
                      <span className="flex-1 truncate">{name}</span>
                      <span className="ml-auto text-xs text-[#999999] font-mono">{count}</span>
                    </label>
                  );
                })}
              </FilterSection>
            )}

            <FilterSection title={t("courses.filter.rating", "评分")} defaultOpen>
              {[
                { v: 0, label: '全部' },
                { v: 5, label: '★ 5.0' },
                { v: 4, label: '★ 4.0+' },
                { v: 3, label: '★ 3.0+' },
              ].map((opt) => {
                const active = minRating === opt.v;
                return (
                  <label key={opt.v} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <input
                      type="radio"
                      name="rating"
                      checked={active}
                      onChange={() => setMinRating(opt.v as 0 | 3 | 4 | 5)}
                    />
                    <span className={opt.v > 0 ? 'text-warning-500' : ''}>{opt.label}</span>
                  </label>
                );
              })}
            </FilterSection>

            <button
              onClick={clearAll}
              className="w-full px-3 py-2 text-sm border border-[#171717] text-[#171717] hover:bg-[#171717] hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#171717]"
            >
              {t('courses.list.clear_all', '清除全部筛选')}
            </button>

            {/* mobile 完成按钮 — lg 隐藏 */}
            {mobileFiltersOpen && (
              <Button
                variant="primary"
                size="md"
                className="w-full mt-4 lg:hidden"
                onClick={() => setMobileFiltersOpen(false)}
              >
                {t('courses.list.view_n_courses', '查看 {count} 门课程').replace('{count}', String(sorted.length))}
              </Button>
            )}
          </aside>

          {/* mobile 筛选遮罩 — lg 隐藏 */}
          {mobileFiltersOpen && (
            <button
              type="button"
              aria-label="关闭筛选"
              onClick={() => setMobileFiltersOpen(false)}
              className="lg:hidden fixed inset-0 z-[140] bg-neutral-900/50/70 backdrop-blur-sm -m-4 sm:-m-6 lg:m-0"
            />
          )}

          {/* 右侧列表 */}
          <div>
            {/* 顶部排序条 + 计数(desktop) */}
            <div className="hidden lg:flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="text-sm text-[#666666]">
                {t('common.found.label', '共找到')}{' '}
                <span className="font-mono font-medium text-[#171717]">
                  {sorted.length}
                </span>{' '}
                {t('common.units.courses', '门课程')}
                {activeFilterCount > 0 && (
                  <span className="ml-2 text-[#171717]">
                    ({activeFilterCount} {t('common.filter_count', '个筛选')})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#666666]">{pickPage(pageData, 'list.sort_label', 'zh-CN', t('courses.list.sort_label', '排序:'))}</span>
                {[
                  { v: 'popular', label: '最热门' },
                  { v: 'recent', label: '最新' },
                  { v: 'rating', label: '评分' },
                ].map((opt) => {
                  const active = sort === opt.v;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => setSort(opt.v as SortKey)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#171717]',
                        active
                          ? 'bg-[#171717] text-white'
                          : 'bg-[#EEEDE9] text-[#171717] hover:bg-[#171717] hover:text-white',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 课程网格 */}
            {isError ? (
              <QueryErrorState error={error} onRetry={refetch} />
            ) : isLoading ? (
              <div className="grid sm:grid-cols-2 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} padding="none" className="overflow-hidden">
                    <Skeleton variant="rectangle" className="aspect-video w-full rounded-none" />
                    <div className="p-5 space-y-3">
                      <Skeleton variant="text" />
                      <Skeleton variant="text" count={2} />
                    </div>
                  </Card>
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={<SearchIcon className="w-6 h-6" />}
                title={debouncedQ
                  ? pickPage(pageData, 'list.empty_title_template', 'zh-CN', t('courses.list.empty_title_template', '没找到「{query}」相关课程'))
                      .replace('{query}', debouncedQ)
                  : pickPage(pageData, 'list.empty_title', 'zh-CN', t('courses.list.empty_title', '没有匹配的课程'))}
                description={pickPage(pageData, 'list.empty_desc', 'zh-CN', t('courses.list.empty_desc', '试试调整筛选条件,或清空后重新搜索'))}
                action={
                  <Button variant="primary" size="md" onClick={clearAll}>
                    {pickPage(pageData, 'list.clear_filters', 'zh-CN', t('courses.list.clear_filters', '清除筛选'))}
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-5">
                  {pagination.pageItems.map((course) => (
                    <CourseCardLink key={course.id} course={course} />
                  ))}
                </div>
                {pagination.totalPages > 1 && (
                  <PaginationControl
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    total={pagination.total}
                    onPrev={pagination.prev}
                    onNext={pagination.next}
                    onGoto={pagination.goto}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// =============================================================
// 子组件
// =============================================================

function FilterSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-sm font-semibold mb-3 focus:outline-none focus:ring-2 focus:ring-[#171717]"
        aria-expanded={open}
      >
        <span>{title}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="space-y-1">{children}</div>}
      <hr className="mt-4 border-[#171717]" />
    </div>
  );
}

function CourseCardLink({ course }: { course: Course }) {
  const isFree = course.costType === 'free';
  const isCharity = course.costType === 'charity';
  const { getLabel: getLevelLabel } = useEnum('course_level');
  const levelLabel = (lv: Course['level']) => getLevelLabel(lv) || lv;
  const tags = parseCourseTags(course.tags);
  // 卡片用覆盖层链接提供真实 href；讲师链接提升 z-index 保持独立可点。
  // 这样既避免嵌套 <a>，也保留复制链接、新标签页和辅助技术语义。
  const courseHref = course.externalUrl && course.courseType === 'third_party'
    ? course.externalUrl
    : `/courses/${course.id}`;
  const isExternal = !!(course.externalUrl && course.courseType === 'third_party');
  return (
    <div className="group relative bg-[#F5F4F0] border border-[#171717] hover:bg-[#EEEDE9] transition overflow-hidden flex flex-col">
      {isExternal ? (
        <a
          href={courseHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`查看课程：${course.title}（外部网站）`}
          className="absolute inset-0 z-[1] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#171717]"
        />
      ) : (
        <Link
          to={courseHref}
          aria-label={`查看课程：${course.title}`}
          className="absolute inset-0 z-[1] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#171717]"
        />
      )}
      <div
        className="aspect-video bg-gradient-to-br from-[#171717] to-[#262626] relative overflow-hidden"
      >
        {/* P0-fix (2026-10-15): 渲染课程封面图。thumbnail 来自后端,默认 https://picsum.photos/seed/<slug>/800/400
            CSP img-src 已放行 picsum.photos(见 apps/web/index.html) */}
        {course.thumbnail && (
          <img
            src={course.thumbnail}
            alt={`${course.title} 封面`}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {firstCourseTag(course.tags) && (
          <span className="absolute top-3 left-3 text-xs px-2 py-0.5 bg-white/90 font-medium text-[#171717] z-[2]">
            {firstCourseTag(course.tags)}
          </span>
        )}
        <span className="absolute top-3 right-3 text-xs px-2 py-0.5 bg-cert-500 text-white font-medium z-[2]">
          {levelLabel(course.level)}
        </span>
        <span
          className={cn(
            'absolute bottom-3 right-3 text-xs px-2 py-0.5 font-medium z-[2]',
            isFree
              ? 'bg-success-500 text-white'
              : isCharity
              ? 'bg-warning-100 text-warning-500 border border-warning-500'
              : 'bg-xp-500 text-white font-mono',
          )}
        >
          {isFree ? '免费' : isCharity ? '公益' : `¥ ${course.price}`}
        </span>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-semibold text-base group-hover:text-[#171717] transition line-clamp-1">
          {course.title}
        </h3>
        <p className="mt-1.5 text-sm text-[#666666] line-clamp-2">
          {course.description}
        </p>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 3)
              .map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 text-[10px] font-medium bg-[#EEEDE9] text-[#666666]"
                >
                  {t}
                </span>
              ))}
          </div>
        )}
        <div className="mt-auto pt-3 flex items-center justify-between text-xs text-[#666666] border-t border-[#171717]">
          <div className="flex items-center gap-2 truncate min-w-0">
            {/* 2026-08-04: 讲师头像 — 优先 courseLinks 头像, fallback 死字符串 */}
            {(() => {
              const primary = course.courseLinks?.find((l) => l.isPrimary)?.instructor
                ?? course.courseLinks?.[0]?.instructor;
              if (primary?.avatarUrl) {
                return (
                  <img
                    src={primary.avatarUrl}
                    alt={`${primary.name} 头像`}
                    className="w-5 h-5 rounded-full object-cover shrink-0 bg-[#EEEDE9]"
                  />
                );
              }
              return <div className="w-5 h-5 rounded-full bg-[#171717] shrink-0" />;
            })()}
            {(() => {
              // 2026-08-04: 讲师名字 Link 到 /instructors/:slug (courseLinks 优先)
              // 阻止冒泡避免点讲师跳到课程页
              const primary = course.courseLinks?.find((l) => l.isPrimary)?.instructor
                ?? course.courseLinks?.[0]?.instructor;
              if (primary) {
                return (
                  <Link
                    to={`/instructors/${primary.slug}`}
                    className="relative z-[2] truncate text-[#171717] font-medium hover:underline"
                  >
                    {primary.name}
                    {course.courseLinks && course.courseLinks.length > 1 && (
                      <span className="text-[#666666] font-normal"> 等 {course.courseLinks.length - 1} 位</span>
                    )}
                  </Link>
                );
              }
              return <span className="truncate">{course.instructor}</span>;
            })()}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {course.reviewCount > 0 && (
              <span className="inline-flex items-center gap-1 font-mono" title={`${course.reviewCount} 条评价`}>
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                {course.rating.toFixed(1)}
              </span>
            )}
            <span className="font-mono">{course.duration}</span>
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * PaginationControl — 公共分页控件(P1-4 配套 usePagination)
 * 简单前后翻页 + 跳页 + 总数,brutalist 硬边风格
 */
function PaginationControl({
  currentPage,
  totalPages,
  total,
  onPrev,
  onNext,
  onGoto,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onGoto: (page: number) => void;
}) {
  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#171717] pt-5"
      aria-label="分页"
    >
      <div className="text-sm text-[#666666]">
        第 <span className="font-mono font-medium text-[#171717]">{currentPage}</span> / {totalPages} 页
        <span className="ml-2 font-mono">· 共 {total} 条</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentPage <= 1}
          aria-label="上一页"
          className="inline-flex min-h-11 items-center gap-1 px-3 py-1.5 text-xs font-black uppercase tracking-widest bg-[#F5F4F0] border border-[#171717] text-[#171717] hover:bg-[#171717] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[#171717]"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> 上一页
        </button>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={currentPage}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) onGoto(n);
          }}
          aria-label="跳到指定页"
          className="min-h-11 w-14 px-2 py-1.5 text-xs font-mono text-center bg-white border border-[#171717] focus:outline-none focus:ring-2 focus:ring-[#171717]"
        />
        <span className="text-xs text-[#666666]">/ {totalPages}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          aria-label="下一页"
          className="inline-flex min-h-11 items-center gap-1 px-3 py-1.5 text-xs font-black uppercase tracking-widest bg-[#F5F4F0] border border-[#171717] text-[#171717] hover:bg-[#171717] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[#171717]"
        >
          下一页 <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );
}
