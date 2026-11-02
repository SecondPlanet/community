/**
 * EmptyState — P0-4 基础组件
 *
 * 全站空态统一组件:icon + title + description + 可选 action
 * 用法:课程列表空 / 搜索无结果 / 通知列表空 等场景。
 *
 * 设计系统约定:
 *   - 居中布局
 *   - icon 容器:brutalist 调色板 — 亮色 bg-[#EEEDE9] / 暗色 bg-[#171717]/30,文字 #171717 / #EEEDE9
 *   - 文字走 token
 */
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        'rounded-xl bg-neutral-50 dark:bg-neutral-100',
        'border border-dashed border-neutral-200',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center mb-4',
            'bg-[#EEEDE9] text-[#171717]',
            'dark:bg-[#171717]/30 dark:text-[#EEEDE9]',
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-900">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-600 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
