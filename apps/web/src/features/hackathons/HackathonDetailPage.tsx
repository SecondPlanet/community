import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Clock3,
  ClipboardCheck,
  FileCheck2,
  MapPin,
  Users,
  ScrollText,
  Megaphone,
  ArrowUpRight,
  UserCheck,
} from 'lucide-react';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { HackathonStatusBadge } from './HackathonStatusBadge';
import { AnnouncementList } from './AnnouncementList';
import type { HackathonWithDetails } from '@secondplanet/shared-types';
import { usePageSettings, useI18n, pickPage } from '../../lib/cms';
import { useLocaleDate } from '../../hooks/useLocaleDate';
import { Seo } from '../../components/Seo';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { LazyImage } from '../../components/ui/LazyImage';
import { QueryErrorState } from '../../components/QueryErrorState';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../../components/auth/Toast';
import { extractErrorMessage } from '../../lib/apiError';
import { RegistrationFlow } from './RegistrationFlow';
import { ParticipantHub } from './ParticipantHub';

const TABS = [
  { key: 'overview', label: '概览', icon: ScrollText },
  { key: 'participation', label: '我的参赛', icon: UserCheck },
  { key: 'announcements', label: '公告', icon: Megaphone },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function HackathonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [registrationOpen, setRegistrationOpen] = useState(false);

  const { data: hackathon, isLoading, isError, error, refetch } = useQuery<HackathonWithDetails>({
    queryKey: ['hackathon', id],
    queryFn: () => hackathonsApi.getById(id!),
    enabled: !!id,
    retry: 0,
  });

  const { data: announcements } = useQuery({
    queryKey: ['hackathon-announcements', id],
    queryFn: () => hackathonsApi.getAnnouncements(id!),
    enabled: !!id,
  });

  // 邀请链接: /hackathons/:id?joinTeam=<teamId> → 自动加入并切换到参赛 tab
  const user = useAuthStore((state) => state.user);
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const joinTeamId = searchParams.get('joinTeam');
    if (!joinTeamId || !id || !user) return;
    setSearchParams({}, { replace: true });
    hackathonsApi.joinTeam(id, joinTeamId)
      .then(() => {
        showToast('已加入队伍', 'success');
        setActiveTab('participation');
      })
      .catch((err: unknown) => showToast(extractErrorMessage(err, '加入队伍失败'), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, id, user]);

  // CMS-driven copy (P1-fix 2026-10-16: hooks 必须无条件执行,所有 early return 移到 hooks 之后)
  const { t } = useI18n();
  const { formatDate, formatDateTime } = useLocaleDate();
  const { data: pageData } = usePageSettings('hackathons', [
    'detail.back', 'detail.cta_registration', 'detail.panel_label_desc', 'detail.panel_label_rules', 'detail.empty_judges',
  ]);
  const back = pickPage(pageData, 'detail.back', 'zh-CN', t('hackathon.detail.back', 'Back To Hackathons'));
  const ctaDefault = pickPage(pageData, 'detail.cta_registration', 'zh-CN', t('hackathon.cta.registration', '前往报名'));
  const panelDesc = pickPage(pageData, 'detail.panel_label_desc', 'zh-CN', t('hackathon.panel.desc', '01 / Description'));
  const panelRules = pickPage(pageData, 'detail.panel_label_rules', 'zh-CN', t('hackathon.panel.rules', '02 / Rules'));
  const emptyJudges = pickPage(pageData, 'detail.empty_judges', 'zh-CN', t('hackathon.panel.empty_judges', '评委待定'));

  // P0 (audit 2026-07-24): 区分"网络挂"和"找不到"
  if (isError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <QueryErrorState
          error={error}
          onRetry={() => refetch()}
          title="无法加载黑客松详情"
          description="请检查网络后重试"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-32 text-[#525252] dark:text-[#A8A6A0]">{t('common.loading', '加载中...')}</div>
    );
  }

  if (!hackathon) {
    return (
      <div className="text-center py-32">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#525252] dark:text-[#A8A6A0] mb-3">
          / 404
        </div>
        <p className="text-2xl font-black tracking-tighter">{t('hackathon.not_found', '黑客松不存在')}</p>
      </div>
    );
  }

  const startDate = new Date(hackathon.startDate);
  const endDate = new Date(hackathon.endDate);
  // 基础信息 (描述 / 规则 / 奖品 / 评委) 已经在 tab 里, hero 只挂 1 个外链 CTA。
  // 报名 / 了解更多 / 官网 等都走同一个链接, label 可配, 留空用 CMS default。
  const regUrl = hackathon.registrationUrl;
  const regLabel = (hackathon.registrationLabel || '').trim() || ctaDefault;

  return (
    <div className="bg-[#F5F4F0] dark:bg-[#0D0C0A] text-[#171717] dark:text-[#F5F4F0] animate-in fade-in duration-500">
      <Seo
        title={hackathon.title}
        description={hackathon.description?.slice(0, 200) ?? '黑客松详情'}
        path={`/hackathons/${hackathon.id}`}
        image={hackathon.bannerUrl || undefined}
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: hackathon.title,
          description: hackathon.description,
          startDate: new Date(hackathon.startDate).toISOString(),
          endDate: new Date(hackathon.endDate).toISOString(),
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
          location: hackathon.location
            ? { '@type': 'Place', name: hackathon.location }
            : { '@type': 'VirtualLocation', url: hackathon.registrationUrl || undefined },
          organizer: { '@type': 'Organization', name: 'SecondPlanet' },
        }}
      />
      {/* Top action bar */}
      <section className="border-b border-[#171717] bg-white dark:bg-[#1A1916]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link
            to="/hackathons"
            className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#525252] dark:text-[#A8A6A0] hover:text-[#171717] dark:hover:text-[#F5F4F0]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {back}
          </Link>
        </div>
      </section>

      {/* Hero — split banner + content */}
      <section className="border-b border-[#171717] dark:border-[#3a3a38]">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Banner */}
          <div className="lg:col-span-7 aspect-[2/1] sm:aspect-[16/10] max-h-[60vh] lg:aspect-auto lg:max-h-none border-b lg:border-b-0 lg:border-r border-[#171717] bg-[#EEEDE9] dark:bg-[#2C2A26] overflow-hidden">
            {hackathon.bannerUrl ? (
              <LazyImage
                src={hackathon.bannerUrl}
                alt={hackathon.title}
                fill
                eager
                className="object-cover"
              />
            ) : (
              <div className="relative w-full h-full overflow-hidden bg-[#DAD8D0] p-8 flex flex-col justify-end text-[#171717]">
                <div className="absolute -right-8 -top-8 w-64 h-64 rounded-full border-[32px] border-[#171717]/10" />
                <div className="absolute right-24 top-16 w-24 h-24 rounded-full bg-[#171717]" />
                <div className="relative text-[10px] font-black uppercase tracking-[0.35em] text-[#525252]">SecondPlanet · Hackathon</div>
                <div className="relative mt-2 max-w-md text-3xl md:text-5xl font-black tracking-tighter leading-none uppercase">Build what matters.</div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="lg:col-span-5 p-6 md:p-12 lg:p-16 flex flex-col justify-center bg-[#171717] text-white">
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <HackathonStatusBadge status={hackathon.status} className="border-white bg-white text-[#171717]" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95] mb-6 uppercase">
              {hackathon.title}
            </h1>

            {/* 基础信息 (banner + 这些字段都是 admin 提前填好的) */}
            <div className="grid grid-cols-2 gap-0 border border-white/20 mb-6">
              <div className="p-4 border-r border-b border-white/20">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {t('hackathon.stat.start', 'Start')}
                </div>
                <div className="text-sm font-black tracking-tight">{formatDate(startDate)}</div>
              </div>
              <div className="p-4 border-b border-white/20">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {t('hackathon.stat.end', 'End')}
                </div>
                <div className="text-sm font-black tracking-tight">{formatDate(endDate)}</div>
              </div>
              {hackathon.location && (
                <div className="p-4 border-r border-white/20">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {t('hackathon.stat.location', 'Location')}
                  </div>
                  <div className="text-sm font-black tracking-tight truncate">{hackathon.location}</div>
                </div>
              )}
              <div className="p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {t('hackathon.stat.team_size', 'Team Size')}
                </div>
                <div className="text-sm font-black tracking-tight">
                  {hackathon.minTeamSize}-{hackathon.maxTeamSize}
                </div>
              </div>
            </div>

            {hackathon.registrationMode === 'internal' ? (
              <RegistrationFlow
                hackathon={hackathon}
                open={registrationOpen}
                onOpenChange={setRegistrationOpen}
                onOpenParticipation={() => setActiveTab('participation')}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {regUrl ? (
                  <a
                    href={regUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-between gap-6 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-wider text-sm hover:bg-[#EEEDE9] dark:hover:bg-[#2C2A26] transition-colors"
                  >
                    <span>{regLabel}</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                ) : (
                  <div className="border border-dashed border-white/30 px-4 py-3 text-xs leading-relaxed text-white/60">
                    {t('hackathon.cta.empty', '组织者暂未配置报名外链，请关注下方公告。')}
                  </div>
                )}
              </div>
            )}
            <div className="mt-6 grid grid-cols-3 border-t border-white/20 pt-4">
              <CountStat label="已报名" value={hackathon._count?.registrations ?? 0} />
              <CountStat label="参赛队伍" value={hackathon._count?.teams ?? 0} />
              <CountStat label="作品提交" value={hackathon._count?.submissions ?? 0} icon={<FileCheck2 className="w-3 h-3" />} />
            </div>
          </div>
        </div>
      </section>

      {/* Tabs — P1-3 用公共 Tabs,加 role/aria-selected */}
      <section className="border-b border-[#171717] bg-white dark:bg-[#1A1916] sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-6 flex overflow-x-auto">
          <Tabs<TabKey>
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="黑客松详情"
            items={TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
            idPrefix="hackathon-detail"
            className="flex"
            itemClassName={(_, active) =>
              `py-4 px-5 text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 shrink-0 focus:outline-none focus:ring-2 focus:ring-[#171717] ${
                active
                  ? 'text-[#171717] dark:text-[#F5F4F0] border-b-2 border-[#171717] dark:border-[#3a3a38] -mb-px'
                  : 'text-[#525252] dark:text-[#A8A6A0] hover:text-[#171717] dark:hover:text-[#F5F4F0]'
              }`
            }
          />
        </div>
      </section>

      {/* Tab content */}
      <section className="border-b border-[#171717] dark:border-[#3a3a38]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <TabPanel value={activeTab} tabKey="overview" idPrefix="hackathon-detail">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 border-2 border-[#171717] bg-white dark:bg-[#1A1916] p-6">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#525252] dark:text-[#A8A6A0]">/ Schedule</div>
                    <h2 className="text-xl font-black tracking-tight mt-1">关键时间</h2>
                  </div>
                  <Clock3 className="w-5 h-5" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <TimelineItem label="报名截止" value={hackathon.registerDeadline ? formatDateTime(hackathon.registerDeadline, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '以外部页面为准'} />
                  <TimelineItem label="比赛开始" value={formatDateTime(hackathon.startDate, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                  <TimelineItem label="作品提交截止" value={hackathon.submissionDeadline ? formatDateTime(hackathon.submissionDeadline, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : formatDateTime(hackathon.endDate, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                </div>
                <div className="mt-3 pt-3 border-t border-[#EEEDE9] text-xs text-[#525252] dark:text-[#A8A6A0]">
                  活动结束：{formatDateTime(hackathon.endDate, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 具体评审与结果发布时间请以公告为准
                </div>
              </div>
              <div className="border-2 border-[#171717] bg-[#F0EEE8] dark:bg-[#1A1916] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardCheck className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em]">/ Submit</span>
                </div>
                <h2 className="text-xl font-black tracking-tight mb-3">你需要提交什么</h2>
                {hackathon.submissionRequirements ? (
                  <ul className="space-y-2 text-sm leading-relaxed">
                    {hackathon.submissionRequirements.split(/\r?\n/).filter(Boolean).map((item, index) => (
                      <li key={`${item}-${index}`} className="flex gap-2"><span className="font-black">{String(index + 1).padStart(2, '0')}</span><span>{item.replace(/^[-•*]\s*/, '')}</span></li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#525252] dark:text-[#A8A6A0] leading-relaxed">作品要求待组织者补充，请先查看比赛规则与公告。</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <BrutalPanel label={panelDesc} title={t('hackathon.panel.desc.title', '活动介绍')}>
                  <p className="text-[#171717] dark:text-[#F5F4F0] whitespace-pre-line leading-relaxed">{hackathon.description}</p>
                </BrutalPanel>
                {hackathon.rules && (
                  <BrutalPanel label={panelRules} title={t('hackathon.panel.rules.title', '比赛规则')}>
                    <p className="text-[#171717] dark:text-[#F5F4F0] whitespace-pre-line leading-relaxed">{hackathon.rules}</p>
                  </BrutalPanel>
                )}
                {hackathon.registrationMode !== 'internal' && hackathon.registrationUrl && hackathon.status !== 'cancelled' && hackathon.status !== 'finished' && hackathon.status !== 'judging' && (
                  <div className="border-2 border-[#171717] dark:border-[#3a3a38] bg-[#171717] text-white p-6 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50 mb-1">Ready to build?</div>
                      <div className="font-black">报名后，按外部页面完成参赛登记</div>
                    </div>
                    <a href={hackathon.registrationUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-2 bg-white text-[#171717] px-4 py-3 text-xs font-black uppercase tracking-wider hover:bg-[#EEEDE9] dark:hover:bg-[#2C2A26]">
                      {regLabel} <ArrowUpRight className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>
              <div className="space-y-6">
                {hackathon.prizes && (
                  <div className="border-2 border-[#171717] bg-white dark:bg-[#1A1916]">
                    <div className="bg-[#171717] text-white p-4 flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('hackathon.prizes.label', 'Prizes')}</span>
                    </div>
                    <div className="p-5">
                      <p className="text-[#171717] dark:text-[#F5F4F0] whitespace-pre-line leading-relaxed">{hackathon.prizes}</p>
                    </div>
                  </div>
                )}
                <div className="border-2 border-[#171717] bg-white dark:bg-[#1A1916]">
                  <div className="bg-[#171717] text-white p-4">
                    <span className="text-[10px] font-black uppercase tracking-widest">{t('hackathon.judges.label', 'Judges')}</span>
                  </div>
                  <div className="p-5">
                    {hackathon.judges?.length ? (
                      <div className="divide-y divide-[#EEEDE9]">
                        {hackathon.judges.map((j) => (
                          <div key={j.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="text-sm font-black tracking-tight">{j.name}</div>
                            {j.title && <div className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] mt-0.5">{j.title}</div>}
                            {j.bio && <div className="text-xs text-[#525252] dark:text-[#A8A6A0] mt-1 leading-relaxed">{j.bio}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#525252] dark:text-[#A8A6A0]">{emptyJudges}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value={activeTab} tabKey="participation" idPrefix="hackathon-detail">
            <ParticipantHub hackathon={hackathon} onRegister={() => setRegistrationOpen(true)} />
          </TabPanel>

          <TabPanel value={activeTab} tabKey="announcements" idPrefix="hackathon-detail">
            <AnnouncementList announcements={announcements} />
          </TabPanel>
        </div>
      </section>
    </div>
  );
}

function TimelineItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#171717] dark:border-[#3a3a38] p-4 min-h-[88px]">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] mb-2">{label}</div>
      <div className="text-sm font-black leading-snug">{value}</div>
    </div>
  );
}

function CountStat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="border-r last:border-r-0 border-white/20 px-3 first:pl-0">
      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/50">{icon}{label}</div>
      <div className="mt-1 text-2xl font-black tracking-tighter leading-none">{value}</div>
    </div>
  );
}

function BrutalPanel({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-[#171717] bg-white dark:bg-[#1A1916]">
      <div className="bg-[#171717] text-white p-4 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{title}</span>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
