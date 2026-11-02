/**
 * chatErrors.ts — AI 聊天/助教发送错误的统一文案
 *
 * v1.9-alpha.1 (B-03) 抽出。WebAssistantDrawer 原本就有 friendlySendError
 * (UX-AUDIT-2026-09-11 C-09),PlatformLearningContainer 的课程内 tutor
 * 之前走的是 catch{} 写死的"课程助教暂时无法回答…",没法区分 moderation /
 * budget / provider timeout / network。这里抽到共享 lib,所有 AI 发送错误
 * 都走这一份。
 */
import { extractErrorMessage } from './apiError';

export type ChatErrorCode =
  | 'CONTENT_RESTRICTED'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_PROVIDER_TIMEOUT'
  // v1.9-alpha.2 (batch-6 C-09'): 平台 AI 预算被管理员关停
  | 'AI_PLATFORM_BUDGET_DISABLED'
  // v1.9-alpha.2 (batch-6 C-09'): 既没配 BYOK 也没配平台 AI
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | string
  | undefined;

export function friendlySendError(err: unknown): string {
  const payload = (err as { response?: { data?: { code?: ChatErrorCode; message?: string } } })
    ?.response?.data;
  // v1.9-alpha.2 (batch-6 Claude acceptance r1): SSE 路径 (chatApi.streamChatMessage)
  // 把后端 code 直接挂在 Error 上而不是 response.data.code, 这里补一支读取。
  const code: ChatErrorCode = payload?.code ?? (err as { code?: ChatErrorCode })?.code;
  switch (code) {
    case 'CONTENT_RESTRICTED':
      return '这条内容触发了安全策略，请换个问法';
    case 'AI_BUDGET_EXCEEDED':
      return '平台 AI 额度已用完，请联系管理员或稍后再试';
    case 'AI_PLATFORM_BUDGET_DISABLED':
      return '平台 AI 已被管理员临时关闭，请稍后再试或自备 AI Key';
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return 'AI 服务尚未配置，请联系管理员';
    case 'AI_PROVIDER_TIMEOUT':
      return 'AI 服务响应超时，请稍后再试';
    default:
      return extractErrorMessage(err, '发送失败，请稍后重试');
  }
}
