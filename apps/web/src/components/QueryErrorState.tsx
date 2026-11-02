/**
 * QueryErrorState — react-query 错误态友好兜底
 *
 * 解决痛点:之前多个 useQuery 缺 isError 分支,4xx/5xx 时 data 持续 undefined,
 * 用户要么卡在永久 Skeleton,要么跳到"未找到" EmptyState,分不清"没数据"和"挂了"
 *
 * 用法:
 *   const { data, isLoading, isError, error, refetch } = useQuery(...)
 *
 *   if (isLoading) return <Skeleton ... />
 *   if (isError) return <QueryErrorState error={error} onRetry={refetch} />
 *   if (!data?.length) return <EmptyState ... />
 *
 * 设计:
 *   - 走设计系统 token,dark mode 自动适配
 *   - 错误信息分用户友好(网络/服务)+ 调试(开发模式显示原 message)
 *   - retry 调 refetch,queryClient 默认会 refetch on remount
 *   - ARIA role="alert" 让屏幕阅读器立即播报
 */
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './ui/Button';

interface QueryErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
  /** 自定义标题(默认「加载失败」) */
  title?: string;
  /** 自定义描述(默认根据 status code 给建议) */
  description?: string;
  className?: string;
}

function getErrorMessage(err: unknown): { title: string; description: string } {
  // axios error 通常 .response.status;fetch error 是 TypeError
  const status = (err as any)?.response?.status;
  const message = (err as any)?.message ?? '';

  if (status === 401) {
    return {
      title: '需要登录',
      description: '会话已过期,请重新登录后再试。',
    };
  }
  if (status === 403) {
    return {
      title: '没有权限',
      description: '你没有访问该资源的权限。',
    };
  }
  if (status === 404) {
    return {
      title: '资源不存在',
      description: '请求的内容已被删除或链接已失效。',
    };
  }
  if (status === 429) {
    return {
      title: '请求太频繁',
      description: '请稍等 1 分钟再试。',
    };
  }
  if (status >= 500) {
    return {
      title: '服务暂不可用',
      description: '后端开了小差,请稍后重试。',
    };
  }
  if (message?.includes('Network Error') || message?.includes('Failed to fetch')) {
    return {
      title: '网络异常',
      description: '请检查网络连接,稍后重试。',
    };
  }
  return {
    title: '加载失败',
    description: '请求出了点问题,请重试。',
  };
}

export function QueryErrorState({
  error,
  onRetry,
  title,
  description,
  className,
}: QueryErrorStateProps) {
  const msg = getErrorMessage(error);
  const isDev = import.meta.env.DEV;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={
        'flex flex-col items-center justify-center text-center py-16 px-4 ' +
        (className ?? '')
      }
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-danger-100 dark:bg-danger-500/20 text-danger-500 mb-4">
        <AlertTriangle className="w-6 h-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mb-1">
        {title ?? msg.title}
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-600 mb-4 max-w-sm">
        {description ?? msg.description}
      </p>
      {isDev && error && (
        <details className="mb-4 text-left max-w-md max-h-32 overflow-auto">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700 select-none">
            调试信息(开发模式)
          </summary>
          <pre className="mt-2 p-3 text-xs bg-neutral-100 dark:bg-neutral-200 text-neutral-700 dark:text-neutral-700 rounded-md overflow-auto max-w-md max-h-24 border border-neutral-200 font-mono">
            {String((error as any)?.response?.data?.message ?? (error as any)?.message ?? '未知错误')}
          </pre>
        </details>
      )}
      {onRetry && (
        <Button variant="secondary" size="md" onClick={onRetry} leftIcon={<RotateCcw className="w-4 h-4" />}>
          重试
        </Button>
      )}
    </div>
  );
}
