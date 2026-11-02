/**
 * IconButton — 仅图标按钮
 *
 * 设计约定:
 *   - iOS HIG:触摸目标 ≥44x44,默认 min-h/min-w = 44
 *   - 主色:#171717 (brutalist 黑) / hover #262626
 *   - variant:default / primary / danger,默认 default(中性 hover)
 *
 * 使用场景:
 *   - Layout 顶部的主题切换/搜索/通知/菜单按钮
 *   - DashboardLayout 顶部铃铛/订单/设置按钮
 *   - 各 dashboard 子页面的 back 按钮
 *
 * 之前 14+ 处重复粘贴:
 *   p-2 min-h-[44px] min-w-[44px] flex items-center justify-center
 *   rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-100 ...
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type IconButtonVariant = 'default' | 'primary' | 'danger';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  children: ReactNode;
}

const baseClass =
  'inline-flex items-center justify-center rounded-md ' +
  'transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171717] focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-neutral-0 dark:focus-visible:ring-offset-neutral-950 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const variantClass: Record<IconButtonVariant, string> = {
  default:
    'text-neutral-900 dark:text-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-100',
  primary:
    'bg-[#171717] text-white hover:bg-[#262626] active:bg-[#171717]',
  danger:
    'text-danger-500 hover:bg-danger-100',
};

const sizeClass: Record<IconButtonSize, string> = {
  // 关键 — iOS HIG 触摸目标
  sm: 'h-10 w-10 min-h-[44px] min-w-[44px]',
  md: 'h-12 w-12 min-h-[48px] min-w-[48px]',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { variant = 'default', size = 'sm', type = 'button', className, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(baseClass, variantClass[variant], sizeClass[size], className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
