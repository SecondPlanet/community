/**
 * Skeleton — P0-4 基础组件
 *
 * variant:
 *   - text:        多行文本占位(默认 1 行,可 count 调多)
 *   - circle:      圆形(头像 / 头像组)
 *   - rectangle:   矩形(卡片 / 缩略图)
 *
 * 用法:
 *   <Skeleton variant="text" count={3} />
 *   <Skeleton variant="circle" className="h-10 w-10" />
 *   <Skeleton variant="rectangle" className="h-32 w-full" />
 *
 * 设计系统约定:
 *   - 底色用 neutral-200(token)
 *   - 自带 pulse 动画(纯 Tailwind 自带 animate-pulse,不引新动画)
 */
import { cn } from '../../lib/cn';

export type SkeletonVariant = 'text' | 'circle' | 'rectangle';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
}

const baseClass = 'animate-pulse bg-neutral-200 dark:bg-neutral-200';

const variantClass: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded-md',
  circle: 'rounded-full',
  rectangle: 'rounded-md',
};

export function Skeleton({ variant = 'text', count = 1, className }: SkeletonProps) {
  if (variant === 'text' && count > 1) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(
              baseClass,
              variantClass.text,
              // 末行稍短,模拟真实文本
              i === count - 1 && 'w-3/4',
              className,
            )}
          />
        ))}
      </div>
    );
  }
  return <div className={cn(baseClass, variantClass[variant], className)} />;
}
