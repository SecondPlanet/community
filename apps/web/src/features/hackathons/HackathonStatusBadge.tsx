import type { HackathonStatus } from '@secondplanet/shared-types';
import { useEnum } from '../../lib/cms';

// Fallback(API 失败时) —— 跟 review/cms-audit-labels.md §3 hackathon_status 当前值一致
// 白底徽章在暗色模式下保持白底 + 深色文字(brutalist 白块),不翻转文字色。
const FALLBACK_STYLE: Record<HackathonStatus, string> = {
  upcoming: 'bg-[#171717] text-white border-[#171717] dark:border-[#3a3a38]',
  active: 'bg-white text-[#171717] border-[#171717] dark:border-[#3a3a38]',
  judging: 'bg-[#171717] text-white border-[#171717] dark:border-[#3a3a38]',
  finished: 'bg-white text-[#525252] border-[#525252]',
  cancelled: 'bg-white text-[#171717] border-[#171717] dark:border-[#3a3a38] line-through',
};

interface HackathonStatusBadgeProps {
  status: HackathonStatus;
  className?: string;
}

export function HackathonStatusBadge({ status, className = '' }: HackathonStatusBadgeProps) {
  const { getLabel, getColor } = useEnum('hackathon_status');
  const apiColor = getColor(status);
  // 优先 API colorClass(可能有 dark mode),fallback 走原 brutalist 硬编码
  const styleClass = apiColor ?? FALLBACK_STYLE[status];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border ${styleClass} ${className}`}
    >
      {getLabel(status)}
    </span>
  );
}
