/**
 * CountdownChip — 实时倒计时 chip
 *
 * 解决痛点:之前黑客松卡片无倒计时,USER_MANUAL §7.1 承诺 "报名截止倒计时(仅 upcoming 状态)"
 * 实际全仓 0 setInterval / countdown 实现。
 *
 * 用法:
 *   <CountdownChip deadline={hackathon.registerDeadline} prefix="报名截止" />
 *   <CountdownChip target={hackathon.startDate} prefix="距开赛" />
 *
 * 行为:
 *   - deadline 过了自动隐藏(已截止/已开赛)
 *   - 每 1 秒刷新
 *   - 显示格式:剩 X 天 X 时 X 分 X 秒(超过 1 天显示天,1 天内只显示时分秒)
 *   - 走 token,dark mode 适配
 *   - 用 <time> 元素 + dateTime 属性,语义化
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface CountdownChipProps {
  /** 倒计时目标,可以是 ISO string 或 Date */
  deadline?: string | Date | null;
  target?: string | Date | null;
  /** 前缀文案,如 "报名截止"、"距开赛" */
  prefix?: string;
  /** 时间到时的回调(可选) */
  onExpire?: () => void;
  className?: string;
  /** 紧凑模式(无图标,适合 card 内嵌) */
  compact?: boolean;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calcTimeLeft(target: Date): TimeLeft {
  const total = Math.max(0, target.getTime() - Date.now());
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

function formatTimeLeft(t: TimeLeft): string {
  if (t.days > 0) {
    return `${t.days} 天 ${t.hours} 时 ${t.minutes} 分`;
  }
  if (t.hours > 0) {
    return `${t.hours} 时 ${t.minutes} 分 ${t.seconds} 秒`;
  }
  if (t.minutes > 0) {
    return `${t.minutes} 分 ${t.seconds} 秒`;
  }
  return `${t.seconds} 秒`;
}

export function CountdownChip({
  deadline,
  target,
  prefix = '倒计时',
  onExpire,
  className,
  compact = false,
}: CountdownChipProps) {
  // Hooks 必须在 early-return 之前调用 (React 规则), 这里全部前置。
  const rawDate = deadline ?? target ?? null;
  // targetDate 用 useMemo 稳定引用, 避免父组件重渲染时 new Date 触发 effect 重跑
  const targetDate = useMemo(() => {
    if (!rawDate) return null;
    const d = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
    return Number.isNaN(d.getTime()) ? null : d;
  }, [rawDate]);
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!targetDate) return;
    const end = targetDate.getTime();

    if (end <= Date.now()) {
      // 已过期: 只回调一次 (ref 比较, 避免每次渲染重复触发)
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
      return;
    }

    // 目标变了 (比如换成新的截止时间), 重置过期标记
    expiredRef.current = false;

    const tick = () => {
      setNow(Date.now());
      if (end <= Date.now() && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return null;

  // 重新计算用 now 触发 re-render
  const t = calcTimeLeft(targetDate);
  if (t.total <= 0) return null;
  void now;

  return (
    <time
      dateTime={targetDate.toISOString()}
      className={
        'inline-flex items-center gap-1.5 font-mono tabular-nums text-xs ' +
        (compact
          ? 'text-warning-500'
          : 'text-warning-500 bg-warning-100 dark:bg-warning-500/20 px-2 py-1 rounded-md') +
        (className ? ' ' + className : '')
      }
      aria-label={`${prefix} ${formatTimeLeft(t)}`}
    >
      <Clock className="w-3 h-3" aria-hidden="true" />
      {prefix && !compact && <span className="font-sans">{prefix}</span>}
      <span>{formatTimeLeft(t)}</span>
    </time>
  );
}
