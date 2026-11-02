/**
 * Card — P0-4 基础组件
 *
 * variant: default(纯白底) / elevated(带 shadow-md) / outlined(描边)
 * padding: sm / md / lg
 * hoverable:可选,hover 时提升到 shadow-md
 *
 * 设计系统约定:
 *   - 默认 shadow-sm(spec §2.5:卡片默认 shadow-sm,hover 才升级到 shadow-md)
 *   - 圆角 rounded-xl(spec §2.5:卡片 rounded-xl)
 *   - 暗色卡片底 = --neutral-100
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type CardVariant = 'default' | 'elevated' | 'outlined';
export type CardPadding = 'sm' | 'md' | 'lg' | 'none';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  hoverable?: boolean;
  children?: ReactNode;
}

const variantClass: Record<CardVariant, string> = {
  default:
    'bg-neutral-0 dark:bg-neutral-100 shadow-sm border border-neutral-200',
  elevated:
    'bg-neutral-0 dark:bg-neutral-100 shadow-md border border-transparent',
  outlined:
    'bg-neutral-0 dark:bg-neutral-100 border border-neutral-200',
};

const paddingClass: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', padding = 'md', hoverable = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl transition-shadow',
        variantClass[variant],
        paddingClass[padding],
        hoverable && 'hover:shadow-md cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
