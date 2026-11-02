import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface CmsFailure {
  queryHash: string;
  source: string;
  detail: string;
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const serverMessage = error.response?.data?.message;
    const message = Array.isArray(serverMessage) ? serverMessage.join('; ') : serverMessage;
    return [status ? `HTTP ${status}` : null, message || error.message]
      .filter(Boolean)
      .join(' · ');
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * CMS failures must be visible instead of being hidden by stale hardcoded
 * content. React Query still retries and keeps last-known server data in
 * memory; this banner exposes the real failure and provides manual recovery.
 */
export function CmsErrorBanner() {
  const queryClient = useQueryClient();
  const [failures, setFailures] = useState<CmsFailure[]>([]);

  useEffect(() => {
    let active = true;
    let scheduled = false;

    const update = () => {
      if (!active) return;
      const next = queryClient
        .getQueryCache()
        .findAll({
          predicate: (query) =>
            query.queryKey[0] === 'cms' && query.state.status === 'error',
        })
        .map((query) => ({
          queryHash: query.queryHash,
          source: query.queryKey.slice(1).join(' / '),
          detail: describeError(query.state.error),
        }));
      setFailures(next);
    };

    // QueryCache can emit while another component is rendering and registering
    // its query. Defer the React state update so the banner never updates in a
    // sibling's render phase.
    const scheduleUpdate = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        update();
      });
    };

    scheduleUpdate();
    const unsubscribe = queryClient.getQueryCache().subscribe(scheduleUpdate);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient]);

  if (failures.length === 0) return null;
  const first = failures[0]!;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] border-b-2 border-red-900 bg-red-50 px-4 py-2 text-red-950"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-xs">
        <p>
          <strong>内容配置加载失败</strong>
          {' · '}{first.source}: {first.detail}
          {failures.length > 1 ? `（另有 ${failures.length - 1} 项失败）` : ''}
        </p>
        <button
          type="button"
          className="shrink-0 border border-red-900 px-3 py-1 font-bold hover:bg-red-100"
          onClick={() => {
            void queryClient.refetchQueries({
              predicate: (query) =>
                query.queryKey[0] === 'cms' && query.state.status === 'error',
            });
          }}
        >
          重试
        </button>
      </div>
    </div>
  );
}
