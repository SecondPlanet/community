/**
 * PageHeader — 子页面顶部统一头部
 *
 * 设计约定:
 *   - 左侧:back 按钮 + 图标 + 标题 + 副信息(meta)
 *   - 右侧:可选 actions
 *
 * 使用场景:每个 dashboard 子页面(orders / certificates / notifications /
 *          degree detail / etc)原本都各自粘贴这一段。
 *
 * 收益:
 *   - back 按钮走 IconButton,保证 44x44 触摸目标
 *   - 标题排版统一(不再每页稍微不一样)
 *   - meta / actions 灵活,留给业务传
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface PageHeaderProps {
  /** 返回链接,默认跳 /profile */
  backHref?: string;
  /** 标题左侧图标(可选),brutalist 黑 */
  icon?: ReactNode;
  /** 标题文字 */
  title: ReactNode;
  /** 标题右侧副信息(meta)— 比如 "共 12 笔" */
  meta?: ReactNode;
  /** 头部右侧 actions */
  actions?: ReactNode;
  /** 容器附加 className */
  className?: string;
}

export function PageHeader({
  backHref = '/profile',
  icon,
  title,
  meta,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex items-center gap-3 mb-6', className)}>
      <Link
        to={backHref}
        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors"
        aria-label="返回上一页"
      >
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {icon}
        <h1 className="text-2xl font-bold truncate">{title}</h1>
        {meta && (
          <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-600 whitespace-nowrap">
            {meta}
          </span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
