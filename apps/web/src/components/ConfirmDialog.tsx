/**
 * ConfirmDialog — 危险操作二次确认弹层
 *
 * 解决痛点:之前多处 onClick 直接触发 mutation(取消订单/退款/解绑/删除),
 * 用户误点 / 连点无任何阻拦,操作不可逆。
 *
 * 用法 (受控):
 *   const [open, setOpen] = useState(false);
 *   <Button onClick={() => setOpen(true)}>取消订单</Button>
 *   <ConfirmDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onConfirm={async () => { await cancelMutation.mutateAsync(id); }}
 *     title="确认取消订单?"
 *     description="取消后无法恢复,需要重新创建订单"
 *     variant="danger"
 *     confirmText="确认取消"
 *   />
 *
 * 设计:
 *   - 受控(open + onClose),跟 useState 配合
 *   - variant: danger(红)/warning(黄)/info(蓝),决定图标 + 按钮色
 *   - onConfirm 异步,自动 loading 锁 + 完成后关闭
 *   - ESC 键 + 点遮罩 + 取消按钮都能关
 *   - 走设计系统 token,dark mode 适配
 *   - role="alertdialog" 让屏幕阅读器立即播报
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { Button } from './ui/Button';
import { useDialogFocus } from './ui/useDialogFocus';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  variant?: ConfirmVariant;
  confirmText?: string;
  cancelText?: string;
}

const VARIANT_ICON: Record<ConfirmVariant, ReactNode> = {
  danger: <AlertTriangle className="w-6 h-6" aria-hidden="true" />,
  warning: <AlertCircle className="w-6 h-6" aria-hidden="true" />,
  info: <Info className="w-6 h-6" aria-hidden="true" />,
};

const VARIANT_ICON_BG: Record<ConfirmVariant, string> = {
  danger: 'bg-danger-100 dark:bg-danger-500/20 text-danger-500',
  warning: 'bg-warning-100 dark:bg-warning-500/20 text-warning-500',
  info: 'bg-info-100 dark:bg-info-500/20 text-info-500',
};

const VARIANT_BUTTON: Record<ConfirmVariant, 'danger' | 'primary' | 'secondary'> = {
  danger: 'danger',
  warning: 'primary',
  info: 'primary',
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  variant = 'danger',
  confirmText = '确认',
  cancelText = '取消',
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useDialogFocus(dialogRef, { open, onClose, disableEscape: isLoading });

  useEffect(() => {
    if (!open) return;
    setIsLoading(false); // 每次重开 reset
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (isLoading) return; // 防双击
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // 业务错误由 mutation 自己处理(onError 弹 toast),这里不关闭
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="关闭"
        onClick={() => !isLoading && onClose()}
        className="absolute inset-0 bg-neutral-900/50 dark:bg-neutral-950/70 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative max-w-md w-full bg-neutral-0 dark:bg-neutral-100 border border-neutral-200 rounded-xl p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          aria-label="关闭"
          className="absolute top-3 right-3 p-1.5 rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-4">
          <div
            className={
              'shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full ' +
              VARIANT_ICON_BG[variant]
            }
          >
            {VARIANT_ICON[variant]}
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id={titleId}
              className="text-base font-bold text-neutral-900 dark:text-neutral-50 mb-1"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="text-sm text-neutral-600 dark:text-neutral-600"
              >
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
          <Button
            data-autofocus
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={VARIANT_BUTTON[variant]}
            size="md"
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
