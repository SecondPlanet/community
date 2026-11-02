import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { buttonClassName } from '../../components/ui/Button';

export interface AiCourseCapability {
  enabled: boolean;
}

export const aiCourseCapabilityKeys = {
  all: ['ai-personal-courses', 'capabilities'] as const,
};

export function filterAiCourseNavigation<T extends { path: string }>(items: T[], enabled: boolean): T[] {
  if (enabled) return items;
  return items.filter((item) => item.path !== '/ai-courses' && !item.path.startsWith('/ai-courses/'));
}

export async function getAiCourseCapability(): Promise<AiCourseCapability> {
  const { data } = await api.get<AiCourseCapability>('/api/v1/ai-personal-courses/capabilities');
  return data;
}

export function useAiCourseCapability() {
  return useQuery({
    queryKey: aiCourseCapabilityKeys.all,
    queryFn: getAiCourseCapability,
    staleTime: 30_000,
    retry: 1,
  });
}

/**
 * Fail closed: route content is never mounted until the public rollout
 * capability is positively known to be enabled. This also reflects the
 * runtime personal-course kill switch returned by the API.
 */
export function AiCourseCapabilityGuard({ children }: { children: ReactNode }) {
  const capability = useAiCourseCapability();

  if (capability.isPending) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
        <p role="status" className="text-sm text-neutral-700 dark:text-neutral-200">正在确认 AI 课程是否可用…</p>
      </main>
    );
  }

  if (capability.data?.enabled === true) return children;

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <section className="w-full max-w-lg rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-400 dark:bg-neutral-100">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600 dark:text-neutral-800">AI personal courses</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-900">AI 自建课程暂未开放</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-600 dark:text-neutral-800">
          {capability.isError ? '暂时无法确认该功能是否可用，请稍后再试。' : '该功能当前未对你的环境开放，已有的平台课程不受影响。'}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {capability.isError && (
            <button type="button" className={buttonClassName({ variant: 'secondary' })} onClick={() => void capability.refetch()}>
              重新检查
            </button>
          )}
          <Link to="/dashboard" className={buttonClassName()}>回到学习中心</Link>
        </div>
      </section>
    </main>
  );
}
