/**
 * Toast — 简单的全局消息提示
 *
 * 用法:
 *   const { showToast } = useToast();
 *   showToast('登录成功', 'success');
 *   showToast('邮箱格式不对', 'error');
 *
 * Phase 1 实现:默认 success 5s / error 8s,调用方可按需覆盖 durationMs。
 * Phase 2+ 可换 sonner / react-hot-toast
 *
 * 设计依据 (UX-AUDIT-2026-09-11 §2 高频 Confusing): 旧版默认 3s 太短,
 * 用户还没读懂反馈就消失了;error 默认提到 8s 与 UX-AUDIT 中位反馈对齐,
 * success 5s 保留对成功提示的克制。已在 v1.9-alpha.1 调整。
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback<ToastContextValue['showToast']>(
    (message, variant = 'info', durationMs) => {
      // v1.9-alpha.1 (B-06): 默认按 variant 分桶,success 5s / error 8s / 其他 5s。
      // 调用方仍可显式传第 3 参覆盖。
      const effectiveDuration =
        typeof durationMs === 'number'
          ? durationMs
          : variant === 'error'
            ? 8000
            : 5000;
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, variant, durationMs: effectiveDuration }]);
      if (effectiveDuration > 0) {
        setTimeout(() => dismiss(id), effectiveDuration);
      }
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({ showToast, dismiss }),
    [showToast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5" />,
  error: <XCircle className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success:
    'border-success-500/30 bg-success-100 text-success-500 dark:bg-success-500/20',
  error:
    'border-danger-500/30 bg-danger-100 text-danger-500 dark:bg-danger-500/20',
  warning:
    'border-warning-500/30 bg-warning-100 text-warning-500 dark:bg-warning-500/20',
  info: 'border-info-500/30 bg-info-100 text-info-500 dark:bg-info-500/20',
};

function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[];
  dismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-96 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-3 p-3 pr-2 rounded-lg border shadow-md',
            'animate-in slide-in-from-right-5',
            VARIANT_CLASS[t.variant],
          )}
        >
          <span className="shrink-0 mt-0.5" aria-hidden="true">
            {VARIANT_ICON[t.variant]}
          </span>
          <p className="flex-1 text-sm font-medium leading-relaxed">
            {t.message}
          </p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
