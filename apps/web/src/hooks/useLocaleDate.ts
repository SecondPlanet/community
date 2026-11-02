/**
 * useLocaleDate / useLocaleNumber — locale-aware 格式化 hook (P2-1)
 *
 * 用途:把 toLocaleString() / toLocaleDateString() 这类散落在组件里的
 *       locale 推断统一到 useI18n().locale,避免 zh-CN 写死.
 *
 * 返回:
 *   - locale: 当前 locale (e.g. 'zh-CN' / 'en-US')
 *   - formatDate(date, opts?)  →  '2026-07-15'
 *   - formatDateTime(date, opts?) → '2026-07-15 14:30:00'
 *   - formatNumber(n, opts?)   →  '1,234'
 *   - formatCurrency(n, currency, opts?) → '¥1,234.00'
 *
 * 用法:
 *   const { formatDate, formatNumber, locale } = useLocaleDate();
 *   <span>{formatDate(user.createdAt)}</span>
 *   <span>{formatNumber(stats.users)}</span>
 *
 * 安全:null / undefined 输入 → 原样返回 '—' 占位.
 */
import { useI18n } from '../lib/cms';

export interface UseLocaleDateResult {
  locale: string;
  formatDate: (input?: string | number | Date | null, opts?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (input?: string | number | Date | null, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (input?: number | null, opts?: Intl.NumberFormatOptions) => string;
  formatCurrency: (
    input?: number | null,
    currency?: string,
    opts?: Intl.NumberFormatOptions,
  ) => string;
}

const EMPTY = '—';

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function useLocaleDate(): UseLocaleDateResult {
  const { locale } = useI18n();

  return {
    locale,
    formatDate(input, opts) {
      const d = toDate(input);
      if (!d) return EMPTY;
      return d.toLocaleDateString(locale, opts ?? { year: 'numeric', month: '2-digit', day: '2-digit' });
    },
    formatDateTime(input, opts) {
      const d = toDate(input);
      if (!d) return EMPTY;
      return d.toLocaleString(locale, opts);
    },
    formatNumber(input, opts) {
      if (input == null || Number.isNaN(input)) return EMPTY;
      return input.toLocaleString(locale, opts);
    },
    formatCurrency(input, currency = 'CNY', opts) {
      if (input == null || Number.isNaN(input)) return EMPTY;
      return input.toLocaleString(locale, {
        style: 'currency',
        currency,
        ...opts,
      });
    },
  };
}
