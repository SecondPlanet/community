/**
 * HomePage — P0-5 落地版
 *
 * 按 review/mocks/mock-home.html 的 8 段位顺序:
 *   1) hero(大标语 + 4 数据点 + 2 CTA + 右侧课程预览 mock)
 *   2) 热门课程(coursesApi 前 6)
 *   3) 学位路径(degreesApi 前 3)
 *   4) 黑客松(hackathonsApi 进行中 3 个,含倒计时)
 *   5) AI 助教 CTA(品牌宣言 + AI 聊天气泡)
 *   6) 讲师墙(4 个真实讲师, 走 /api/v1/instructors, 2026-08-04 接入)
 *   7) footer(4 列)
 *   8) AI 助教 FAB + mobile bottom tab — 实际放在 Layout
 *
 * 设计约束:
 *   - 全部用现成 Button / Card / Skeleton / EmptyState 4 个 P0-4 基础组件
 *   - 不写新组件 / 不引新依赖
 *   - 数据拉取 4xx/5xx 时,走 QueryErrorState 显示错误 + 重试(v1.5.0 修复:不再 silent fallback mock)
 *   - 暗色:用 token,跟随 <html class="dark">
 *
 * 备注:Layout 负责顶部 nav / theme toggle / FAB / bottom tab,
 * HomePage 只负责 8 段主体内容。
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Seo } from '../../components/Seo';
import {
  Clock,
  User as UserIcon,
  Sparkles,
  ArrowUpRight,
  Star,
  Trophy,
  MapPin,
  BookOpen,
  GraduationCap,
  Github,
  PlayCircle,
} from 'lucide-react';
import { useMemo } from 'react';
import api from '../../lib/api';
import { instructorsApi } from '../../lib/instructorsApi';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { participantApi, isActiveRegistration } from '../hackathons/participantApi';
import { useAuthStore } from '../../stores/authStore';
import { buttonClassName } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { QueryErrorState } from '../../components/QueryErrorState';
import { useSiteSettings, usePageSettings, useI18n, pickSite, pickPage } from '../../lib/cms';
import { useCollapsibleHero } from '../../hooks/useCollapsibleHero';
import { cn } from '../../lib/cn';
import { firstCourseTag } from '../../lib/courseTags';

const OPEN_SOURCE_REPOSITORY_URL = 'https://github.com/SecondPlanet/community';

// =============================================================
// 公共类型(贴近后端 schema,但不引 shared-types 避免循环依赖)
// =============================================================
interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  instructor: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  costType: 'free' | 'paid' | 'charity';
  price: number;
  tags: string;
  rating: number;
  reviewCount: number;
}

interface Degree {
  id: string;
  title: string;
  description: string;
  icon: string;
  price: number;
  costType: 'free' | 'paid' | 'charity';
  courses?: Array<{ id: string; title: string; stepNumber: number }>;
  stats?: { courseCount: number; totalLessons: number; estimatedHours: number; totalLearners: number };
}

interface Hackathon {
  id: string;
  title: string;
  description: string;
  status: 'upcoming' | 'active' | 'judging' | 'finished' | 'cancelled';
  startDate: string | Date;
  endDate: string | Date;
  registerDeadline?: string | Date | null;
  location?: string | null;
  maxTeamSize: number;
  minTeamSize: number;
  _count?: { registrations?: number };
}

// =============================================================
// Site Stats (来自 GET /api/v1/site/stats — 公开 endpoint, 不用鉴权)
// =============================================================
interface SiteStats {
  activeLearners: number;
  totalCourses: number;
  totalProjects: number;
  totalDegrees: number;
  activeHackathonCount: number;
  currentTermLabel: string;
  featuredCourse: {
    id: string;
    title: string;
    description: string;
    level: string;
    duration: string;
    instructor: string;
    tags: string;
    thumbnail: string;
    enrollmentCount: number;
    lessonCount: number;
  } | null;
}

interface MyEnrollment {
  id: string;
  enrolledAt: string;
  course: {
    id: string;
    title: string;
    thumbnail: string;
    duration: string;
    instructor: string;
    level: string;
  } | null;
}

// 格式化大数字: 12400 -> "1.2万", 2400 -> "2,400"
function formatStatNumber(n: number): string {
  if (n >= 10000) {
    const v = n / 10000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}万`;
  }
  if (n >= 1000) {
    return n.toLocaleString('en-US');
  }
  return n.toString();
}

// =============================================================
// 倒计时 hook (两态: 距开始 / 距截止)
// =============================================================
interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  phase: 'upcoming' | 'active' | 'ended';
  label: string;  // 中文 label: '距开始' / '距截止' / '已结束'
}

function useCountdown(
  startDate: string | Date,
  endDate?: string | Date,
  deadline?: string | Date | null,
): CountdownState {
  return useMemo(() => {
    const start = new Date(startDate).getTime();
    const end = endDate ? new Date(endDate).getTime() : start + 7 * 24 * 3600 * 1000;
    // ponytail: 若有报名截止,倒计时锚定报名截止(比活动结束更贴近用户决策)
    const registerEnd = deadline ? new Date(deadline).getTime() : undefined;
    const now = Date.now();

    let target: number;
    let phase: 'upcoming' | 'active' | 'ended';
    let label: string;
    if (now < start) {
      target = start;
      phase = 'upcoming';
      label = '距开始';
    } else if (registerEnd !== undefined && now < registerEnd) {
      target = registerEnd;
      phase = 'active';
      label = '距报名截止';
    } else if (now < end) {
      target = end;
      phase = 'active';
      label = '距截止';
    } else {
      target = now;
      phase = 'ended';
      label = '已结束';
    }
    const diff = Math.max(0, target - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    return { days, hours, minutes, phase, label };
  }, [startDate, endDate, deadline]);
}

// =============================================================
// 课程封面 fallback(按 tags 选 brutalist 实心底)
// brutalist 不要渐变,统一 #171717 / #262626 黑灰硬边
// =============================================================
function getCourseCoverBg(tags: string | undefined): string {
  const t = (tags ?? '').toLowerCase();
  if (t.includes('rag')) return 'bg-[#171717]';
  if (t.includes('mlops') || t.includes('deploy')) return 'bg-[#262626]';
  if (t.includes('fine') || t.includes('tune')) return 'bg-[#171717]';
  if (t.includes('llm')) return 'bg-[#171717]';
  return 'bg-[#171717]';
}

// =============================================================
// 4 段:热门课程
// =============================================================
function CoursesSection() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['home', 'courses'],
    queryFn: async () => {
      const { data: d } = await api.get<Course[]>('/api/v1/courses?sort=popular');
      return d;
    },
    retry: 1,
    staleTime: 60_000,
  });

  // CMS-driven copy
  const { t } = useI18n();
  const { data: homePages } = usePageSettings('home', ['courses_subhead']);

  // 失败 / 空 → 渲染 EmptyState(无 mock fallback)
  const courses = data ?? [];

  return (
    <section className="py-16 md:py-24 bg-[#F5F4F0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#171717]">
              {t('section.courses.title', '热门课程')}
            </h2>
            <p className="mt-2 text-[#666666] text-sm md:text-base">
              {pickPage(homePages, 'courses_subhead', 'zh-CN', t('section.courses.sub', '每门课 4-8 周,学完一个可被验证的能力'))}
            </p>
          </div>
          <Link
            to="/courses"
            className="text-sm text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white font-medium hidden sm:inline-flex items-center gap-1"
          >
            浏览全部 <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
        ) : isError ? (
          <QueryErrorState error={error} onRetry={() => void refetch()} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-6 h-6" />}
            title={t('course.empty.title', '暂无课程')}
            description={t('course.empty.desc', '课程正在准备中,稍后再来看看吧。')}
            action={
              <Link to="/courses" className={buttonClassName({ variant: 'primary', size: 'md' })}>
                {t('course.card.browse_all', '浏览全部课程')}
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.slice(0, 6).map((course) => (
                <Link
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="group block bg-[#F5F4F0] border border-[#171717] hover:bg-[#EEEDE9] transition overflow-hidden"
                >
                  <div
                    className={`aspect-video ${getCourseCoverBg(course.tags)} relative flex items-end p-4 overflow-hidden`}
                  >
                    {/* P0-fix (2026-10-15): 渲染课程封面图,与 /courses 列表保持一致。
                        CSP img-src 已放行 picsum.photos + fastly.picsum.photos */}
                    {course.thumbnail && (
                      <img
                        src={course.thumbnail}
                        alt={`${course.title} 封面`}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {firstCourseTag(course.tags) && (
                      <span className="absolute top-3 left-3 z-[2] text-xs px-2 py-0.5 bg-white/90 font-medium text-[#171717]">
                        {firstCourseTag(course.tags)}
                      </span>
                    )}
                    <span className="absolute top-3 right-3 z-[2] text-xs px-2 py-0.5 bg-cert-500 text-white font-medium">
                      {course.level}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-lg text-[#171717] line-clamp-2">
                      {course.title}
                    </h3>
                    <p className="mt-2 text-sm text-[#666666] line-clamp-2">
                      {course.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-[#666666]">
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5" />
                          {course.instructor}
                        </span>
                        <span>·</span>
                        <span className="font-mono flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {course.duration}
                        </span>
                      </div>
                      {course.reviewCount > 0 ? (
                        <div className="flex items-center gap-1 text-warning-500" title={`${course.reviewCount} 条评价`}>
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span className="font-mono">{course.rating.toFixed(1)}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-500">暂无评分</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      {course.costType === 'free' ? (
                        <span className="text-xs text-success-500 font-medium">免费</span>
                      ) : course.costType === 'charity' ? (
                        <span className="text-xs text-warning-500 font-medium">公益</span>
                      ) : (
                        <span className="text-sm font-mono font-medium text-[#171717]">
                          ¥ {Number(course.price).toFixed(0)}
                        </span>
                      )}
                      <span className="text-xs text-[#171717] underline underline-offset-2 font-medium inline-flex items-center gap-1">
                        立即试看 <ArrowUpRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// =============================================================
// 5 段:学位路径
// =============================================================
function DegreesSection() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['home', 'degrees'],
    queryFn: async () => {
      const { data: d } = await api.get<Degree[]>('/api/v1/degrees');
      return d;
    },
    retry: 1,
    staleTime: 60_000,
  });

  // CMS-driven copy
  const { t } = useI18n();
  const { data: homePages } = usePageSettings('home', ['degrees_subhead']);

  const degrees = data ?? [];

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 md:mb-10 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#171717]">
              {t('section.degrees.title', '学位路径')}
            </h2>
            <p className="mt-2 text-[#666666] text-sm md:text-base">
              {pickPage(homePages, 'degrees_subhead', 'zh-CN', t('section.degrees.sub', '不是又一张证书,是可被验证的能力图谱'))}
            </p>
          </div>
          <Link
            to="/degrees"
            className="text-sm text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white font-medium hidden sm:inline-flex items-center gap-1"
          >
            浏览全部 <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} padding="lg">
                <Skeleton variant="rectangle" className="w-12 h-12" />
                <div className="mt-4 space-y-2">
                  <Skeleton variant="text" />
                  <Skeleton variant="text" count={2} />
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <QueryErrorState error={error} onRetry={() => void refetch()} />
        ) : degrees.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="w-6 h-6" />}
            title={t('degree.empty.title', '暂无学位')}
            description={t('degree.empty.desc', '学位路径正在准备中。')}
            action={
              <Link to="/degrees" className={buttonClassName({ variant: 'primary', size: 'md' })}>
                {t('degree.empty.cta', '了解学位')}
              </Link>
            }
          />
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {degrees.slice(0, 3).map((degree, i) => {
              return (
                <Link
                  key={degree.id}
                  to={`/degrees/${degree.id}`}
                  className="block border border-[#171717] p-6 transition hover:bg-[#EEEDE9]"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-12 h-12 flex items-center justify-center text-2xl font-bold font-mono ${
                        i === 2
                          ? 'bg-cert-100 text-cert-500'
                          : 'bg-[#EEEDE9] text-[#171717]'
                      }`}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </div>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-[#171717]">
                    {degree.title}
                  </h3>
                  <p className="mt-2 text-sm text-[#666666]">{degree.description}</p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {(degree.courses ?? []).slice(0, 4).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-[#171717]">
                        <span
                          className={`w-1.5 h-1.5 ${
                            i === 2 ? 'bg-cert-500' : 'bg-[#171717]'
                          }`}
                        />
                        {c.title}
                      </li>
                    ))}
                    {(degree.courses?.length ?? 0) > 4 && (
                      <li className="flex items-center gap-2 text-[#999999]">
                        <span className="w-1.5 h-1.5 bg-[#EEEDE9]" />...
                      </li>
                    )}
                  </ul>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-xs text-[#666666]">
                      {degree.stats?.courseCount ?? 0} 门课 · {degree.stats?.estimatedHours ?? 0} 小时
                    </span>
                    <span className="text-sm text-[#171717] underline underline-offset-2 font-medium inline-flex items-center gap-1">
                      了解 <ArrowUpRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// =============================================================
// 6 段:黑客松
// =============================================================
function useMyRegistration(hackathonId: string) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['hackathon-registration', hackathonId],
    queryFn: () => participantApi.getMyRegistration(hackathonId),
    enabled: !!user && !!hackathonId,
    staleTime: 60_000,
    retry: 0,
  });
}

function HackathonCard({ h }: { h: Hackathon }) {
  const countdown = useCountdown(h.startDate, h.endDate, h.registerDeadline);
  const { data: registration } = useMyRegistration(h.id);
  const registered = isActiveRegistration(registration);
  const startDate = new Date(h.startDate);
  const isActive = h.status === 'active';
  const dateLabel = startDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  return (
    <Link
      to={`/hackathons/${h.id}`}
      className="group block border border-[#171717] hover:bg-[#EEEDE9] transition overflow-hidden"
    >
      <div
        className={`relative flex flex-col justify-end p-5 md:p-6 text-white ${
          isActive ? 'bg-[#171717]' : 'bg-[#262626]'
        }`}
      >
        <span className="text-xs font-medium opacity-80">
          {isActive ? '🔴 LIVE' : '即将开始'} · {dateLabel}
        </span>
        <h3 className="mt-2 text-lg md:text-xl font-bold leading-tight line-clamp-2">
          {h.title}
        </h3>
        {countdown.phase !== 'ended' && (
          <p className="mt-1 text-xs font-mono opacity-90">
            {countdown.label} {countdown.days} 天 {countdown.hours} 小时
          </p>
        )}
        {countdown.phase === 'ended' && (
          <p className="mt-1 text-xs font-mono opacity-90">已结束</p>
        )}
      </div>
      <div className="p-4 bg-[#F5F4F0]">
        <p className="text-xs text-[#666666] line-clamp-2 mb-2">{h.description}</p>
        <div className="flex items-center justify-between text-[10px] text-[#666666]">
          <span className="flex items-center gap-1">
            <Trophy className="w-3 h-3" />
            {h._count?.registrations ?? 0} 人报名
          </span>
          <span className="text-[#171717] underline underline-offset-2 font-medium inline-flex items-center gap-1">
            {registered ? '我的参赛' : countdown.phase === 'ended' ? '查看详情' : '前往报名'} <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function HackathonsSection() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['home', 'hackathons'],
    queryFn: async () => {
      const now = Date.now();
      const upcoming = await hackathonsApi.getAll({ status: 'upcoming' });
      // 服务端 filtering 以 status=active 为准,可能漏掉数据里标 active 但已过期的场; 这里统一按结束时间再滤一次
      const active = (await hackathonsApi.getAll({ status: 'active' }))
        .filter((h) => now <= new Date(h.endDate).getTime())
        .sort((a, b) => new Date(a.registerDeadline ?? a.startDate).getTime() - new Date(b.registerDeadline ?? b.startDate).getTime());
      return [...active, ...upcoming].slice(0, 3) as Hackathon[];
    },
    retry: 1,
    staleTime: 60_000,
  });

  // CMS-driven copy
  const { t } = useI18n();
  const { data: homePages } = usePageSettings('home', ['hackathons_subhead']);

  const hackathons = data ?? [];

  const main = hackathons[0];
  const small = hackathons.slice(1, 3);
  const mainCountdown = useCountdown(
    main?.startDate ?? new Date(),
    main?.endDate,
    main?.registerDeadline,
  );
  const { data: mainRegistration } = useMyRegistration(main?.id ?? '');
  const mainRegistered = isActiveRegistration(mainRegistration);

  return (
    <section className="py-16 md:py-24 bg-[#F5F4F0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#171717]">
              {t('section.hackathons.title', '黑客松进行中')}
            </h2>
            <p className="mt-2 text-[#666666] text-sm md:text-base">
              {pickPage(homePages, 'hackathons_subhead', 'zh-CN', t('section.hackathons.sub', '社区、竞赛、激励 —— 让你的能力被看见'))}
            </p>
          </div>
          <Link
            to="/hackathons"
            className="text-sm text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white font-medium hidden sm:inline-flex items-center gap-1"
          >
            全部赛事 <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2" padding="none">
              <Skeleton variant="rectangle" className="aspect-[2/1] w-full rounded-t-xl" />
              <div className="p-5">
                <Skeleton variant="text" count={2} />
              </div>
            </Card>
            <div className="space-y-4">
              <Skeleton variant="rectangle" className="h-32 w-full" />
              <Skeleton variant="rectangle" className="h-32 w-full" />
            </div>
          </div>
        ) : isError ? (
          <QueryErrorState error={error} onRetry={() => void refetch()} />
        ) : hackathons.length === 0 ? (
          <EmptyState
            icon={<Trophy className="w-6 h-6" />}
            title={t('hackathon.empty.title', '暂无黑客松')}
            description={t('hackathon.empty.desc', '下一场黑客松正在筹备中,敬请期待。')}
          />
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* 主卡 */}
            <Link
              to={`/hackathons/${main.id}`}
              className="lg:col-span-2 block border border-[#171717] overflow-hidden group hover:bg-[#EEEDE9] transition"
            >
              <div className="aspect-[2/1] bg-[#171717] p-6 md:p-8 flex flex-col justify-end text-white">
                <span className="text-xs font-medium opacity-80">
                  {mainCountdown.phase === 'upcoming' && '⏰ '}
                  {mainCountdown.phase === 'active' && '🔴 LIVE · '}
                  {mainCountdown.phase === 'ended' && '已结束'}
                  {mainCountdown.phase !== 'ended' &&
                    `${mainCountdown.label} ${mainCountdown.days} 天 ${mainCountdown.hours} 小时 ${mainCountdown.minutes} 分`}
                </span>
                <h3 className="mt-2 text-2xl md:text-3xl font-bold leading-tight">
                  {main.title}
                </h3>
                <p className="mt-2 opacity-90 text-sm md:text-base line-clamp-2">
                  {main.description}
                </p>
              </div>
              <div className="p-5 flex items-center justify-between bg-[#F5F4F0]">
                <div className="flex items-center gap-3 text-xs text-[#666666]">
                  <span className="flex items-center gap-1">
                    <UsersMini /> {main._count?.registrations ?? 0} 人已报名
                  </span>
                  {main.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {main.location}
                    </span>
                  )}
                </div>
                <span className="text-sm px-4 py-2 bg-[#171717] text-white font-medium group-hover:bg-[#262626] transition">
                  {mainRegistered ? '我的参赛' : mainCountdown.phase === 'ended' ? '查看详情' : '前往报名'}
                </span>
              </div>
            </Link>
            {/* 小卡 */}
            <div className="space-y-4">
              {small.length > 0 ? (
                small.map((h) => <HackathonCard key={h.id} h={h} />)
              ) : (
                <Card padding="lg">
                  <p className="text-sm text-[#666666] text-center">暂无其他赛事</p>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// 临时小图标 - 用 Users 替代但宽度更窄
function UsersMini() {
  return <UserIcon className="w-3 h-3" />;
}

// =============================================================
// 7 段:AI 助教 CTA
// =============================================================
function AiTutorSection() {
  // CMS-driven copy
  const { t } = useI18n();
  const { data: homePages } = usePageSettings('home', ['aitutor_subhead', 'aitutor_chip']);
  return (
    <section className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#171717] p-8 md:p-16 text-white relative overflow-hidden">
          {/* 装饰圆 */}
          <div
            className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-[#A3A3A3]/20 blur-3xl pointer-events-none"
            aria-hidden="true"
          />
          <div className="relative grid md:grid-cols-2 gap-8 items-center">
            <div>
              <span className="text-xs px-2 py-0.5 bg-white/20 text-white font-medium">
                {pickPage(homePages, 'aitutor_chip', 'zh-CN', t('section.ai.chip', '贯穿全程'))}
              </span>
              <h2 className="mt-4 text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                {t('section.ai.title', 'AI 助手，不在抽屉里')}
              </h2>
              <p className="mt-4 opacity-90 leading-relaxed">
                {pickPage(homePages, 'aitutor_subhead', 'zh-CN', t('section.ai.sub', '每节课、每个项目、每个问题旁边都有它 —— 知道你在学什么,能引用你学过的内容,会用苏格拉底式反问而不只是给答案。'))}
              </p>
              <Link to="/dashboard/learning" className="inline-block mt-6">
                <span className="px-6 py-3 bg-white text-[#171717] font-medium hover:bg-neutral-100 transition inline-flex items-center gap-2">
                  体验 AI 助手 <ArrowUpRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
            {/* 聊天气泡 — 明确标注"产品示例"避免误导 */}
            <div className="bg-white p-5 border border-[#171717]">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs opacity-70 font-mono text-[#666666]">
                  LESSON · Agent 基础
                </div>
                <span className="text-[10px] font-mono text-[#999999] uppercase tracking-widest">
                  产品示例
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full bg-[#171717] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    我
                  </div>
                  <div className="text-sm bg-[#EEEDE9] p-3 text-[#171717]">
                    这节课的 ReAct 循环,哪一步最容易出 bug?
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full bg-cert-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    AI
                  </div>
                  <div className="text-sm bg-[#EEEDE9] p-3 text-[#171717]">
                    <p>通常是"观察"那一步:Agent 拿到工具结果后,容易直接答而不是先判断要不要再调一次工具。</p>
                    <p className="mt-2 text-[#666666] text-xs">📎 引用:这节课 Lesson 2 · ReAct 循环</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-[#999999] text-center">
                — 示例对话,真实聊天登录后即可使用 —
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// 8 段:讲师墙 (2026-08-04 升级: 改用真 /api/v1/instructors 数据)
// =============================================================
function InstructorsSection() {
  // 直接拉讲师列表 (新数据源, 替换老 string 聚合)
  const { data: instructorData, isLoading } = useQuery({
    queryKey: ['home', 'instructors'],
    queryFn: () => instructorsApi.list({ limit: 4, sort: 'orderIndex' }),
    retry: 1,
    staleTime: 60_000,
  });

  // CMS-driven copy
  const { t } = useI18n();
  const { data: homePages } = usePageSettings('home', ['instructors_subhead']);

  // 取前 4 个, 4 宫格 cover 走 brand token (跟老版视觉一致, 不通过 CMS 配)
  const palette = [
    { cover: 'bg-[#171717]' },
    { cover: 'bg-[#262626]' },
    { cover: 'bg-[#171717]' },
    { cover: 'bg-[#262626]' },
  ];
  const instructors = useMemo(() => {
    const items = instructorData?.items ?? [];
    return items.slice(0, 4).map((inst, i) => ({
      id: inst.id,
      slug: inst.slug,
      name: inst.name,
      title: inst.title ?? t('home.instructor.title_fallback', '课程讲师'),
      avatarUrl: inst.avatarUrl,
      initials: inst.name.charAt(0),
      cover: palette[i]?.cover ?? palette[0].cover,
    }));
  }, [instructorData, t]);

  if (isLoading) {
    // 加载状态: 显示 4 个灰圈占位
    return (
      <section className="py-16 md:py-24 bg-[#F5F4F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#171717]">
            {t('section.instructors.title', '来自一线的讲师')}
          </h2>
          <p className="mt-2 text-[#666666] text-sm md:text-base">{t('section.instructors.loading', '讲师加载中…')}</p>
        </div>
      </section>
    );
  }

  if (instructors.length === 0) {
    return null;
  }

  return (
    <section className="py-16 md:py-24 bg-[#F5F4F0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 md:mb-10 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#171717]">
              {t('section.instructors.title', '来自一线的讲师')}
            </h2>
            <p className="mt-2 text-[#666666] text-sm md:text-base">
              {pickPage(homePages, 'instructors_subhead', 'zh-CN', t('section.instructors.sub', '不是 PPT 复读机,是正在写代码、正在做产品的人'))}
            </p>
          </div>
          <Link
            to="/instructors"
            className="hidden md:inline-flex items-center gap-2 text-sm font-semibold text-[#171717] hover:underline shrink-0"
          >
            查看全部 <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {instructors.map((inst) => (
            <Link
              key={inst.id}
              to={`/instructors/${inst.slug}`}
              className="text-center group block"
            >
              <div
                className={`w-20 h-20 md:w-24 md:h-24 mx-auto rounded-full ${inst.cover} flex items-center justify-center text-white text-2xl font-bold overflow-hidden`}
              >
                {inst.avatarUrl ? (
                  <img src={inst.avatarUrl} alt={`${inst.name} 头像`} className="h-full w-full object-cover" />
                ) : (
                  inst.initials
                )}
              </div>
              <h3 className="mt-3 font-semibold text-[#171717] group-hover:underline">
                {inst.name}
              </h3>
              <p className="text-xs text-[#666666] mt-1 line-clamp-2">{inst.title}</p>
            </Link>
          ))}
        </div>
        <div className="mt-8 md:hidden text-center">
          <Link to="/instructors" className="inline-flex items-center gap-2 text-sm font-semibold text-[#171717] hover:underline">
            查看全部讲师 <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// 9 段:Footer
// =============================================================
// =============================================================
// 注:SiteFooter 已提升到 main Layout (components/Layout.tsx),
//     所有页共享同一个 footer, 不再在 HomePage 单独渲染。
// =============================================================
// HERO 段: 站点统计 + 当前 term + 课程预览(分登录态)
// =============================================================
function useSiteStats() {
  return useQuery({
    queryKey: ['site', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<SiteStats>('/api/v1/site/stats');
      return data;
    },
    staleTime: 5 * 60_000, // 5 min — 站点统计不必每分钟拉
    retry: 1,
  });
}

function useMyEnrollment() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['home', 'my-enrollment', user?.id],
    queryFn: async () => {
      const { data } = await api.get<MyEnrollment[]>('/api/v1/enrollments/me');
      return data;
    },
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
  });
}

function HeroPreviewCard() {
  // 已登录: 显示用户真实学习进度(取最近一个 enrollment)
  const user = useAuthStore((s) => s.user);
  const { data: enrollments, isLoading: eLoading } = useMyEnrollment();
  const { data: stats } = useSiteStats();

  // 未登录: 显示 featured course + "产品示例"标注
  if (!user) {
    const c = stats?.featuredCourse;
    if (!c) {
      // skeleton 状态
      return (
        <Card variant="elevated" padding="md" className="relative">
          <Skeleton variant="text" className="w-32 h-3" />
          <div className="mt-4 space-y-3">
            <Skeleton variant="rectangle" className="h-16 w-full" />
            <Skeleton variant="rectangle" className="h-16 w-full" />
          </div>
        </Card>
      );
    }
    return (
      <Card variant="elevated" padding="md" className="relative">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-danger-500" />
          <div className="w-2 h-2 rounded-full bg-warning-500" />
          <div className="w-2 h-2 rounded-full bg-success-500" />
          <span className="ml-2 text-xs text-[#666666] font-mono">
            localhost / learn
          </span>
        </div>
        <div className="text-[10px] font-mono text-[#666666] mb-2 uppercase tracking-widest">
          产品示例 · Featured course
        </div>
        <div className="space-y-3">
          <div className="p-3 bg-[#F5F4F0] border border-[#171717]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-[#666666] font-medium">
                  {c.level.toUpperCase()} · {c.duration}
                </div>
                <div className="mt-1 font-medium text-[#171717] truncate">
                  {c.title}
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 bg-[#171717] text-white whitespace-nowrap">
                {c.enrollmentCount} 人已报名
              </span>
            </div>
            <p className="mt-2 text-xs text-[#666666] line-clamp-2">{c.description}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Link
            to={`/courses/${c.id}`}
            className="text-sm text-[#171717] underline underline-offset-2 font-medium inline-flex items-center gap-1"
          >
            立即试看 <ArrowUpRight className="w-3 h-3" />
          </Link>
          <Link
            to="/login"
            className="text-xs text-[#666666] hover:text-[#171717]"
          >
            登录查看你的进度
          </Link>
        </div>
      </Card>
    );
  }

  // 已登录: 显示最近一个 enrollment 真实进度
  if (eLoading) {
    return (
      <Card variant="elevated" padding="md" className="relative">
        <Skeleton variant="text" className="w-32 h-3" />
        <div className="mt-4 space-y-3">
          <Skeleton variant="rectangle" className="h-16 w-full" />
          <Skeleton variant="rectangle" className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  const recent = enrollments?.[0];
  if (!recent || !recent.course) {
    return (
      <Card variant="elevated" padding="md" className="relative">
        <div className="text-center py-6">
          <div className="text-sm text-[#666666] mb-3">还没有选课,先去逛逛吧</div>
          <Link to="/courses" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
            浏览课程
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="elevated" padding="md" className="relative">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-success-500" />
        <span className="ml-2 text-xs text-[#666666] font-mono">
          localhost / my-learning
        </span>
      </div>
      <div className="text-[10px] font-mono text-[#666666] mb-2 uppercase tracking-widest">
        继续上次 · {recent.course.level}
      </div>
      <Link
        to={`/courses/${recent.course.id}`}
        className="block p-3 bg-[#F5F4F0] border border-[#171717] hover:bg-[#EEEDE9] transition"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-[#666666] font-medium">
              {recent.course.instructor} · {recent.course.duration}
            </div>
            <div className="mt-1 font-medium text-[#171717] truncate">
              {recent.course.title}
            </div>
          </div>
          <PlayCircle className="w-5 h-5 text-[#171717] flex-shrink-0" />
        </div>
      </Link>
      <div className="mt-3 p-3 bg-[#EEEDE9] border border-[#171717]">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-[#171717] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            AI
          </div>
          <div className="text-sm text-[#171717]">
            <div className="text-xs text-[#666666] mb-1">AI 助手 · 准备就绪</div>
            想从上次的位置继续? 或者直接提问。
          </div>
        </div>
      </div>
    </Card>
  );
}

// 主页面
// =============================================================
export function HomePage() {
  // 站点统计: 用于 hero KPI + term label
  const { data: stats } = useSiteStats();
  const heroStats = useMemo(
    () => [
      { num: formatStatNumber(stats?.activeLearners ?? 0), label: '在读学员' },
      { num: formatStatNumber(stats?.totalCourses ?? 0), label: '系统化课程' },
      { num: formatStatNumber(stats?.totalProjects ?? 0), label: '已完成项目' },
      { num: formatStatNumber(stats?.totalDegrees ?? 0), label: '学位' },
    ],
    [stats],
  );
  const termLabel = stats?.currentTermLabel ?? '';
  const hackathonCount = stats?.activeHackathonCount ?? 0;

  // CMS-driven copy (site_settings.brand.hero.* + page_settings.home.*)
  // 全部文案 hook 以 CMS API / 数据库为权威来源。
  const { data: heroSite } = useSiteSettings([
    'brand.hero.headline',
    'brand.hero.subheadline',
    'brand.hero.term_default',
    'brand.hero.cta_primary',
    'brand.hero.cta_secondary',
    'brand.hero.badge_template',
  ]);
  const headline = pickSite(heroSite, 'brand.hero.headline', 'zh-CN', '学完仍然不会做?\n让 AI 时代的能力\n可被看见。');
  const subheadline = pickSite(heroSite, 'brand.hero.subheadline', 'zh-CN', '课程 + 学位 + 实践项目 + 黑客松 + AI 助手 —— 一条连续的学习回路,不是又一个视频站。');
  const termDefault = pickSite(heroSite, 'brand.hero.term_default', 'zh-CN', '2026 夏季 · 开放报名');
  const ctaPrimary = pickSite(heroSite, 'brand.hero.cta_primary', 'zh-CN', '免费开始');
  const ctaSecondary = pickSite(heroSite, 'brand.hero.cta_secondary', 'zh-CN', '了解学位路径');
  // 把 headline 切成 3 行(line1 / line2 / line3),line2 加下划线
  const headlineLines = headline.split('\n');
  // 构造 badge 字符串
  const badgeLive = pickSite(heroSite, 'brand.hero.badge_template', 'zh-CN', '{count} 场黑客松进行中')
    .replace('{count}', String(hackathonCount));
  const badgeText = termLabel
    ? `${termLabel} · ${hackathonCount > 0 ? badgeLive : '开放报名'}`
    : termDefault;

  // 向下滚 → 收起顶部 hero, 向上滚 → 展开 (iOS Safari / Twitter 风格)
  const { ref: heroRef, isCollapsed } = useCollapsibleHero<HTMLElement>({ threshold: 120 });

  return (
    <div className="min-h-screen bg-[#F5F4F0] text-[#171717] transition-colors">
      <Seo
        title={pickSite(heroSite, 'brand.hero.headline', 'zh-CN', 'SecondPlanet — AI 时代的能力可被看见').replace(/\n/g, ' ')}
        description={subheadline.replace(/\n/g, ' ')}
        path="/"
      />
      {/* 1 段:HERO (collapsible on scroll) */}
      <section
        ref={heroRef}
        className={cn(
          'relative transition-all duration-300 ease-out',
          isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[1600px] opacity-100',
        )}
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(23,23,23,0.06), transparent 60%), radial-gradient(ellipse at bottom right, rgba(163,163,163,0.08), transparent 50%)',
        }}
        aria-hidden={isCollapsed}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* 左侧文字 */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#EEEDE9] text-[#171717] text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-[#171717]" />
                {badgeText}
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-[#171717]">
                {headlineLines[0] ?? headline}
                <br />
                <span className="underline underline-offset-4 decoration-4">{headlineLines[1] ?? ''}</span>
                <br />
                {headlineLines[2] ?? ''}
              </h1>
              <p className="mt-6 text-lg text-[#666666] max-w-xl">
                {subheadline}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/courses" className={buttonClassName({ variant: 'primary', size: 'lg' })}>
                  <Sparkles className="w-5 h-5" aria-hidden="true" />
                  <span>{ctaPrimary}</span>
                </Link>
                <Link to="/degrees" className={buttonClassName({ variant: 'secondary', size: 'lg' })}>
                  <span>{ctaSecondary}</span>
                  <ArrowUpRight className="w-5 h-5" aria-hidden="true" />
                </Link>
                <a
                  href={OPEN_SOURCE_REPOSITORY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClassName({ variant: 'secondary', size: 'lg' })}
                  aria-label="在 GitHub 查看 SecondPlanet 开源仓库（新窗口打开）"
                >
                  <Github className="h-5 w-5" aria-hidden="true" />
                  <span>GitHub 开源仓库</span>
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <div className="mt-10 md:mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6 max-w-xl">
                {heroStats.map((s) => (
                  <div key={s.label}>
                    <div className="text-2xl md:text-3xl font-bold font-mono text-[#171717]">
                      {s.num}
                    </div>
                    <div className="text-xs text-[#666666] mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* 右侧:登录态分支 — 未登录看 featured course, 登录后看真实学习进度 */}
            <div className="relative">
              <div
                className="absolute inset-0 blur-2xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(23,23,23,0.06), rgba(163,163,163,0.08))',
                }}
                aria-hidden="true"
              />
              <HeroPreviewCard />
            </div>
          </div>
        </div>
      </section>

      <CoursesSection />
      <DegreesSection />
      <HackathonsSection />
      <AiTutorSection />
      <InstructorsSection />
      {/* footer 提升到 main Layout, 见 components/Layout.tsx */}
    </div>
  );
}

// 显式避免未使用的引用警告(在某些 strict 模式下)
// (none — all imports used)
