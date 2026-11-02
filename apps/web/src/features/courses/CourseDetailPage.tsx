import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import {
  User as UserIcon,
  BookOpen,
  PlayCircle,
  FileText,
  Code,
  Link as LinkIcon,
  Video,
  Music,
  Lock,
  CheckCircle2,
  Circle,
  ArrowLeft,
  ArrowUpRight,
  Award,
  Star,
  CheckCircle2 as CheckIcon,
  Clock3,
  MessageSquare,
} from 'lucide-react';
import api from '../../lib/api';
import { progressApi } from '../../lib/progressApi';
import { practicesApi } from '../../lib/practicesApi';
import { reviewsApi, type Review } from '../../lib/reviewsApi';
import { useAuthStore } from '../../stores/authStore';
import { ProgressRing } from '../../components/ProgressRing';
import { QueryErrorState } from '../../components/QueryErrorState';
import { PurchaseModal } from '../degrees/PurchaseModal';
import { Seo } from '../../components/Seo';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { LazyImage } from '../../components/ui/LazyImage';
import { parseCourseTags, parseStringList } from '../../lib/courseTags';
import { isDirectVideoUrl, normalizeEmbeddedVideoUrl } from '../../lib/videoUrl';
import type { PracticeCompletion, PracticeProject } from '@secondplanet/shared-types';

interface CourseInstructorLink {
  id: string;
  role: 'instructor' | 'mentor';
  isPrimary: boolean;
  instructor: {
    id: string;
    slug: string;
    name: string;
    nameEn?: string | null;
    title?: string | null;
    headline?: string | null;
    avatarUrl?: string | null;
    company?: string | null;
    publishedAt?: string | null;
    expertiseLinks: Array<{ expertise: { id: string; key: string; label: string } }>;
  };
}

interface Course {
  id: string;
  title: string;
  description: string;
  learningPoints: string;
  instructor: string;
  level: string;
  duration: string;
  thumbnail: string;
  tags: string;
  costType: 'free' | 'paid' | 'charity';
  courseType: 'own' | 'partner' | 'public' | 'third_party';
  externalUrl?: string;
  price: number;
  chapters: Chapter[];
  // 2026-08-04: 多讲师/导师挂载 (新表, course.instructor 字符串作为 fallback)
  courseLinks?: CourseInstructorLink[];
}

interface Chapter {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  lessons: Lesson[];
}

interface Lesson {
  id: string;
  title: string;
  description?: string;
  videoUrl?: string;
  isPreview: boolean;
  orderIndex: number;
  resources: Resource[];
}

interface Resource {
  id: string;
  title: string;
  url: string;
  type: 'pdf' | 'code' | 'link' | 'video' | 'audio';
  isLocked: boolean;
}

interface Toast {
  id: number;
  type: 'points' | 'badge';
  message: string;
}

function resourceIcon(type: Resource['type']) {
  switch (type) {
    case 'pdf':
      return <FileText className="w-4 h-4" />;
    case 'code':
      return <Code className="w-4 h-4" />;
    case 'link':
      return <LinkIcon className="w-4 h-4" />;
    case 'video':
      return <Video className="w-4 h-4" />;
    case 'audio':
      return <Music className="w-4 h-4" />;
  }
}

function resourceLabel(type: Resource['type']) {
  return { pdf: 'PDF', code: '代码', link: '链接', video: '视频', audio: '音频' }[type];
}

const courseTypeLabel = (t: Course['courseType']) => {
  switch (t) {
    case 'own': return '自有课程';
    case 'partner': return '合作课程';
    case 'public': return '公开课程';
    case 'third_party': return '第三方课程';
  }
};

const courseTypeBadgeClass = (t: Course['courseType']) => {
  switch (t) {
    case 'own': return 'bg-[#171717] text-white';
    case 'partner': return 'bg-[#4B5563] text-white';
    case 'public': return 'border border-[#171717] text-[#171717]';
    case 'third_party': return 'bg-[#EEEDE9] text-[#171717] border border-[#171717]';
  }
};

export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'video' | 'resources' | 'practices' | 'reviews'>('overview');
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const { data: course, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['course', id],
    queryFn: async () => {
      const { data } = await api.get<Course>(`/api/v1/courses/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const { data: courseProgress } = useQuery({
    queryKey: ['course-progress', id],
    queryFn: () => progressApi.getCourseProgress(id!),
    enabled: !!id && !!user,
  });

  const { data: myProgress } = useQuery({
    queryKey: ['my-progress'],
    queryFn: () => progressApi.getMyProgress(),
    enabled: !!user,
  });

  const { data: myEnrollments } = useQuery({
    queryKey: ['enrollments', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/enrollments/me');
      return data as Array<{ id: string; courseId?: string | null; degreeId?: string | null }>;
    },
    enabled: !!user,
  });

  const enrolled = !!myEnrollments?.some((e) => e.courseId === id);
  const isUnlocked = course?.costType === 'free' || course?.costType === 'charity' || enrolled;

  const { data: publicPracticeProjects = [] } = useQuery<PracticeProject[]>({
    queryKey: ['practices', 'course', id],
    queryFn: () => practicesApi.getProjectsByCourse(id!),
    enabled: !!id,
  });

  const { data: accessiblePracticeProjects } = useQuery<PracticeProject[]>({
    queryKey: ['practices', 'course', id, 'accessible'],
    queryFn: () => practicesApi.getAccessibleProjectsByCourse(id!),
    enabled: !!id && !!user && !!isUnlocked,
  });

  const practiceProjects = accessiblePracticeProjects ?? publicPracticeProjects;

  const { data: practiceProgress = [] } = useQuery<PracticeCompletion[]>({
    queryKey: ['practices', 'progress', id],
    queryFn: () => practicesApi.getUserProgress(id),
    enabled: !!id && !!user && !!isUnlocked,
  });

  const startPracticeMutation = useMutation({
    mutationFn: (projectId: string) => practicesApi.startProject(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['practices', 'progress', id] }),
  });

  const completePracticeMutation = useMutation({
    mutationFn: (projectId: string) => practicesApi.completeProject(projectId, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practices', 'progress', id] });
      queryClient.invalidateQueries({ queryKey: ['my-badges'] });
    },
  });

  const completedLessonIds = new Set(
    (myProgress as any[])
      ?.filter((p) => p.status === 'completed')
      .map((p) => p.lessonId) ?? [],
  );

  const completeLessonMutation = useMutation({
    mutationFn: (lessonId: string) => progressApi.completeLesson(lessonId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-progress'] });
      queryClient.invalidateQueries({ queryKey: ['course-progress', id] });
      queryClient.invalidateQueries({ queryKey: ['my-points'] });
      queryClient.invalidateQueries({ queryKey: ['my-badges'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });

      const newToasts: Toast[] = [];
      if (data.pointsAwarded > 0) {
        newToasts.push({ id: Date.now(), type: 'points', message: `+${data.pointsAwarded} 积分` });
      }
      data.newlyUnlockedBadges.forEach((badge, idx) => {
        newToasts.push({
          id: Date.now() + idx + 1,
          type: 'badge',
          message: `解锁徽章「${badge.name}」`,
        });
      });
      if (newToasts.length > 0) {
        setToasts((prev) => [...prev, ...newToasts]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => !newToasts.find((nt) => nt.id === t.id)));
        }, 3000);
      }
    },
  });

  // v1.9-alpha.2 (batch-7 A-05 续): Reviews 列表 (新 tab)
  // 公开接口, 登录用户可在 tab 内部提交新评价。
  const reviewsQuery = useQuery({
    queryKey: ['course-reviews', id],
    queryFn: () => reviewsApi.listByCourse(id!, 1, 20),
    enabled: !!id,
    staleTime: 30_000,
  });

  // v1.9-alpha.2 (batch-7 A-05): 相似课程 (public 接口, 也用于未登录访客)
  const similarQuery = useQuery({
    queryKey: ['course-similar', id],
    queryFn: async () => {
      const { data } = await api.get<
        Array<{
          id: string;
          title: string;
          thumbnail: string;
          level: string;
          tags: string;
          category: { id: string; key: string; label: string } | null;
          ratingAvg: number;
          ratingCount: number;
          score: number;
        }>
      >(`/api/v1/courses/${id}/similar?limit=4`);
      return data;
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

  const createReview = useMutation({
    mutationFn: (input: { rating: number; content: string }) => reviewsApi.create(id!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-reviews', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-progress'] });
    },
  });

  const helpfulReview = useMutation({
    mutationFn: (reviewId: string) => reviewsApi.markHelpful(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-reviews', id] });
    },
  });

  if (isLoading) return <div className="text-center py-32 text-[#666666]">加载中...</div>;
  if (isError) {
    // 404 时给"课程不存在"友好提示,其他错误给重试
    const status = (error as any)?.response?.status;
    if (status === 404) {
      return <div className="text-center py-32 text-[#666666]">课程不存在或已下架</div>;
    }
    return (
      <div className="max-w-2xl mx-auto py-16">
        <QueryErrorState error={error} onRetry={refetch} />
      </div>
    );
  }
  if (!course) return <div className="text-center py-32">课程不存在</div>;

  const learningPoints = parseStringList(course.learningPoints);
  const tags = parseCourseTags(course.tags);
  const isFree = course.costType === 'free' || course.costType === 'charity';

  const resourcesByChapter = course.chapters
    .map((chapter) => ({
      chapter,
      lessons: chapter.lessons.filter((l) => l.resources.length > 0),
    }))
    .filter((x) => x.lessons.length > 0);

  const totalResources = course.chapters
    .flatMap((c) => c.lessons)
    .reduce((sum, l) => sum + l.resources.length, 0);

  const totalLessons = course.chapters.reduce((s, c) => s + c.lessons.length, 0);

  return (
    <div className="bg-[#F5F4F0] text-[#171717] animate-in fade-in duration-500">
      <Seo
        title={course.title}
        description={course.description?.slice(0, 200) ?? ''}
        path={`/courses/${course.id}`}
        image={course.thumbnail}
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: course.title,
          description: course.description ?? '',
          provider: {
            '@type': 'Organization',
            name: 'SecondPlanet',
            sameAs: window.location.origin,
          },
          educationalLevel: course.level,
          timeRequired: course.duration,
          inLanguage: 'zh-CN',
          offers: {
            '@type': 'Offer',
            category: course.costType === 'free' ? 'Free' : 'Paid',
            price: course.costType === 'free' ? 0 : Number(course.price),
            priceCurrency: 'CNY',
            availability: 'https://schema.org/InStock',
          },
          hasCourseInstance: {
            '@type': 'CourseInstance',
            courseMode: 'online',
            instructor: { '@type': 'Person', name: course.instructor },
          },
        }}
      />
      {/* Hero — split white + black */}
      <section className="border-b border-[#171717] px-0 lg:px-6">
        <div className="mx-auto grid max-w-7xl grid-cols-1 border-x-0 border-[#171717] lg:grid-cols-2 lg:border-x">
          <div className="flex flex-col justify-center border-b border-[#171717] bg-white p-7 sm:p-10 lg:border-b-0 lg:border-r lg:p-12 xl:p-14">
            <Link
              to="/courses"
              className="mb-7 inline-flex w-fit items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#666666] transition-colors hover:text-[#171717]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> 返回全部课程
            </Link>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest">
                {course.level}
              </span>
              {isFree ? (
                <span className="inline-flex items-center px-2 py-0.5 border border-[#171717] text-[#171717] text-[10px] font-black uppercase tracking-widest">
                  Free
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 border border-[#171717] text-[#171717] text-[10px] font-black uppercase tracking-widest">
                  ¥{course.price}
                </span>
              )}
              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${courseTypeBadgeClass(course.courseType)}`}>
                {courseTypeLabel(course.courseType)}
              </span>
            </div>
            <h1 className="mb-5 break-words text-4xl font-black leading-[0.96] tracking-tighter sm:text-5xl">
              {course.title}
            </h1>
            <p className="mb-8 max-w-2xl text-base leading-7 text-[#666666] sm:text-lg">
              {course.description}
            </p>

            <div className="grid grid-cols-3 border-t border-[#171717]">
              <div className="border-r border-[#171717] py-4 sm:py-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">Duration</div>
                <div className="text-2xl font-black tracking-tighter">{course.duration}</div>
              </div>
              <div className="border-r border-[#171717] py-4 pl-4 sm:py-5 sm:pl-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">Lessons</div>
                <div className="text-2xl font-black tracking-tighter">{totalLessons}</div>
              </div>
              <div className="py-4 pl-4 sm:py-5 sm:pl-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">Resources</div>
                <div className="text-2xl font-black tracking-tighter">{totalResources}</div>
              </div>
            </div>
          </div>

          {/* Right: thumbnail + CTA */}
          <div className="flex min-h-0 flex-col bg-[#171717] text-white">
            <div className="relative h-64 shrink-0 overflow-hidden border-b border-white/20 bg-[#262626] sm:h-80 lg:h-[340px]">
              <LazyImage
                src={course.thumbnail}
                alt={course.title}
                fill
                eager
                className="object-cover"
                fallback={
                  <div className="flex h-full w-full flex-col items-center justify-center bg-[#262626] px-8 text-center">
                    <BookOpen className="h-12 w-12 text-white/25" />
                    <p className="mt-4 max-w-sm text-sm font-semibold text-white/50">{course.title}</p>
                  </div>
                }
              />
            </div>
            <div className="flex flex-1 flex-col gap-4 p-7 sm:p-8 lg:p-9">
              {user && courseProgress ? (
                <div className="flex items-center gap-4 border border-white/20 p-4">
                  <ProgressRing percent={courseProgress.percent} size={64} strokeWidth={6} />
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/50">Progress</div>
                    <div className="text-lg font-black tracking-tight">
                      {courseProgress.completedLessons}/{courseProgress.totalLessons} Lessons
                    </div>
                  </div>
                </div>
              ) : null}

              {enrolled ? (
                <Link
                  to={`/learning/${id}`}
                  className="inline-flex items-center justify-between gap-3 border border-white px-6 py-4 font-black uppercase tracking-widest text-sm hover:bg-white/10 transition-colors"
                >
                  <CheckIcon className="w-4 h-4" /> 已报名，立即学习
                </Link>
              ) : course.courseType === 'third_party' && course.externalUrl ? (
                <a
                  href={course.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-between gap-3 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-widest text-sm hover:bg-[#EEEDE9] transition-colors"
                >
                  <span>前往学习 →</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              ) : user ? (
                <button
                  onClick={() => setPurchaseOpen(true)}
                  className="inline-flex items-center justify-between gap-3 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-widest text-sm hover:bg-[#EEEDE9] transition-colors"
                >
                  <span>{isFree ? 'Free Enroll' : `Buy ¥${course.price}`}</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-between gap-3 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-widest text-sm hover:bg-[#EEEDE9] transition-colors"
                >
                  <span>Login to Enroll</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              )}

              <div className="text-[10px] font-black uppercase tracking-widest text-white/40 pt-2 flex items-center gap-2 flex-wrap">
                <UserIcon className="w-3.5 h-3.5" />
                {/* 2026-08-04: 多讲师/导师挂载 (新表) — course.instructor 字符串作为 fallback */}
                {course.courseLinks && course.courseLinks.length > 0 ? (
                  course.courseLinks.map((link) => (
                    <Link
                      key={link.id}
                      to={`/instructors/${link.instructor.slug}`}
                      className="text-white/60 hover:text-white underline-offset-4 hover:underline"
                    >
                      {link.instructor.name}
                      {link.role === 'mentor' && <span className="ml-1 text-white/40">(导师)</span>}
                    </Link>
                  ))
                ) : (
                  <span>{course.instructor}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs bar — P1-3 用公共 Tabs,加 role/aria-selected */}
      <section className="border-b border-[#171717] bg-white sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-6 flex overflow-x-auto scrollbar-hide">
          <Tabs<'overview' | 'video' | 'resources' | 'practices' | 'reviews'>
            value={activeTab}
            onChange={(k) => setActiveTab(k)}
            ariaLabel="课程详情"
            items={[
              { key: 'overview', label: '课程概览', icon: BookOpen },
              { key: 'video', label: '视频课程', icon: PlayCircle },
              { key: 'resources', label: `学习资源 (${totalResources})`, icon: FileText },
              { key: 'practices', label: `实践项目 (${practiceProjects.length})`, icon: Code },
              // v1.9-alpha.2 (batch-7 A-05 续): reviews tab, 计数来自 reviewsQuery.total
              {
                key: 'reviews',
                label: `学员评价 (${reviewsQuery.data?.total ?? 0})`,
                icon: MessageSquare,
              },
            ]}
            idPrefix="course-detail"
            className="flex divide-x divide-[#EEEDE9]"
            itemClassName={(_, active) =>
              `py-4 px-5 text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 shrink-0 focus:outline-none focus:ring-2 focus:ring-[#171717] ${
                active
                  ? 'text-[#171717] border-b-2 border-[#171717] -mb-px'
                  : 'text-[#666666] hover:text-[#171717]'
              }`
            }
          />
        </div>
      </section>

      {/* Tab content */}
      <section className="border-b border-[#171717]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <TabPanel value={activeTab} tabKey="overview" idPrefix="course-detail">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">
                    / 01 Overview
                  </div>
                  <p className="text-lg leading-relaxed">{course.description}</p>
                </div>

                {learningPoints.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">
                      / 02 What You Will Learn
                    </div>
                    <div className="grid sm:grid-cols-2 gap-0 border-t border-l border-[#171717]">
                      {learningPoints.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-4 border-b border-r border-[#171717] hover:bg-white transition-colors"
                        >
                          <div className="shrink-0 w-7 h-7 bg-[#171717] text-white text-[10px] font-black flex items-center justify-center">
                            {String(i + 1).padStart(2, '0')}
                          </div>
                          <span className="text-sm font-medium leading-relaxed pt-1">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2026-08-04: 讲师/导师介绍区块 — 来自 courseLinks 表 */}
                {course.courseLinks && course.courseLinks.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">
                      / 03 Instructors & Mentors
                    </div>
                    <div className="space-y-4">
                      {course.courseLinks.map((link) => (
                        <Link
                          key={link.id}
                          to={`/instructors/${link.instructor.slug}`}
                          className="group flex items-start gap-4 border border-[#171717] p-4 transition-colors hover:bg-white"
                        >
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#171717] text-xl font-black text-white">
                            {link.instructor.avatarUrl ? (
                              <img
                                src={link.instructor.avatarUrl}
                                alt={`${link.instructor.name} 头像`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              link.instructor.name.charAt(0)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold group-hover:underline">{link.instructor.name}</span>
                              <span className="rounded-sm bg-[#171717] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                                {link.role === 'mentor' ? '导师' : link.isPrimary ? '主讲' : '讲师'}
                              </span>
                            </div>
                            {link.instructor.title && (
                              <p className="mt-0.5 text-xs text-[#666666]">
                                {[link.instructor.title, link.instructor.company].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {link.instructor.headline && (
                              <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-700">
                                {link.instructor.headline}
                              </p>
                            )}
                            {link.instructor.expertiseLinks.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {link.instructor.expertiseLinks.slice(0, 3).map(({ expertise }) => (
                                  <span
                                    key={expertise.id}
                                    className="rounded-full bg-[#EEEDE9] px-2 py-0.5 text-[10px] font-semibold text-neutral-700"
                                  >
                                    {expertise.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-[#A3A3A3] group-hover:text-[#171717]" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar: chapters list */}
              <div>
                <div className="border border-[#171717] bg-white">
                  <div className="p-4 border-b border-[#171717]">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">课程模块</div>
                    <div className="text-lg font-black mt-1">{course.chapters.length} Modules</div>
                  </div>
                  <div>
                    {course.chapters.map((chapter, i) => (
                      <div
                        key={chapter.id}
                        className={`p-4 ${i < course.chapters.length - 1 ? 'border-b border-[#EEEDE9]' : ''} hover:bg-[#F5F4F0] transition-colors`}
                      >
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#A3A3A3] mb-1">
                          模块 {String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="text-sm font-black tracking-tight leading-snug">{chapter.title}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
                          {chapter.lessons.length} 课时
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value={activeTab} tabKey="video" idPrefix="course-detail">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                {activeLesson && !activeLesson.isPreview && !isUnlocked ? (
                  <div className="aspect-video bg-[#171717] flex items-center justify-center text-white">
                    <div className="text-center">
                      <Lock className="w-12 h-12 mx-auto mb-4" />
                      <h3 className="text-2xl font-black tracking-tighter uppercase mb-2">报名后解锁</h3>
                      <p className="text-sm text-white/50 mb-6">报名后立即获得完整学习权限</p>
                      {user ? (
                        <button
                          onClick={() => setPurchaseOpen(true)}
                          className="px-6 py-3 bg-white text-[#171717] font-black uppercase tracking-widest text-xs hover:bg-[#EEEDE9]"
                        >
                          {isFree ? 'Free Enroll' : `Buy ¥${course.price}`}
                        </button>
                      ) : (
                        <Link
                          to="/login"
                          className="px-6 py-3 bg-white text-[#171717] font-black uppercase tracking-widest text-xs hover:bg-[#EEEDE9]"
                        >
                          Login
                        </Link>
                      )}
                    </div>
                  </div>
                ) : activeLesson?.videoUrl ? (
                  <div className="aspect-video bg-[#171717] border border-[#171717] overflow-hidden relative">
                    {isDirectVideoUrl(activeLesson.videoUrl) ? (
                      <video src={activeLesson.videoUrl} title={activeLesson.title} className="w-full h-full" controls playsInline />
                    ) : (
                      <>
                        <iframe
                          src={normalizeEmbeddedVideoUrl(activeLesson.videoUrl)}
                          title={activeLesson.title}
                          className="w-full h-full"
                          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                        <a
                          href={activeLesson.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute top-3 right-3 z-10 bg-white text-[#171717] px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-[#171717]"
                        >
                          无法播放？新窗口打开 ↗
                        </a>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-white border border-[#171717] flex items-center justify-center text-[#666666]">
                    <div className="text-center">
                      <PlayCircle className="w-10 h-10 mx-auto mb-2 text-[#A3A3A3]" />
                      选择左侧课时开始观看
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-1">
                <div className="border border-[#171717] bg-white">
                  <div className="p-4 border-b border-[#171717]">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">课程模块 · 课时</div>
                  </div>
                  {course.chapters.map((chapter) => (
                    <div key={chapter.id} className="border-b border-[#EEEDE9] last:border-b-0">
                      <div className="px-4 py-3 bg-[#F5F4F0] text-[10px] font-black uppercase tracking-widest text-[#666666]">
                        {chapter.title}
                      </div>
                      {chapter.lessons.map((lesson) => {
                        const isCompleted = completedLessonIds.has(lesson.id);
                        const locked = !lesson.isPreview && !isUnlocked;
                        const active = activeLesson?.id === lesson.id;
                        return (
                          <div
                            key={lesson.id}
                            className={`flex items-center gap-2 px-3 py-2.5 border-t border-[#EEEDE9] ${
                              active ? 'bg-[#171717] text-white' : 'hover:bg-[#F5F4F0]'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setActiveLesson(lesson);
                                setActiveTab('video');
                              }}
                              disabled={locked}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left text-sm disabled:cursor-not-allowed"
                            >
                              {locked ? (
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                              ) : isCompleted ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span className="line-clamp-1 text-xs font-medium">{lesson.title}</span>
                            </button>
                            {user && !locked && (
                              <button
                                onClick={() => completeLessonMutation.mutate(lesson.id)}
                                disabled={isCompleted || completeLessonMutation.isPending}
                                className={`shrink-0 p-1 transition-colors ${
                                  isCompleted ? 'text-[#171717]' : 'text-[#999999] hover:text-[#171717]'
                                }`}
                                title={isCompleted ? '已完成' : '标记完成'}
                              >
                                {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value={activeTab} tabKey="resources" idPrefix="course-detail">
            <div>
              {resourcesByChapter.length === 0 ? (
                <div className="text-center py-24 text-[#666666]">暂无附加资源</div>
              ) : (
                <div className="border border-[#171717]">
                  {resourcesByChapter.map(({ chapter, lessons }, ci) => (
                    <div key={chapter.id} className={ci < resourcesByChapter.length - 1 ? 'border-b border-[#171717]' : ''}>
                      <div className="p-4 bg-[#171717] text-white">
                        <div className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">
                          模块 {String(ci + 1).padStart(2, '0')}
                        </div>
                        <div className="text-base font-black tracking-tight">{chapter.title}</div>
                      </div>
                      <div>
                        {lessons.flatMap((lesson) =>
                          lesson.resources.map((res) => {
                            const locked = res.isLocked && !isUnlocked;
                            const content = (
                              <>
                              <div className="shrink-0 w-9 h-9 bg-[#171717] text-white flex items-center justify-center">
                                {locked ? <Lock className="w-4 h-4" /> : resourceIcon(res.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-black tracking-tight truncate">{res.title}</div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">
                                  {lesson.title} · {resourceLabel(res.type)}
                                </div>
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-[#666666] group-hover:text-[#171717]">
                                {locked ? '报名后解锁' : 'Open →'}
                              </span>
                              </>
                            );
                            return locked ? (
                              <div key={res.id} className="flex items-center gap-4 px-4 py-3 border-t border-[#EEEDE9] bg-[#F5F4F0]">
                                {content}
                              </div>
                            ) : (
                              <a
                                key={res.id}
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-4 px-4 py-3 border-t border-[#EEEDE9] bg-white hover:bg-[#F5F4F0] transition-colors group"
                              >
                                {content}
                              </a>
                            );
                          }),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabPanel>

          <TabPanel value={activeTab} tabKey="practices" idPrefix="course-detail">
            {!isUnlocked ? (
              <div className="text-center py-24 bg-white border border-[#171717]">
                <Lock className="w-10 h-10 mx-auto mb-4 text-[#666666]" />
                <div className="text-lg font-black tracking-tighter mb-2">报名后解锁实践项目</div>
                <p className="text-sm text-[#666666] mb-6">完成真实项目，把课程知识变成可展示的成果。</p>
                {user ? (
                  <button
                    onClick={() => setPurchaseOpen(true)}
                    className="px-6 py-3 bg-[#171717] text-white font-black uppercase tracking-widest text-xs hover:bg-[#262626]"
                  >
                    {isFree ? 'Free Enroll' : `Buy ¥${course.price}`}
                  </button>
                ) : (
                  <Link
                    to="/auth/login"
                    className="inline-flex px-6 py-3 bg-[#171717] text-white font-black uppercase tracking-widest text-xs hover:bg-[#262626]"
                  >
                    Login
                  </Link>
                )}
              </div>
            ) : practiceProjects.length === 0 ? (
              <div className="text-center py-24 text-[#666666]">本课程暂未发布实践项目</div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {practiceProjects.map((project, index) => {
                  const completion = practiceProgress.find((item) => item.projectId === project.id);
                  const completed = completion?.status === 'completed';
                  const started = !!completion;
                  return (
                    <article key={project.id} className="border border-[#171717] bg-white flex flex-col">
                      <div className="p-5 border-b border-[#171717] flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#666666] mb-2">
                            Project {String(index + 1).padStart(2, '0')} · {project.difficulty}
                          </div>
                          <h3 className="text-xl font-black tracking-tight">{project.title}</h3>
                        </div>
                        <span className={`shrink-0 px-2 py-1 text-[10px] font-black uppercase tracking-widest ${completed ? 'bg-[#171717] text-white' : 'border border-[#171717]'}`}>
                          {completed ? '已完成' : started ? '进行中' : '未开始'}
                        </span>
                      </div>
                      <div className="p-5 flex-1 space-y-4">
                        <p className="text-sm leading-relaxed text-[#444444]">{project.description}</p>
                        <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-widest text-[#666666]">
                          <span className="inline-flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5" /> {project.estimatedTime} min</span>
                          <span>{project.projectType.replaceAll('_', ' ')}</span>
                        </div>
                        {project.objectives && (
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-widest mb-1">目标</div>
                            <p className="text-sm whitespace-pre-line">{project.objectives}</p>
                          </div>
                        )}
                        {project.requirements && (
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-widest mb-1">要求</div>
                            <p className="text-sm whitespace-pre-line">{project.requirements}</p>
                          </div>
                        )}
                      </div>
                      <div className="p-4 border-t border-[#171717] flex flex-wrap gap-2">
                        {!user ? (
                          <Link to="/auth/login" className="px-4 py-2 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest">
                            登录后开始
                          </Link>
                        ) : !started ? (
                          <button
                            onClick={() => startPracticeMutation.mutate(project.id)}
                            disabled={startPracticeMutation.isPending}
                            className="px-4 py-2 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            开始实践
                          </button>
                        ) : (
                          <>
                            <a
                              href={project.projectUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 border border-[#171717] text-[10px] font-black uppercase tracking-widest hover:bg-[#EEEDE9]"
                            >
                              打开项目 ↗
                            </a>
                            {!completed && (
                              <button
                                onClick={() => completePracticeMutation.mutate(project.id)}
                                disabled={completePracticeMutation.isPending}
                                className="px-4 py-2 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                              >
                                标记完成
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </TabPanel>

          {/* v1.9-alpha.2 (batch-7 A-05 续): Reviews tab — 列表 + 新评价表单 */}
          <TabPanel value={activeTab} tabKey="reviews" idPrefix="course-detail">
            <ReviewsSection
              reviews={reviewsQuery.data?.items ?? []}
              isLoading={reviewsQuery.isLoading}
              isError={reviewsQuery.isError}
              loggedIn={!!user}
              creating={createReview}
              helpful={helpfulReview}
            />
          </TabPanel>
        </div>
      </section>

      {/* v1.9-alpha.2 (batch-7 A-05 续): 相似课程 — tags footer 之上 */}
      {similarQuery.data && similarQuery.data.length > 0 && (
        <SimilarCoursesSection courses={similarQuery.data} />
      )}

      {/* Tags footer */}
      {tags.length > 0 && (
        <section className="border-b border-[#171717] bg-white">
          <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#666666] mr-2">Tags</span>
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1.5 border border-[#171717] text-[10px] font-black uppercase tracking-widest hover:bg-[#171717] hover:text-white transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Toasts */}
      <div className="fixed top-24 right-6 z-50 space-y-2 max-w-xs w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 border-2 border-[#171717] animate-in fade-in slide-in-from-right duration-300 ${
              toast.type === 'points' ? 'bg-[#171717] text-white' : 'bg-white text-[#171717]'
            }`}
          >
            {toast.type === 'points' ? <Star className="w-4 h-4" /> : <Award className="w-4 h-4" />}
            <span className="text-sm font-black tracking-tight">{toast.message}</span>
          </div>
        ))}
      </div>

      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        type="course"
        itemId={course.id}
        title={course.title}
        price={course.price}
        costType={course.costType}
      />
    </div>
  );
}

// ============================================================================
// v1.9-alpha.2 (batch-7 A-05 续): Reviews tab 内容
// ============================================================================
function ReviewsSection({
  reviews,
  isLoading,
  isError,
  loggedIn,
  creating,
  helpful,
}: {
  reviews: Review[];
  isLoading: boolean;
  isError: boolean;
  loggedIn: boolean;
  creating: { mutate: (input: { rating: number; content: string }) => void; isPending: boolean };
  helpful: { mutate: (id: string) => void; isPending: boolean };
}) {
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || trimmed.length < 5) return;
    creating.mutate({ rating, content: trimmed });
    setContent('');
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">
        {isLoading && <p className="text-sm text-[#666666]">加载中…</p>}
        {isError && (
          <p className="text-sm text-red-700">评价加载失败,请刷新重试</p>
        )}
        {!isLoading && !isError && reviews.length === 0 && (
          <div className="border border-dashed border-[#171717] p-6 text-center">
            <p className="text-sm text-[#666666]">暂无评价 — 学完课程后回来分享你的体验</p>
          </div>
        )}
        {reviews.map((r) => (
          <article key={r.id} className="border border-[#171717] p-5 bg-white">
            <header className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-full bg-[#171717] text-white text-xs font-black uppercase flex items-center justify-center shrink-0">
                  {r.user.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-black truncate">{r.user.name}</div>
                  <div className="text-xs text-[#666666]">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 shrink-0">
                {'★'.repeat(r.rating)}
                <span className="text-neutral-300">{'★'.repeat(5 - r.rating)}</span>
              </div>
            </header>
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{r.content}</p>
            <footer className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={helpful.isPending}
                onClick={() => helpful.mutate(r.id)}
                className="text-[10px] font-black uppercase tracking-widest border border-[#171717] px-3 py-1.5 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-50"
              >
                有用 ({r.helpful})
              </button>
            </footer>
          </article>
        ))}
      </div>

      <aside className="space-y-4">
        <div className="border border-[#171717] p-5 bg-white">
          <h3 className="text-[10px] font-black uppercase tracking-widest mb-3">写评价</h3>
          {loggedIn ? (
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">评分</span>
                <div className="flex gap-1" role="radiogroup" aria-label="评分">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      onClick={() => setRating(n)}
                      className={`text-xl ${n <= rating ? 'text-amber-500' : 'text-neutral-300'} hover:text-amber-500 transition-colors`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="block text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">内容 (≥5 字)</span>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  minLength={5}
                  rows={4}
                  placeholder="说说你对这门课的看法"
                  className="w-full border border-[#171717] p-2 text-sm bg-white"
                  data-testid="review-content"
                />
              </label>
              <button
                type="submit"
                disabled={creating.isPending || content.trim().length < 5}
                className="w-full bg-[#171717] text-white text-xs font-black uppercase tracking-widest py-3 disabled:opacity-50"
              >
                {creating.isPending ? '提交中…' : '提交评价'}
              </button>
            </form>
          ) : (
            <div className="text-xs text-[#666666]">
              <a href={`/auth/login?from=${encodeURIComponent(window.location.pathname)}`} className="underline">
                登录
              </a>{' '}
              后即可写评价
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ============================================================================
// v1.9-alpha.2 (batch-7 A-05 续): 相似课程 (来自 /courses/:id/similar)
// ============================================================================
function SimilarCoursesSection({
  courses,
}: {
  courses: Array<{
    id: string;
    title: string;
    thumbnail: string;
    level: string;
    ratingAvg: number;
    ratingCount: number;
  }>;
}) {
  return (
    <section className="border-b border-[#171717] bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-4">
          相关课程
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {courses.map((c) => (
            <Link
              key={c.id}
              to={`/courses/${c.id}`}
              className="group block border border-[#171717] bg-white hover:bg-[#EEEDE9] transition-colors"
            >
              <div className="aspect-video bg-[#171717] overflow-hidden">
                <img
                  src={c.thumbnail}
                  alt={c.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
              <div className="p-3">
                <h4 className="text-xs font-black line-clamp-2 leading-tight">{c.title}</h4>
                <p className="mt-1 text-[10px] text-[#666666]">
                  {c.ratingCount > 0 ? `★ ${c.ratingAvg.toFixed(1)} (${c.ratingCount})` : '新课程'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
