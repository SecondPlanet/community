/**
 * CMS read hooks.
 *
 * Business content comes from the API/database. This module deliberately does
 * not carry a second, frontend-owned copy of CMS rows: missing values fall
 * back only to an explicit UI string supplied by the caller (or the key itself).
 */
import { useQuery } from '@tanstack/react-query';
import {
  getEnumTranslations,
  getI18nMessages,
  getList,
  getPageSettings,
  getSiteSettings,
  type EnumTranslationItem,
  type ListResource,
} from './cmsApi';

/**
 * 站点级 CMS 配置。
 *
 * 历史包袱:早期实现有 keys 过滤参数,但实际后端 API 一次返回全部站点配置,
 * keys 仅作为 cache key 提示被忽略。当前实现要么传 keys(为了跟旧调用点
 * 兼容),要么传空数组,二者 queryFn 完全相同 — 因此 cache key 永远是
 * ['cms', 'site-settings'],不会因为 keys 不同而重复缓存。
 */
export function useSiteSettings(_keys: string[] = []) {
  return useQuery({
    queryKey: ['cms', 'site-settings'],
    queryFn: () => getSiteSettings([]),
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

/**
 * 页面级 CMS 配置 — 同 useSiteSettings 注释。
 */
export function usePageSettings(page: string, _keys: string[] = []) {
  return useQuery({
    queryKey: ['cms', 'page-settings', page],
    queryFn: () => getPageSettings(page),
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

export function useList<T = unknown>(resource: ListResource) {
  return useQuery<T[]>({
    queryKey: ['cms', 'list', resource],
    queryFn: () => getList<T>(resource),
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

export interface EnumItem {
  value: string;
  label: string;
  colorClass?: string;
  icon?: string;
  sortOrder?: number;
}

export function useEnum(enumType: string, locale: string = 'zh-CN') {
  const query = useQuery<EnumTranslationItem[]>({
    queryKey: ['cms', 'enum', enumType, locale],
    queryFn: () => getEnumTranslations(enumType, locale),
    staleTime: 5 * 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });
  const items = query.data ?? [];
  const byValue = new Map(items.map((item) => [item.value, item]));

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    getLabel: (value: string): string => byValue.get(value)?.label ?? value,
    getColor: (value: string): string | undefined => byValue.get(value)?.colorClass,
    getIcon: (value: string): string | undefined => byValue.get(value)?.icon,
  };
}

export function useI18n(locale: string = 'zh-CN') {
  const query = useQuery<Record<string, string>>({
    queryKey: ['cms', 'i18n-messages', locale],
    queryFn: () => getI18nMessages(locale),
    staleTime: 10 * 60_000,
    retry: 2,
  });

  return {
    locale,
    isError: query.isError,
    error: query.error,
    t: (key: string, uiFallback?: string) => query.data?.[key] ?? uiFallback ?? key,
  };
}

export function createT(map: Record<string, string> | undefined) {
  return (key: string, uiFallback?: string) => map?.[key] ?? uiFallback ?? key;
}

export function pickLocalized(value: unknown, locale: string = 'zh-CN', fallback?: string): string {
  if (value == null) return fallback ?? '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const localized = value as Record<string, unknown>;
    const candidates = [localized[locale], localized['zh-CN'], localized['en-US']];
    const hit = candidates.find((candidate) => typeof candidate === 'string');
    if (typeof hit === 'string') return hit;
  }
  return fallback ?? '';
}

export function pickPage(
  data: Record<string, unknown> | undefined,
  key: string,
  locale: string = 'zh-CN',
  uiFallback?: string,
): string {
  const value = data?.[key];
  return value == null ? (uiFallback ?? '') : pickLocalized(value, locale, uiFallback);
}

export function pickSite(
  data: Record<string, unknown> | undefined,
  key: string,
  locale: string = 'zh-CN',
  uiFallback?: string,
): string {
  const value = data?.[key];
  return value == null ? (uiFallback ?? '') : pickLocalized(value, locale, uiFallback);
}

/** Allow only safe internal, web, anchor, email and phone navigation targets. */
export function safeNavPath(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0) return '#';
  const value = path.trim();
  if (value.startsWith('//')) return '#';
  if (value.startsWith('/')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('#')) return value;
  if (/^(mailto|tel):/i.test(value)) return value;
  return '#';
}
