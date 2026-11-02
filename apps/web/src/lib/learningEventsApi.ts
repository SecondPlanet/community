/**
 * LearningEvents API — 视频学习事件上报客户端
 *
 * 前端 video player 行为:
 *   - 单条 immediate 接口(complete / note)用 createOne
 *   - play / pause / seek / replay 走 batch 缓冲,每 30s flush 一次
 *   - flush 走 navigator.sendBeacon(无 body 长度限制 + 不阻塞 unload)
 */
import { api, getAccessToken } from './api';

export type LearningEventType =
  | 'play'
  | 'pause'
  | 'seek'
  | 'complete'
  | 'replay'
  | 'skip'
  | 'note'
  | 'personal_lesson_opened'
  | 'personal_assessment_started'
  | 'personal_assessment_completed'
  | 'personal_tutor_action_clicked'
  | 'personal_next_step_clicked';

export interface CreateLearningEventInput {
  lessonId?: string;
  eventType: LearningEventType;
  positionSec?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface LearningEvent {
  id: string;
  userId: string;
  lessonId: string | null;
  eventType: LearningEventType;
  positionSec: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ENDPOINT = '/api/v1/learning-events';

export const learningEventsApi = {
  /** 单条上报(complete / note 等 immediate) */
  async createOne(input: CreateLearningEventInput): Promise<LearningEvent> {
    const { data } = await api.post<{ event: LearningEvent }>(ENDPOINT, input);
    return data.event;
  },

  // v1.9-alpha.2 (batch-10 A-09): 续播读取侧 — 该用户该课时最近一次位置(秒)。
  async getMyPositionForLesson(lessonId: string): Promise<number | null> {
    const { data } = await api.get<{ positionSec: number | null }>(
      `${ENDPOINT}/me/lessons/${encodeURIComponent(lessonId)}/position`,
    );
    return data.positionSec;
  },

  /**
   * 批量上报(play / pause / seek 等高频事件)
   * 默认走 fetch + keepalive,unload 时降级到 sendBeacon
   */
  async createBatch(events: CreateLearningEventInput[]): Promise<{ count: number }> {
    if (events.length === 0) return { count: 0 };

    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/learning-events/batch`;
    // P0 安全加固 2026-07-23: 之前用 `localStorage.getItem('accessToken')` 是死代码
    //   (token 实际在 sessionStorage + 内存),永远返回 '', L78 永远发空 Authorization。
    //   改用 lib/api.ts 的 getAccessToken() (memory 缓存 + sessionStorage 兜底)。
    const token = getAccessToken() ?? '';

    // 优先 sendBeacon(unload 友好,不会因页面关闭丢请求)
    //
    // P0 2026-07-23 已知限制: sendBeacon **不支持自定义 header** (浏览器规范),
    //   所以 unload 时如果 accessToken 过期就只能 fail silently,后端 401 静默
    //   丢。退路: 依赖 createOne (单条 immediate, 走 axios 自动加 Authorization)
    //   兜住重要事件 (complete / note), 高频 play/pause/seek 丢几条不影响
    //   分析。
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob(
          [JSON.stringify({ events })],
          { type: 'application/json' },
        );
        const sent = navigator.sendBeacon(url, blob);
        if (sent) return { count: events.length };
      } catch {
        /* 退到 fetch keepalive */
      }
    }

    // 退路:fetch + keepalive
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events }),
        keepalive: true,
      });
      if (!res.ok) return { count: 0 };
      const data = await res.json();
      return { count: data.count ?? 0 };
    } catch {
      return { count: 0 };
    }
  },

  /** 我的最近事件 */
  async listMine(limit = 50): Promise<LearningEvent[]> {
    const { data } = await api.get<LearningEvent[]>(`${ENDPOINT}/me`, { params: { limit } });
    return data;
  },
};

/**
 * 事件缓冲器 — 高频 play/pause/seek 先入队,30s 批量 flush
 * 用法:
 *   const buf = createEventBuffer();
 *   buf.push({ eventType: 'play', lessonId, positionSec: 30 });
 *   ... 30s 后 ...
 *   buf.flush(); // 或在 unmount 时调
 */
export function createEventBuffer(flushIntervalMs = 30_000) {
  let buffer: CreateLearningEventInput[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    const toSend = buffer;
    buffer = [];
    learningEventsApi.createBatch(toSend).catch(() => {
      // 失败不抛(无 UI 影响);buffer 已清,避免重试风暴
    });
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  const start = () => {
    if (timer != null) return;
    if (typeof window === 'undefined') return;
    timer = setInterval(flush, flushIntervalMs);
    // 页面隐藏 / 关闭时立即 flush
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
  };

  const stop = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
    flush();
  };

  return {
    push(input: CreateLearningEventInput) {
      buffer.push(input);
    },
    flush,
    start,
    stop,
    size: () => buffer.length,
  };
}
