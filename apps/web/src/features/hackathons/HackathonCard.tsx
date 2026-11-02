import { Link } from 'react-router-dom';
import { Calendar, MapPin, Users, ArrowUpRight } from 'lucide-react';
import type { HackathonListItem } from '@secondplanet/shared-types';
import { HackathonStatusBadge } from './HackathonStatusBadge';
import { CountdownChip } from '../../components/CountdownChip';
import { I18nText } from '../../components/I18nText';
import { useLocaleDate } from '../../hooks/useLocaleDate';
import { useI18n } from '../../lib/cms';

interface HackathonCardProps {
  hackathon: HackathonListItem;
  isOrganizer?: boolean;
}

export function HackathonCard({ hackathon, isOrganizer }: HackathonCardProps) {
  const { t } = useI18n();
  const { locale } = useLocaleDate();
  const formatRange = (d: Date | string) =>
    new Date(d).toLocaleDateString(locale, { month: 'short', day: 'numeric' });

  // 倒计时目标优先级:registerDeadline > startDate
  // status === 'upcoming' 时优先显示报名截止
  // 其他状态显示距开赛
  const countdownTarget =
    hackathon.status === 'upcoming' && hackathon.registerDeadline
      ? hackathon.registerDeadline
      : hackathon.startDate;
  const countdownPrefix =
    hackathon.status === 'upcoming' && hackathon.registerDeadline
      ? t('hackathon.countdown.register_deadline', '报名截止')
      : hackathon.status === 'upcoming'
        ? t('hackathon.countdown.to_start', '距开赛')
        : t('hackathon.countdown.to_begin', '距开始');

  return (
    <Link
      to={`/hackathons/${hackathon.id}`}
      className="group grid grid-cols-12 items-center gap-4 md:gap-6 p-5 md:p-6 bg-white dark:bg-[#1A1916] hover:bg-[#F5F4F0] dark:hover:bg-[#0D0C0A] transition-colors"
    >
      {/* Date stamp */}
      <div className="col-span-3 md:col-span-2 flex flex-col border border-[#171717] p-3 text-center bg-[#F5F4F0] dark:bg-[#0D0C0A]">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">
          {new Date(hackathon.startDate).toLocaleDateString(locale, { month: 'short' })}
        </span>
        <span className="text-2xl font-black tracking-tighter leading-none mt-0.5">
          {new Date(hackathon.startDate).getDate()}
        </span>
        <span className="text-[9px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] mt-0.5">
          {new Date(hackathon.endDate).getDate()}
        </span>
      </div>

      {/* Content */}
      <div className="col-span-8 md:col-span-9 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <HackathonStatusBadge status={hackathon.status} />
          {hackathon.myRegistration?.status === 'registered' && (
            <span className="inline-flex items-center px-2 py-0.5 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest">
              <I18nText k="hackathon.registered" default="已报名" />
            </span>
          )}
          {isOrganizer && (
            <span className="inline-flex items-center px-2 py-0.5 border border-[#171717] dark:border-[#3a3a38] text-[10px] font-black uppercase tracking-widest">
              <I18nText k="hackathon.organizer_badge" default="我主办的" />
            </span>
          )}
        </div>

        <h3 className="text-lg md:text-xl font-black tracking-tight leading-tight truncate mb-1 group-hover:underline decoration-2 underline-offset-4">
          {hackathon.title}
        </h3>
        <p className="text-sm text-[#525252] dark:text-[#A8A6A0] line-clamp-1 mb-2 leading-relaxed">
          {hackathon.description}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatRange(hackathon.startDate)} - {formatRange(hackathon.endDate)}
          </span>
          {hackathon.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {hackathon.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {hackathon.minTeamSize}-{hackathon.maxTeamSize} <I18nText k="hackathon.people" default="人" />
          </span>
          {(hackathon.status === 'upcoming' || hackathon.status === 'active') && (
            <CountdownChip
              deadline={countdownTarget}
              prefix={countdownPrefix}
              className="ml-1"
            />
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="col-span-1 flex items-center justify-end">
        <ArrowUpRight className="w-5 h-5 text-[#525252] dark:text-[#A8A6A0] group-hover:text-[#171717] dark:group-hover:text-[#F5F4F0] group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
      </div>
    </Link>
  );
}
