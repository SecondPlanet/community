/**
 * zodResolver — 不用 @hookform/resolvers,自己写
 *
 * 原因:package.json 没列 @hookform/resolvers,任务约束 "不要装新 npm 依赖"
 *
 * 用法:
 *   const form = useForm({ resolver: zodResolver(mySchema) });
 *
 * 行为:跟 @hookform/resolvers/zod 等价 — 调 schema.safeParse(values),
 *      把 success=false 的 issues 转成 react-hook-form 的 errors 形状
 */
import type { Resolver } from 'react-hook-form';
import type { ZodTypeAny, infer as zInfer } from 'zod';

export function zodResolver<T extends ZodTypeAny>(
  schema: T,
): Resolver<zInfer<T>> {
  return async (values) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return {
        values: result.data as zInfer<T>,
        errors: {},
      };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (!path) continue;
      if (!errors[path]) {
        errors[path] = { type: issue.code, message: issue.message };
      }
    }
    return {
      values: {} as zInfer<T>,
      errors: errors as never,
    };
  };
}
