/**
 * useChatCapability — v1.9-alpha.2 (batch-6 A-08)
 *
 * GET /api/v1/chat/capabilities 的 React Query 封装。
 * 60s staleTime: 平台预算开关不会频繁切换, 短过阈值没意义, 长过阈值用户感知卡。
 *
 * 返回:
 *   { enabled, reason?, isLoading, refetch }
 *
 * 用法(WebAssistantDrawer / PlatformLearningContainer):
 *   const { enabled } = useChatCapability();
 *   <input disabled={!enabled} placeholder={enabled ? '...' : 'AI 助教暂未启用'} />
 */
import { useQuery } from '@tanstack/react-query';
import { chatApi, type ChatCapabilities } from '../lib/chatApi';

const STALE_MS = 60_000;

export function useChatCapability() {
  const query = useQuery<ChatCapabilities>({
    queryKey: ['chat-capabilities'],
    queryFn: () => chatApi.getCapabilities(),
    staleTime: STALE_MS,
    // 失败时不抛错, 默认视为 enabled (用户自己的 BYOK 可能正常工作, 不应
    // 因为探测失败就禁用整个输入框)。
    retry: 1,
  });
  return {
    enabled: query.data?.enabled ?? true,
    reason: query.data?.reason,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}