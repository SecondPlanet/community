/**
 * I18nText — i18n 渲染组件 (P2-1)
 *
 * 用途:替代组件里 `<>{'中文'}</>` 硬编码,统一走 useI18n().
 * props:
 *   - k:        i18n key (i18n_messages 表)
 *   - default:  中文 fallback (即使后端没数据也不白屏)
 *   - args:     插值 map,支持 {name}/{count} 占位
 *   - as:       包裹元素 (默认 span, 也可改 'div' / 'h1' 等)
 *   - className / style / children 透传
 *
 * fallback 顺序 (跟 useI18n().t 一致):
 *   1) i18n_messages 真实翻译
 *   2) default prop
 *   3) key 本身（便于发现缺失配置）
 *   4) key 本身 (调试可见)
 *
 * 用法:
 *   <I18nText k="admin.users.title" default="用户管理" />
 *   <I18nText k="admin.users.count" default="共 {count} 人" args={{ count: 10 }} />
 *   <I18nText k="admin.users.heading" default="用户管理" as="h2" className="text-3xl" />
 */
import type { CSSProperties, ReactNode, ElementType } from 'react';
import { useI18n } from '../lib/cms';

type AsTag = 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'label' | 'small';

export interface I18nTextProps {
  /** i18n key (e.g. 'admin.users.title') */
  k: string;
  /** 中文 fallback — 后端没数据 / 网络错误时使用 */
  default?: string;
  /** 插值 map, e.g. { count: 10 } 替换模板中的 {count} */
  args?: Record<string, string | number>;
  /** 包裹元素,默认 span */
  as?: AsTag;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** 简单 {name} 模板替换 — 不引 i18next 依赖 */
function interpolate(template: string, args?: Record<string, string | number>): string {
  if (!args) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = args[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

export function I18nText({
  k,
  default: defaultText,
  args,
  as = 'span',
  className,
  style,
  children,
}: I18nTextProps) {
  const { t } = useI18n();
  const raw = t(k, defaultText);
  const text = interpolate(raw, args);
  const Tag: ElementType = as;
  return (
    <Tag className={className} style={style}>
      {text}
      {children}
    </Tag>
  );
}
