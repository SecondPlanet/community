/**
 * useApiMutation — 统一错误处理的 useMutation 封装
 *
 * 自动 toast 错误 (从 axios 错误中提取后端 message), 简化 admin 页面 4 个 mutation 全无 onError 的问题。
 *
 * 用法:
 *   const createMutation = useApiMutation({
 *     mutationFn: (payload) => hackathonsApi.create(payload),
 *     successMessage: '已创建',
 *     invalidateKeys: [['admin-hackathons'], ['hackathons']],
 *     onSuccess: () => resetForm(),
 *   });
 */
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useToast } from '../components/auth/Toast';
import { extractErrorMessage } from '../lib/apiError';

interface UseApiMutationOptions<TData, TVariables, TContext>
  extends Omit<UseMutationOptions<TData, any, TVariables, TContext>, 'onSuccess' | 'onError'> {
  /** 成功后 toast, 传 null/false 禁用 */
  successMessage?: string | false | null;
  /** 失败时 toast, 默认启用 (用后端 message), 传 false 禁用 */
  errorMessage?: string | false;
  /** 成功后自动 invalidate 这些 query keys */
  invalidateKeys?: ReadonlyArray<ReadonlyArray<unknown>>;
  /** 透传给 onSuccess 的额外回调 */
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
  /**
   * v1.9-alpha.2 (batch-8 C-03): 失败时额外回调 (在默认 toast 之后调用,
   * 用于 CAS 409 / 业务级错误判断)。返回 true 表示已自行处理,
   * 不再 toast 默认错误信息。
   */
  onError?: (err: unknown) => boolean | void;
}

export function useApiMutation<
  TData = unknown,
  TVariables = void,
  TContext = unknown,
>(options: UseApiMutationOptions<TData, TVariables, TContext>) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const {
    successMessage,
    errorMessage = true,
    invalidateKeys = [],
    onSuccess: userOnSuccess,
    onError: userOnError,
    ...restOptions
  } = options;

  return useMutation<TData, any, TVariables, TContext>({
    ...restOptions,
    onSuccess: (data, variables, context) => {
      if (successMessage) {
        showToast(successMessage, 'success');
      }
      // 自动 invalidate
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
      // 用户自定义 onSuccess
      userOnSuccess?.(data, variables, context);
    },
    onError: (err) => {
      const handled = userOnError?.(err) === true;
      if (!handled && errorMessage !== false) {
        const msg = typeof errorMessage === 'string' ? errorMessage : extractErrorMessage(err);
        showToast(msg, 'error');
      }
    },
  });
}
