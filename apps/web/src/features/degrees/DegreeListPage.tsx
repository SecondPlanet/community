import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, Sparkles, ArrowUpRight, PlayCircle } from 'lucide-react';
import { Seo } from '../../components/Seo';
import { EmptyState } from '../../components/ui/EmptyState';
import { QueryErrorState } from '../../components/QueryErrorState';
import api from '../../lib/api';
import type { NanoDegreeWithPath } from '@secondplanet/shared-types';
import { usePageSettings, useI18n, pickPage } from '../../lib/cms';

export function DegreeListPage() {
  const { data: degrees, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['degrees'],
    queryFn: async () => {
      const { data } = await api.get<NanoDegreeWithPath[]>('/api/v1/degrees');
      return data;
    },
    retry: 0,
  });

  // CMS-driven copy
  const { t } = useI18n();
  const { data: pageData } = usePageSettings('degrees', ['list.eyebrow', 'list.headline', 'list.sub']);
  const eyebrow = pickPage(pageData, 'list.eyebrow', 'zh-CN', t('degree.eyebrow.list', '/ 02 Nano Degrees'));
  const headline = pickPage(pageData, 'list.headline', 'zh-CN', t('degree.headline.list', 'LEARNING\nPATHS'));
  const sub = pickPage(pageData, 'list.sub', 'zh-CN', t('degree.list.sub', '体系化课程路径，从入门到进阶一站式打通，拿下 SecondPlanet 认证学位。'));
  const headlineLines = headline.split('\n');

  return (
    <div className="bg-[#F5F4F0] text-[#171717] animate-in fade-in duration-500">
      <Seo
        title={headline.replace(/\n/g, ' ')}
        description={sub}
        path="/degrees"
      />
      {/* Header banner */}
      <section className="border-b border-[#171717] bg-[#171717] text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-4">
            {eyebrow}
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter uppercase leading-[0.9] mb-6">
            {headlineLines[0] ?? headline}
            <br />{headlineLines[1] ?? ''}
          </h1>
          <p className="text-white/60 text-lg max-w-2xl leading-relaxed">
            {sub}
          </p>
        </div>
      </section>

      {/* Degrees list */}
      <section className="border-b border-[#171717]">
        {isError ? (
          <div className="max-w-7xl mx-auto px-6 py-32">
            <QueryErrorState
              error={error}
              onRetry={() => refetch()}
              title="无法加载学位列表"
              description="请检查网络后重试"
            />
          </div>
        ) : isLoading ? (
          <div className="max-w-7xl mx-auto px-6 py-32 text-center text-[#666666] font-medium">
            {t('common.loading', '加载中...')}
          </div>
        ) : (degrees?.length ?? 0) === 0 ? (
          <div className="max-w-7xl mx-auto px-6 py-32">
            <EmptyState
              icon={<GraduationCap className="w-5 h-5" />}
              title={t('degree.empty.title', '暂无学位')}
              description={t('degree.empty.sub', '学位项目即将上线,敬请期待')}
            />
          </div>
        ) : (
          <div>
            {degrees?.map((degree, idx) => {
              const isFree = degree.costType === 'free' || degree.costType === 'charity';
              return (
                <Link
                  key={degree.id}
                  to={`/degrees/${degree.id}`}
                  className={`group block hover:bg-[#EEEDE9] transition-colors ${
                    idx < (degrees?.length ?? 0) - 1 ? 'border-b border-[#171717]' : ''
                  }`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 max-w-7xl mx-auto px-6">
                    {/* Number column */}
                    <div className="lg:col-span-1 p-8 border-b lg:border-b-0 lg:border-r border-[#171717] flex lg:items-start">
                      <span className="text-2xl md:text-3xl font-black tracking-tighter text-[#A3A3A3]">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>

                    {/* Content column */}
                    <div className="lg:col-span-7 p-8 border-b lg:border-b-0 lg:border-r border-[#171717]">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest">
                          <Sparkles className="w-3 h-3" /> {t('degree.badge', 'Nano Degree')}
                        </span>
                        {isFree ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-[#171717] text-[#171717] text-[10px] font-black uppercase tracking-widest">
                            Free
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#666666]">
                            ¥{Number(degree.price).toFixed(0)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-2xl md:text-3xl font-black tracking-tighter leading-tight mb-3">
                        {degree.title}
                      </h3>
                      <p className="text-sm text-[#666666] mb-6 leading-relaxed max-w-2xl">
                        {degree.description}
                      </p>

                      {/* Course path */}
                      <div className="flex items-center flex-wrap gap-2">
                        {degree.courses.slice(0, 4).map((c, i) => (
                          <div key={c.id} className="flex items-center gap-2">
                            <span className="text-xs font-black w-6 h-6 bg-[#171717] text-white flex items-center justify-center shrink-0">
                              {c.stepNumber}
                            </span>
                            <span className="text-sm font-bold truncate max-w-[200px]">{c.title}</span>
                            {i < Math.min(degree.courses.length, 4) - 1 && (
                              <span className="text-[#999999]">→</span>
                            )}
                          </div>
                        ))}
                        {degree.courses.length > 4 && (
                          <span className="text-xs text-[#666666] font-bold">
                            +{degree.courses.length - 4}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats column */}
                    <div className="lg:col-span-3 p-8 border-b lg:border-b-0 lg:border-r border-[#171717] flex flex-col justify-center gap-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#666666]">
                        <BookOpen className="w-3 h-3" /> {degree.stats.courseCount} {t('degree.stats.courses', 'Courses')}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#666666]">
                        <PlayCircle className="w-3 h-3" /> {degree.stats.totalLessons} {t('degree.stats.lessons', '课时')}
                      </div>
                      <div className="text-3xl font-black tracking-tighter">
                        {degree.stats.estimatedHours}
                        <span className="text-sm text-[#666666] ml-1">{t('degree.stats.hours', '小时')}</span>
                      </div>
                    </div>

                    {/* Arrow column */}
                    <div className="lg:col-span-1 p-8 flex items-center justify-end">
                      <ArrowUpRight className="w-6 h-6 text-[#666666] group-hover:text-[#171717] group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
