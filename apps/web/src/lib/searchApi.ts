/**
 * searchApi — v1.2.0 全量去 mock
 *
 * searchAll(q) 并行查 4 个端点 (/courses /degrees /hackathons /instructors)
 * 任一端点失败 → 该端点用空数组(无 mock fallback)
 *
 * 排序:
 *   - courses:     enrollmentCount DESC
 *   - degrees:     学员数 DESC(stats.totalLearners)
 *   - hackathons:  startDate ASC(进行中优先)
 *   - instructors: 课程数 DESC
 *
 * 讲师列表来自公开 instructors API，结果链接使用 slug 进入讲师详情页。
 */

import api from './api';
import { firstCourseTag } from './courseTags';
import { hackathonsApi } from './hackathonsApi';
import { instructorsApi, type InstructorSummary } from './instructorsApi';

// =============================================================
// 统一 SearchResult 类型
// =============================================================
export type SearchResultType = 'course' | 'degree' | 'hackathon' | 'instructor';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;       // 描述 / 副标题
  href: string;            // 跳转 URL
  meta?: string;           // 顶部小字(分类/讲师/学员数)
  badge?: string;          // 状态徽章(进行中/免费/...)
  thumbnail?: string;      // 封面图 URL(course 类型,P0-fix 2026-10-16)
}

// =============================================================
// 4 个端点的原始返回类型(只取我们需要的字段)
// =============================================================
interface CourseSearchRaw {
  id: string;
  title: string;
  description?: string;
  instructor?: string;
  level?: string;
  costType?: 'free' | 'paid' | 'charity';
  price?: number;
  tags?: string;
  enrollmentCount?: number;
  duration?: string;
  thumbnail?: string;
}

interface DegreeSearchRaw {
  id: string;
  title: string;
  description?: string;
  price?: number;
  costType?: 'free' | 'paid' | 'charity';
  stats?: { totalLearners?: number; courseCount?: number; estimatedHours?: number };
  courses?: Array<{ id: string; title: string }>;
}

// =============================================================
// 内部:把原始数据转换成 SearchResult + 排序
// =============================================================

function mapCourse(c: CourseSearchRaw): SearchResult {
  const badge =
    c.costType === 'free' ? '免费' :
    c.costType === 'charity' ? '公益' :
    c.price ? `¥ ${c.price}` : undefined;
  return {
    type: 'course',
    id: c.id,
    title: c.title,
    subtitle: c.description,
    href: `/courses/${c.id}`,
    meta: c.tags ? firstCourseTag(c.tags) : undefined,
    badge,
    thumbnail: c.thumbnail,
  };
}

function mapDegree(d: DegreeSearchRaw): SearchResult {
  const learners = d.stats?.totalLearners;
  return {
    type: 'degree',
    id: d.id,
    title: d.title,
    subtitle: d.description,
    href: `/degrees/${d.id}`,
    meta: learners ? `${learners} 学员` : undefined,
    badge:
      d.costType === 'free' ? '免费' :
      d.costType === 'charity' ? '公益' :
      d.price ? `¥ ${d.price}` : undefined,
  };
}

function mapHackathon(h: { id: string; title: string; description?: string; status?: string; startDate?: string | Date; location?: string | null }): SearchResult {
  let badge = '即将开始';
  if (h.status === 'active') badge = '进行中';
  else if (h.status === 'judging') badge = '评审中';
  else if (h.status === 'finished') badge = '已结束';
  else if (h.status === 'cancelled') badge = '已取消';
  return {
    type: 'hackathon',
    id: h.id,
    title: h.title,
    subtitle: h.description,
    href: `/hackathons/${h.id}`,
    meta: h.location ?? undefined,
    badge,
  };
}

function mapInstructor(i: InstructorSummary): SearchResult {
  return {
    type: 'instructor',
    id: i.id,
    title: i.name,
    subtitle: i.title,
    href: `/instructors/${encodeURIComponent(i.slug)}`,
    meta: i._count.courseLinks ? `${i._count.courseLinks} 门课程` : undefined,
  };
}

// 排序辅助
function sortCourses(list: CourseSearchRaw[]): CourseSearchRaw[] {
  return [...list].sort((a, b) => (b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0));
}
function sortDegrees(list: DegreeSearchRaw[]): DegreeSearchRaw[] {
  return [...list].sort(
    (a, b) => (b.stats?.totalLearners ?? 0) - (a.stats?.totalLearners ?? 0),
  );
}
function sortHackathons<T extends { id: string; startDate?: string | Date }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ta = a.startDate ? new Date(a.startDate).getTime() : Infinity;
    const tb = b.startDate ? new Date(b.startDate).getTime() : Infinity;
    return ta - tb;  // 升序,进行中 / 最近的在前
  });
}
function sortInstructors(list: InstructorSummary[]): InstructorSummary[] {
  return [...list].sort((a, b) => b._count.courseLinks - a._count.courseLinks);
}

// =============================================================
// 主入口:searchAll(q)
// =============================================================

export interface SearchAllResult {
  results: SearchResult[];
  /** 每个 type 单独的结果数,给 UI 分组 / 分 tab 用 */
  counts: Record<SearchResultType, number>;
  /** 是否有任一端点失败(给 UI 显示提示) */
  hasFailures: boolean;
}

export async function searchAll(q: string): Promise<SearchAllResult> {
  const query = q.trim();

  // 4 端点并行查(用 allSettled 避免一个挂掉全部挂)
  // instructor 端点目前不存在,容错让单端点 null 不影响其他
  const [courseRes, degreeRes, hackathonRes, instructorRes] = await Promise.allSettled([
    api
      .get<CourseSearchRaw[]>('/api/v1/courses', { params: { search: query } })
      .then((r) => r.data),
    api
      .get<DegreeSearchRaw[]>('/api/v1/degrees', { params: { search: query } })
      .then((r) => r.data),
    hackathonsApi.getAll(query ? { search: query } : undefined),
    instructorsApi
      .list({ search: query, limit: 100 })
      .then((r) => r.items)
      .catch(() => null),
  ]);

  // 任一端点失败 → 该 type 返空(无 mock fallback)
  const courses: CourseSearchRaw[] = courseRes.status === 'fulfilled' ? courseRes.value : [];
  const degrees: DegreeSearchRaw[] = degreeRes.status === 'fulfilled' ? degreeRes.value : [];
  const hackathons =
    hackathonRes.status === 'fulfilled' && hackathonRes.value ? hackathonRes.value : [];
  const instructors: InstructorSummary[] =
    instructorRes.status === 'fulfilled' && instructorRes.value ? instructorRes.value : [];

  const hasFailures =
    courseRes.status === 'rejected' ||
    degreeRes.status === 'rejected' ||
    (hackathonRes.status === 'rejected' || !hackathonRes.value) ||
    (instructorRes.status === 'rejected' || !instructorRes.value);

  // 客户端再过一遍搜索关键字(后端 search 已经过了一次,这里只是保险)
  const filteredCourses = query
    ? courses.filter((c) => matchQuery(c.title, query) || matchQuery(c.description ?? '', query))
    : courses;
  const filteredDegrees = query
    ? degrees.filter((d) => matchQuery(d.title, query) || matchQuery(d.description ?? '', query))
    : degrees;
  const filteredHackathons = query
    ? hackathons.filter((h) => matchQuery(h.title, query) || matchQuery(h.description ?? '', query))
    : hackathons;
  const filteredInstructors = query
    ? instructors.filter((i) => matchQuery(i.name, query) || matchQuery(i.title ?? '', query))
    : instructors;

  return {
    results: [
      ...sortCourses(filteredCourses).map(mapCourse),
      ...sortDegrees(filteredDegrees).map(mapDegree),
      ...sortHackathons(filteredHackathons).map(mapHackathon),
      ...sortInstructors(filteredInstructors).map(mapInstructor),
    ],
    counts: {
      course: filteredCourses.length,
      degree: filteredDegrees.length,
      hackathon: filteredHackathons.length,
      instructor: filteredInstructors.length,
    },
    hasFailures,
  };
}

function matchQuery(text: string, q: string): boolean {
  if (!q) return true;
  return text.toLowerCase().includes(q.toLowerCase());
}

// =============================================================
// 分组工具(给 CommandPalette + SearchPage 用)
// =============================================================

export interface SearchGroup {
  type: SearchResultType;
  label: string;
  items: SearchResult[];
}

export function groupResults(
  results: SearchResult[],
  labels?: Record<SearchResultType, string>,
): SearchGroup[] {
  const order: SearchResultType[] = ['course', 'degree', 'hackathon', 'instructor'];
  const fallbackLabels: Record<SearchResultType, string> = {
    course: '课程',
    degree: '学位',
    hackathon: '黑客松',
    instructor: '讲师',
  };
  const finalLabels = labels ?? fallbackLabels;
  return order.map((t) => ({
    type: t,
    label: finalLabels[t],
    items: results.filter((r) => r.type === t),
  }));
}
