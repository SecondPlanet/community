/**
 * DegreeDetailPage — v1.2.0 全量去 mock
 *
 * 全部数据来自 `GET /api/v1/degrees/:id` (NanoDegreeWithPath)
 * 失败 → 渲染 EmptyState, 无 mock fallback
 *
 * 真实可用:
 *   - Hero (title / description / learningPoints)
 *   - 课程列表 (degree.courses[])
 *   - Stats (degree.stats.{courseCount, totalLessons, totalLearners, estimatedHours})
 *   - 立即报名 (PurchaseModal)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Seo } from '../../components/Seo';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  GraduationCap,
  Users,
  Sparkles,
  PlayCircle,
  ChevronRight,
  CheckCircle2,
  ArrowUpRight,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import type { NanoDegreeWithPath } from '@secondplanet/shared-types';
import { Button, buttonClassName } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { PurchaseModal } from './PurchaseModal';
import { usePageSettings, useI18n, pickPage } from '../../lib/cms';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { LazyImage } from '../../components/ui/LazyImage';

export function DegreeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'courses'>('overview');

  // CMS-driven copy
  const { t } = useI18n();
  const { data: pageData } = usePageSettings('degrees', [
    'detail.back', 'detail.tabs', 'detail.section_eyebrows', 'detail.sidebar_hours_label', 'detail.empty_courses',
  ]);
  const back = pickPage(pageData, 'detail.back', 'zh-CN', t('degree.detail.back', 'Back To Degrees'));

  const { data: degree, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['degree', id],
    queryFn: async () => {
      const { data } = await api.get<NanoDegreeWithPath>(`/api/v1/degrees/${id}`);
      return data;
    },
    enabled: !!id,
    retry: 1,
  });

  const { data: myEnrollments } = useQuery({
    queryKey: ['enrollments', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/enrollments/me');
      return data as Array<{ id: string; degreeId?: string | null; courseId?: string | null }>;
    },
    enabled: !!user,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="bg-[#F5F4F0] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton variant="text" className="h-4 w-32" />
          <Skeleton variant="rectangle" className="h-64 w-full rounded-2xl" />
          <Skeleton variant="rectangle" className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    const status = (error as any)?.response?.status;
    return (
      <div className="bg-[#F5F4F0] min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-32 text-center">
          <h2 className="text-2xl font-bold text-[#171717] mb-2">
            {t('degree.error.load', '学位加载失败')}
          </h2>
          <p className="text-sm text-[#666666] mb-6">
            {status === 404
              ? t('degree.error.404', '该学位不存在或已下架')
              : `${t('common.error.network', '网络错误')}${(error as any)?.message ? `: ${(error as any).message}` : ''}`}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" size="md" onClick={() => refetch()}>
              重试
            </Button>
            <Link to="/degrees" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
              返回学位列表
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!degree) {
    return (
      <div className="bg-[#F5F4F0] min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-32 text-center">
          <h2 className="text-2xl font-bold text-[#171717] mb-2">
            {t('degree.not_found', '学位不存在')}
          </h2>
          <p className="text-sm text-[#666666] mb-6">
            {t('degree.not_found.desc', '可能链接已失效,回到学位列表看看其他选择。')}
          </p>
          <Link to="/degrees" className={buttonClassName({ variant: 'primary', size: 'md' })}>
            回到学位列表
          </Link>
        </div>
      </div>
    );
  }

  const enrolled = !!myEnrollments?.some((e) => e.degreeId === id);
  const isFree = degree.costType === 'free' || degree.costType === 'charity';
  const learningPoints = (() => {
    try {
      return JSON.parse(degree.learningPoints) as string[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="bg-[#F5F4F0] min-h-screen text-[#171717]">
      <Seo
        title={degree ? degree.title : '学位详情'}
        description={degree?.description ?? '学位详情页'}
        path={degree ? `/degrees/${degree.id}` : '/degrees'}
        image={degree?.thumbnail || undefined}
        type="article"
        jsonLd={degree ? {
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: degree.title,
          description: degree.description,
          provider: { '@type': 'Organization', name: 'SecondPlanet' },
          offers: {
            '@type': 'Offer',
            category: degree.costType === 'free' ? 'Free' : 'Paid',
            price: degree.costType === 'free' ? 0 : Number(degree.price),
            priceCurrency: 'CNY',
          },
        } : undefined}
      />
      {/* Top action bar */}
      <section className="bg-[#F5F4F0] border-b border-[#171717]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            to="/degrees"
            className="inline-flex items-center gap-2 text-xs text-[#666666] hover:text-[#171717] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {back}
          </Link>
        </div>
      </section>

      {/* Hero — split white + black */}
      <section className="border-b border-[#171717]">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-8 md:p-12 lg:p-16 bg-[#F5F4F0] border-b lg:border-b-0 lg:border-r border-[#171717] flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest">
                Nano Degree
              </span>
              {isFree ? (
                <span className="inline-flex items-center px-2 py-0.5 border border-[#171717] text-[#171717] text-[10px] font-black uppercase tracking-widest">
                  Free
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 border border-[#171717] text-[#171717] text-[10px] font-black uppercase tracking-widest">
                  ¥{degree.price}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-[#666666]">
                <Sparkles className="w-3 h-3" /> {degree.stats?.estimatedHours ?? 0}h
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95] mb-6 break-words">
              {degree.title}
            </h1>
            <p className="text-[#666666] text-lg leading-relaxed mb-8 max-w-2xl">
              {degree.description}
            </p>

            <div className="grid grid-cols-4 border-t border-[#171717]">
              <div className="py-5 border-r border-[#171717]">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">{t('degree.stats.courses', 'Courses')}</div>
                <div className="text-2xl font-black tracking-tighter">{degree.stats?.courseCount ?? degree.courses.length}</div>
              </div>
              <div className="py-5 border-r border-[#171717]">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">{t('degree.stats.lessons', 'Lessons')}</div>
                <div className="text-2xl font-black tracking-tighter">{degree.stats?.totalLessons ?? 0}</div>
              </div>
              <div className="py-5 border-r border-[#171717]">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">{t('degree.stats.learners', 'Learners')}</div>
                <div className="text-2xl font-black tracking-tighter">{degree.stats?.totalLearners ?? 0}</div>
              </div>
              <div className="py-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-1">{t('degree.stats.hours', 'Hours')}</div>
                <div className="text-2xl font-black tracking-tighter">{degree.stats?.estimatedHours ?? 0}</div>
              </div>
            </div>
          </div>

          {/* Right: thumbnail + CTA */}
          <div className="bg-[#171717] text-white flex flex-col">
            <div className="aspect-[16/10] border-b border-white/20 overflow-hidden bg-[#262626]">
              {degree.thumbnail ? (
                <LazyImage
                  src={degree.thumbnail}
                  alt={degree.title}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <GraduationCap className="w-16 h-16 text-white/30" />
                </div>
              )}
            </div>
            <div className="p-8 md:p-12 flex flex-col gap-4">
              {enrolled ? (
                <div className="inline-flex items-center justify-between gap-3 border border-white px-6 py-4 font-black uppercase tracking-widest text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {t('degree.enrolled', '已报名,继续学习')}
                </div>
              ) : user ? (
                <button
                  onClick={() => setPurchaseOpen(true)}
                  className="inline-flex items-center justify-between gap-3 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-widest text-sm hover:bg-[#EEEDE9] transition-colors"
                >
                  <span>{isFree ? t('degree.cta.enroll', 'Free Enroll') : t('degree.cta.buy', 'Buy ¥{price}').replace('{price}', String(degree.price))}</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-between gap-3 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-widest text-sm hover:bg-[#EEEDE9] transition-colors"
                >
                  <span>{t('degree.cta.login', 'Login to Enroll')}</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              )}
              <div className="text-[10px] font-black uppercase tracking-widest text-white/40 pt-2">
                {degree.courses.length} 门课程 · {degree.stats?.totalLessons ?? 0} 课时
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs — P1-3 用公共 Tabs,加 role/aria-selected */}
      <section className="border-b border-[#171717] bg-[#F5F4F0] sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto scrollbar-hide">
          <Tabs<'overview' | 'courses'>
            value={activeTab}
            onChange={(k) => setActiveTab(k)}
            ariaLabel="学位详情"
            items={[
              { key: 'overview', label: t('degrees.detail.tabs.overview', '学位概览'), icon: BookOpen },
              { key: 'courses', label: `${t('degrees.detail.tabs.courses', '课程')} (${degree.courses.length})`, icon: PlayCircle },
            ]}
            idPrefix="degree-detail"
            className="flex divide-x divide-[#171717]"
            itemClassName={(_, active) =>
              `py-4 px-5 text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#171717] ${
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <TabPanel value={activeTab} tabKey="overview" idPrefix="degree-detail">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-3">
                    / 01 Overview
                  </div>
                  <p className="text-lg leading-relaxed">{degree.description}</p>
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
                          className="flex items-start gap-3 p-4 border-b border-r border-[#171717] hover:bg-[#F5F4F0]:bg-[#EEEDE9] transition-colors"
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

              </div>

              {/* Sidebar */}
              <div>
                <div className="border border-[#171717] bg-[#F5F4F0]">
                  <div className="p-4 border-b border-[#171717]">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">{t('degree.sidebar.hours', '学位时长')}</div>
                    <div className="text-lg font-black mt-1">{degree.stats?.estimatedHours ?? 0} 小时</div>
                  </div>
                  <div>
                    {degree.courses.slice(0, 5).map((c, i) => (
                      <div
                        key={c.id}
                        className={`p-4 ${i < Math.min(degree.courses.length, 5) - 1 ? 'border-b border-[#171717]' : ''} hover:bg-[#F5F4F0]:bg-[#F5F4F0] transition-colors`}
                      >
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-1">
                          Step {String(c.stepNumber).padStart(2, '0')}
                        </div>
                        <div className="text-sm font-black tracking-tight leading-snug">{c.title}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
                          {c.lessonCount} 课时 · {c.instructor}
                        </div>
                      </div>
                    ))}
                    {degree.courses.length > 5 && (
                      <div className="p-3 text-center text-[10px] text-[#666666] border-t border-[#171717]">
                        + {degree.courses.length - 5} 门课程
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value={activeTab} tabKey="courses" idPrefix="degree-detail">
            <div>
              {degree.courses.length === 0 ? (
                <div className="text-center py-24 text-[#666666]">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 text-[#A3A3A3]" />
                  {t('degrees.detail.empty_courses', '该学位下暂无课程')}
                </div>
              ) : (
                <div className="border border-[#171717]">
                  {degree.courses.map((c, i) => (
                    <Link
                      key={c.id}
                      to={`/courses/${c.id}`}
                      className={`flex items-center gap-4 px-4 py-4 bg-[#F5F4F0] hover:bg-[#EEEDE9] transition-colors group ${
                        i < degree.courses.length - 1 ? 'border-b border-[#171717]' : ''
                      }`}
                    >
                      <div className="shrink-0 w-12 h-12 bg-[#171717] text-white flex items-center justify-center font-black text-sm">
                        {String(c.stepNumber).padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black tracking-tight leading-snug truncate">{c.title}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1 flex items-center gap-2 flex-wrap">
                          <span>{c.lessonCount} 课时</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> {c.learnerCount}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {c.duration}
                          </span>
                          <span>·</span>
                          <span>{c.instructor}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#999999] group-hover:text-[#171717] transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </TabPanel>
        </div>
      </section>

      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        type="degree"
        itemId={degree.id}
        title={degree.title}
        price={degree.price}
        costType={degree.costType}
      />
    </div>
  );
}
