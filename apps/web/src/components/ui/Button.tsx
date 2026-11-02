/**
 * Button — P0-4 基础组件
 *
 * variant: primary(brutalist 黑底) / secondary(中性描边) / ghost(纯文字) / danger
 * size: sm / md / lg
 * 支持 leftIcon / rightIcon / isLoading / disabled
 *
 * 设计系统约定:
 *   - 调色板走 brutalist 黑白:#171717 主色 / #262626 hover / #EEEDE9 软底
 *   - 不允许的字体:spec §2.4 — 不上 font-weight 300 / 800+
 *   - 不硬编码中性色:走 neutral-* token(0/100/200/600/900/950)
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const baseClass =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md ' +
  'transition-all duration-150 select-none whitespace-nowrap ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171717] focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-neutral-0 dark:focus-visible:ring-offset-neutral-950 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const variantClass: Record<ButtonVariant, string> = {
  // 主 CTA:brutalist 黑底,hover 提亮到 #262626(spec §2.5 不再允许彩色阴影)
  primary:
    'bg-[#171717] text-white hover:bg-[#262626] active:bg-[#171717]',
  // 中性描边:浅底 + 暗字
  secondary:
    'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 ' +
    'border border-transparent ' +
    'dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200',
  // ghost:无底,hover 才有底
  ghost:
    'bg-transparent text-neutral-900 hover:bg-neutral-100 ' +
    'dark:text-neutral-900 dark:hover:bg-neutral-100',
  // danger
  danger:
    'bg-danger-500 text-white hover:bg-danger-500/90 active:bg-danger-500/80 ' +
    'shadow-sm',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'fullWidth' | 'className'> = {}) {
  return cn(
    baseClass,
    variantClass[variant],
    sizeClass[size],
    fullWidth && 'w-full',
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    isLoading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...rest}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
});
