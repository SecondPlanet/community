/**
 * chatApi — 网页小助手后端客户端
 *
 * 端点: /api/v1/chat/*
 * - 与 admin 智能填充 aiApi 共享 axios 实例(api),但路由 / URL 隔离。
 * - 用途: 全站 FAB 触发的 floating chat drawer,跟 dashboard/learning
 *   课程内小助手与全站入口复用同一套真实会话。
 *
 * ponytail: 全局 axios 默认 10s,Provider AI_PROVIDER_TIMEOUT_MS=60s。
 * chat 端点按请求覆盖 timeout 到 65s,避免前 10s 先掐断然后前端只看到网络错。
 */
import api, { getAccessToken, refreshSession } from './api';

const CHAT_REQUEST_TIMEOUT_MS = 65_000;

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatSource {
  // P1 (verifier audit 2026-07-24): 后端 prompt + extractSources 允许 'site',
  // 之前前端 type union 缺 'site' → WebAssistantMessage.tsx TYPE_META Record
  // 拿不到 meta, meta.icon 抛 undefined → React 崩. 加上对齐.
  // v1.9-alpha.2 (C-01): 加 'lesson' — 后端 RAG 课时上下文检索会引用课时,
  // WebAssistantMessage 的 TYPE_META Record 也要补 entry.
  type: 'course' | 'degree' | 'hackathon' | 'site' | 'lesson';
  id: string;
  title: string;
  url: string;
}

export interface SendMessageResponse {
  userMsg: ChatMessage;
  assistantMsg: ChatMessage;
  sources: ChatSource[];
}

// v1.9-alpha.2 (batch-5b C-02): 与后端 chat.service ChatStreamEvent 对齐的 3 事件协议
export interface ChatStreamDelta {
  event: 'delta';
  text: string;
}
export interface ChatStreamDone {
  event: 'done';
  userMsgId: string;
  assistantMsgId: string;
  content: string; // 服务端已剥 [[src:]]
  sources: ChatSource[];
  partial: boolean;
}
export interface ChatStreamError {
  event: 'error';
  code: string;
  message: string;
  partialSaved: boolean;
}
export type ChatStreamEvent = ChatStreamDelta | ChatStreamDone | ChatStreamError;

// v1.9-alpha.2 (batch-6 A-08): GET /chat/capabilities 返回体
export interface ChatCapabilities {
  enabled: boolean;
  reason?: 'NOT_CONFIGURED' | 'BUDGET_DISABLED';
}

/**
 * v1.9-alpha.2 (batch-5b C-02): 流式渲染用的 [[src:...]] 剥离。
 * - 完整标记 `\[\[src:...\]\]` 直接剥掉;
 * - 未闭合尾巴(流刚收到 `[[src:course:c-1` 还没收到 `]]`)从 `[[src:` 起截断,
 *   防止闪现半截标记。最终 done 事件的服务端 content 已剥净, 渲染前再过一遍
 *   本函数幂等无害。
 */
export function stripSourceMarkers(text: string): string {
  const stripped = text.replace(/\[\[src:[^\]]*\]\]/g, '');
  const openIdx = stripped.indexOf('[[src:');
  if (openIdx !== -1) return stripped.slice(0, openIdx);
  return stripped;
}

/**
 * v1.9-alpha.2 (batch-5b C-02): SSE 流式发消息。
 * - fetch + ReadableStream 手写 SSE 解析(EventSource 是 GET-only 带不了
 *   Authorization header, plan §5b 结论);
 * - 401 → refreshSession() 一次后重试(与 axios 拦截器同策略);
 * - 事件通过 handlers 回调; 网络层错误 throw, 由调用方 catch。
 */
export async function streamChatMessage(
  sessionId: string,
  content: string,
  handlers: {
    onDelta?: (text: string) => void;
    onDone?: (payload: ChatStreamDone) => void;
    onError?: (payload: ChatStreamError) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const doFetch = () =>
    fetch(`/api/v1/chat/sessions/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body: JSON.stringify({ content }),
      signal,
    });

  let res = await doFetch();
  if (res.status === 401) {
    await refreshSession();
    res = await doFetch();
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let message = `流式请求失败 (${res.status})`;
    let code: string | undefined;
    try {
      const body = JSON.parse(text) as { code?: string; message?: string };
      // v1.9-alpha.2 (batch-6 Claude acceptance r1): 把后端响应体里的 code
      // 一并带出, 让 catch 块里的 friendlySendError 能走对应 case。
      if (body?.code) code = body.code;
      if (body?.message) message = body.message;
    } catch {
      /* 非 JSON 错误体, 用默认 message */
    }
    const err = new Error(message) as Error & { code?: string };
    if (code) err.code = code;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (rawEvent: string) => {
    let eventName = 'message';
    let dataLine = '';
    for (const line of rawEvent.split('\n')) {
      const l = line.trimEnd();
      if (l.startsWith('event:')) eventName = l.slice(6).trim();
      else if (l.startsWith('data:')) dataLine += l.slice(5).trim();
    }
    if (!dataLine) return;
    let evt: ChatStreamEvent;
    try {
      evt = JSON.parse(dataLine) as ChatStreamEvent;
    } catch {
      return; // 半截 JSON 忽略
    }
    if (evt.event === 'delta') handlers.onDelta?.(evt.text);
    else if (evt.event === 'done') {
      handlers.onDone?.(evt);
      gotFinalEvent = true;
    } else if (evt.event === 'error') {
      handlers.onError?.(evt);
      gotFinalEvent = true;
    }
    void eventName;
  };

  // v1.9-alpha.2 (batch-5b Claude acceptance nb): 跟踪是否收到终态事件 (done/error)。
  // 流提前关闭(网络断开但 abort 没救回来)→ throw, 防止前端流式占位卡死。
  let gotFinalEvent = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 事件以空行分隔; 服务端用 \n\n
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const raw = buffer.slice(0, sep);
        dispatch(raw);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
      }
    }
    // 流结束, 处理残余(正常情况服务端每个事件后都有空行, 这里只是兜底)
    if (buffer.trim()) {
      dispatch(buffer);
    }
  } finally {
    reader.releaseLock();
  }
  if (!gotFinalEvent) {
    throw new Error('流式回答未正常结束, 请重试');
  }
}

export const chatApi = {
  async listSessions(): Promise<ChatSession[]> {
    // 后端 controller 直接返 SessionSummary[] (裸 array), 不包 { sessions: [...] }
    const { data } = await api.get<ChatSession[]>('/api/v1/chat/sessions');
    return data;
  },

  async createSession(
    title?: string,
    // v1.9-alpha.1 (B-05): 课程 tutor 传 lessonId/courseId 让会话进入课程上下文;
    // 后端 listSessions 只返回 lessonId=null 的 general 会话,课程会话自动从
    // 全站助手会话列表消失(UX-AUDIT C-11 session 污染)。
    context?: { lessonId?: string; courseId?: string },
  ): Promise<{ sessionId: string; title: string | null }> {
    const { data } = await api.post<{ sessionId: string; title: string | null }>(
      '/api/v1/chat/sessions',
      {
        ...(title ? { title } : {}),
        ...(context?.lessonId ? { lessonId: context.lessonId } : {}),
        ...(context?.courseId ? { courseId: context.courseId } : {}),
      },
    );
    return data;
  },

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    // 后端 controller 直接返 MessageView[] (裸 array), 不包 { messages: [...] }
    const { data } = await api.get<ChatMessage[]>(
      `/api/v1/chat/sessions/${sessionId}/messages`,
      { timeout: CHAT_REQUEST_TIMEOUT_MS },
    );
    return data;
  },

  async sendMessage(sessionId: string, content: string): Promise<SendMessageResponse> {
    const { data } = await api.post<SendMessageResponse>(
      `/api/v1/chat/sessions/${sessionId}/messages`,
      { content },
      { timeout: CHAT_REQUEST_TIMEOUT_MS },
    );
    return data;
  },

  async deleteSession(sessionId: string): Promise<void> {
    await api.delete(`/api/v1/chat/sessions/${sessionId}`);
  },

  // v1.9-alpha.2 (batch-6 A-08): 当前用户 chat 能力探测。
  // enabled=true → 输入框可写; enabled=false → 禁用输入框, 占位显示 AI 助教暂未启用。
  async getCapabilities(): Promise<ChatCapabilities> {
    const { data } = await api.get<ChatCapabilities>('/api/v1/chat/capabilities');
    return data;
  },
};

export default chatApi;
