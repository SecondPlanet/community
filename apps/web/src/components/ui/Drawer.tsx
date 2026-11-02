/**
 * Drawer — 右侧滑出抽屉
 *
 * 用途:admin 详情面板 / 移动端筛选 / 任何 "secondary content" 场景
 *
 * 设计:
 *   - 右侧 480px 宽(< sm 全屏 100vw)
 *   - 遮罩点关 / X 按钮 / ESC 键
 *   - 走设计系统 token,dark mode 适配
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - 打开时禁止 body 滚动(防背景跟滑)
 *
 * 用法:
 *   const [open, setOpen] = useState(false);
 *   <Drawer open={open} onClose={() => setOpen(false)} title="用户详情">
 *     {content}
 *   </Drawer>
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useDialogFocus } from './useDialogFocus';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** 右侧额外按钮(常放"保存""编辑"等) */
  actions?: ReactNode;
  children: ReactNode;
  /** 抽屉宽度,默认 480px */
  width?: number;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  actions,
  children,
  width = 480,
  className,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(drawerRef, { open, onClose });

  useEffect(() => {
    if (!open) return;
    // 禁止 body 滚动
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="flex-1 bg-neutral-900/50 dark:bg-neutral-950/70 backdrop-blur-sm animate-in fade-in"
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : '侧边面板'}
        tabIndex={-1}
        className={cn(
          'relative bg-neutral-0 dark:bg-neutral-100 border-l border-neutral-200 shadow-2xl',
          'flex flex-col h-full overflow-hidden',
          'animate-in slide-in-from-right duration-200',
          className,
        )}
        style={{ width: `${width}px`, maxWidth: '100vw' }}
      >
        {(title || actions) && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-200">
            <div id={titleId} className="flex-1 min-w-0 text-base font-bold truncate">
              {title}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            <button
              data-autofocus
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="p-1.5 rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
