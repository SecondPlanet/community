/**
 * ApiError — 统一的 API 错误类型
 *
 * 跟 axios error 配合使用:BindingsPage / auth 页面 catch 时 instanceof ApiError
 *
 * 用法:
 *   try { await api.post(...) } catch (err) {
 *     if (err instanceof ApiError) showToast(err.message, 'error');
 *   }
 */
import type { AxiosError } from 'axios';

/**
 * 后端 AllExceptionsFilter 错误响应通常为:
 *   { statusCode, message, timestamp, code? }
 * 其中 message 可能是 string 或 string[]。
 */
type MaybeErrorPayload = { message?: string | string[] } | undefined;

/**
 * 从 Axios 错误 / ApiError / 普通 Error 中提取面向用户的中文错误文案。
 *
 * 优先级:
 *   1. err.response.data.message (string | string[])
 *   2. err.message
 *   3. fallbackMessage
 *
 * 之前在 useApiMutation / LoginPage / RegisterPage / BindingsPage 等 5+ 处
 * 各有一份相同实现的私有拷贝,这里统一收敛。
 */
export function extractErrorMessage(
  err: unknown,
  fallbackMessage = '操作失败',
): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: MaybeErrorPayload } })?.response?.data;
    const message = data?.message;
    if (Array.isArray(message)) {
      const joined = message.filter(Boolean).join('; ');
      if (joined) return joined;
    } else if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallbackMessage;
}

/**
 * 安全地从任意错误对象取出 HTTP 状态码 (UX-AUDIT-2026-09-11 C-24)。
 * 之前各页面用 `as { response?: { status?: number } }` 直接断言,axios 错误
 * shape 变了就会拿到 undefined → 静默走错分支。这里集中收敛。
 */
export function getHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const response = (err as { response?: { status?: unknown } }).response;
  const status = response?.status;
  return typeof status === 'number' ? status : undefined;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(opts: {
    message: string;
    status: number;
    code?: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }

  static fromAxios(err: unknown, fallbackMessage = '网络错误'): ApiError {
    const ax = err as AxiosError<{ message?: string; code?: string }> | undefined;
    if (ax?.response) {
      return new ApiError({
        message: ax.response.data?.message ?? ax.message ?? fallbackMessage,
        status: ax.response.status,
        code: ax.response.data?.code,
        details: ax.response.data,
      });
    }
    if (ax?.message) {
      return new ApiError({ message: ax.message, status: 0 });
    }
    return new ApiError({
      message: err instanceof Error ? err.message : fallbackMessage,
      status: 0,
    });
  }
}
