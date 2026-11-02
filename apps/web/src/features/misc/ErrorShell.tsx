/**
 * ErrorShell — 4 个错误页的共用底层 (404 / 403 / 500 / network)
 *
 * 设计:
 *   - 跟现有 NotFoundPage 同款黑底硬核风 (#171717 边框 + 卡片式 hero)
 *   - 顶部一个超大错误码 (大写 / tracking-tighter / font-black)
 *   - eyebrow 小标 (e.g. "/ 404" / "/ 403") + 主标题 + 副描述
 *   - actions 槽 (主 CTA + 次 CTA 按钮组)
 *   - footer 槽 (e.g. 推荐课程 / 联系客服)
 *   - 全局 bg #F5F4F0 跟 HomePage / NotFoundPage 一致
 *
 * 用法 (e.g. ForbiddenPage):
 *   <ErrorShell
 *     eyebrow="/ 403"
 *     code="403"
 *     title={<>Forbidden</>}
 *     description={<>你没有访问该资源的权限</>}
 *     actions={<>
 *       <ButtonLink to="/">Back to Home</ButtonLink>
 *       <ButtonLink to="/auth/login">Switch Account</ButtonLink>
 *     </>}
 *   />
 *
 * 国际化:
 *   - 标题 / 描述文案走 I18nText，以 i18n_messages 表为权威来源
 *   - 不引 useTranslation 库,跟项目其他页保持一致
 */
import type { ReactNode } from 'react';

export interface ErrorShellProps {
  /** 错误码标识 (顶部 eyebrow, e.g. "/ 404" "/ 403" "/ 500" "/ OFFLINE") */
  eyebrow: string;
  /** 超大数字,居中显示,装饰性 */
  code: string;
  /** 主标题,可塞 I18nText */
  title: ReactNode;
  /** 副描述 */
  description: ReactNode;
  /** 主次按钮组 */
  actions?: ReactNode;
  /** 推荐区 / 联系客服等附加内容 */
  footer?: ReactNode;
  /** 自定义 className 用于定位 (e.g. min-h-screen vs min-h-[80vh]) */
  className?: string;
}

export function ErrorShell({
  eyebrow,
  code,
  title,
  description,
  actions,
  footer,
  className = 'min-h-[80vh]',
}: ErrorShellProps) {
  return (
    <div className={`flex items-center justify-center bg-[#F5F4F0] text-[#171717] px-6 ${className}`}>
      <div className="max-w-3xl w-full">
        <div className="border-2 border-[#171717] bg-white">
          {/* Hero — 黑底 + 大数字 + eyebrow */}
          <div className="bg-[#171717] text-white p-8 md:p-12">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-3">
              {eyebrow}
            </div>
            <div
              className="text-[8rem] md:text-[12rem] font-black tracking-tighter leading-none"
              aria-hidden="true"
            >
              {code}
            </div>
          </div>
          {/* Body — 标题 + 描述 + actions */}
          <div className="p-8 md:p-12">
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase leading-none mb-4">
              {title}
            </h1>
            <div className="text-[#666666] mb-8 leading-relaxed max-w-md">
              {description}
            </div>
            {actions && (
              <div className="flex flex-col sm:flex-row gap-3">{actions}</div>
            )}
            {footer && <div className="mt-10 pt-8 border-t border-[#171717]/10">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ActionButton — ErrorShell 用的统一 CTA 按钮 (主/次样式)
 *
 * 比 NotFoundPage 原始手写 `<a>` 多:
 *   - variant: 'primary' (黑底白字) | 'secondary' (白底黑边)
 *   - type="button" 防 form 提交冒泡
 *   - aria-label 支持
 */
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

type ActionButtonProps = {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  /** 跟 children 一起显示的右侧小图标,默认 ArrowUpRight */
  showIcon?: boolean;
  ariaLabel?: string;
};

export function ActionButton({
  to,
  children,
  variant = 'primary',
  onClick,
  showIcon = true,
  ariaLabel,
}: ActionButtonProps) {
  const base =
    'inline-flex items-center justify-between gap-6 px-6 py-4 font-black uppercase tracking-wider text-sm transition-colors min-h-[48px]';
  const styles =
    variant === 'primary'
      ? 'bg-[#171717] text-white hover:bg-[#262626]'
      : 'border border-[#171717] text-[#171717] hover:bg-[#EEEDE9]';

  return (
    <Link
      to={to}
      onClick={onClick}
      type="button"
      aria-label={ariaLabel}
      className={`${base} ${styles}`}
    >
      <span className="flex items-center gap-2">{children}</span>
      {showIcon && <ArrowUpRight className="w-4 h-4" aria-hidden="true" />}
    </Link>
  );
}
