/**
 * useYoutubeProgress — v1.9-alpha.2 (batch-10 A-09 跟进)
 *
 * YouTube IFrame Player API 封装 hook, 解决 plan §3.6 提到的"依赖未文档化的
 * postMessage 协议"问题。两条路径并行:
 *   - 主路径 (本 hook): 加载 https://www.youtube.com/iframe_api, 用官方
 *     YT.Player 包住 <iframe>, 通过 getCurrentTime() / getDuration() 拉
 *     进度, 每 5s 推入 eventBufferRef。
 *   - 备用路径 (PlatformLearningContainer 内 postMessage 监听): YT.Player
 *     加载失败或被 CSP 拦截时仍能继续记录播放位置。
 *
 * 共享的 ytLastReportedRef 由调用方持有, postMessage fallback 与本 hook 都
 * 写同一个 ref, 避免重复 push 同一秒。
 *
 * 约束:
 *   - 仅在传入 videoUrl 经 normalizeEmbeddedVideoUrl 后 hostname 含 youtube.com
 *     时启用, 其他源(直接 <video> / B 站)不加载 iframe_api。
 *   - 在 useEffect 里 cleanup: clearInterval + player.destroy(), 切课时 /
 *     unmount 不留 leak。
 *   - 不扩展 shouldAutoCompleteVideo — A-10 自动完成仅作用于直接 <video>,
 *     YouTube 路径需要独立验证(可能依赖 getDuration 不一致)。
 */

import { MutableRefObject, RefObject, useEffect } from 'react';
import type { CreateLearningEventInput } from '../../lib/learningEventsApi';

// YouTube IFrame Player API 的最小类型面 — 避免依赖 @types/youtube (本仓库
// 没装), 用到的几个方法手工声明。
export interface YoutubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  destroy?: () => void;
}

export interface YoutubePlayerOptions {
  events?: {
    onReady?: (event: { target: YoutubePlayer }) => void;
    onStateChange?: (event: { target: YoutubePlayer; data: number }) => void;
    onError?: (event: { target: YoutubePlayer; data: number }) => void;
  };
}

/**
 * YT.Player 构造器签名 — 同时声明 callable + constructable, 让
 * `vi.fn(impl)` (Procedure 期望) 与 `new Ctor(...)` 都能用同一类型。
 * 测试代码常见 pattern: `vi.fn(function () { return new FakePlayer(...) })`
 * 应当无需 cast 即可编译通过。
 */
export interface YoutubePlayerConstructor {
  (el: HTMLElement, options: YoutubePlayerOptions): YoutubePlayer;
  new (el: HTMLElement, options: YoutubePlayerOptions): YoutubePlayer;
}

declare global {
  interface Window {
    YT?: {
      Player: YoutubePlayerConstructor;
    };
    onYouTubeIframeAPIReady?: (() => void) | null;
  }
}

/** 判断给定 videoUrl 是不是 YouTube 源(供 hook 启用条件用)。
 *  注意: 这是判断"原始 videoUrl"是否 YouTube, 不看 normalizeEmbeddedVideoUrl
 *  后的产物 — 直接 mp4 也走 false, B 站走 false。 */
export function isYoutubeEmbedUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

/**
 * 加载 YouTube IFrame Player API 一次。
 * - 已就绪 (window.YT?.Player) → resolve
 * - 已注入 script → 等 load
 * - 否则注入 https://www.youtube.com/iframe_api, 监听 onYouTubeIframeAPIReady
 *   全局钩子(YouTube 自己的约定)
 */
export function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yt-iframe-api]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.dataset.ytIframeApi = 'true';
    document.head.appendChild(tag);
    // YouTube API 会在 iframe_api 加载完成后调用 onYouTubeIframeAPIReady。
    // resolve 完置 null, 避免下一次注入时残留 handler。
    window.onYouTubeIframeAPIReady = () => {
      window.onYouTubeIframeAPIReady = null;
      resolve();
    };
  });
}

export interface UseYoutubeProgressOptions {
  /** 指向 <iframe id={yt-embed-...}> 的 ref, 由 PlatformLearningContainer 持有 */
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** 当前课时 videoUrl; 非 YouTube 时本 hook 完全 no-op */
  videoUrl: string | undefined;
  lessonId: string;
  courseId: string;
  /**
   * 共享的去重 ref。PlatformLearningContainer 的 postMessage fallback 也写
   * 同一个 ref, 避免主路径 + fallback 同时 push 同一秒。
   */
  ytLastReportedRef: MutableRefObject<number>;
  /** PlatformLearningContainer 持有的 event buffer 引用, push play 事件 */
  eventBufferRef: MutableRefObject<{ push: (input: CreateLearningEventInput) => void } | null>;
  /** YT.Player onReady 时把 getDuration() 写回去 */
  setMediaDuration: (duration: number) => void;
  /**
   * 注入注入 <script> 与 YT.Player 构造器, 便于测试 mock。
   * 生产代码不传, 走默认 (真实 window.YT.Player + 真实 iframe_api 注入)。
   */
  loadApi?: () => Promise<void>;
  /** YT.Player 构造器(测试用); 默认 window.YT.Player */
  PlayerCtor?: YoutubePlayerConstructor;
}

const REPORT_INTERVAL_MS = 5_000;

/**
 * 主路径 hook: 仅在 videoUrl 是 YouTube embed 时启用。
 * PlatformLearningContainer 同时保留 postMessage 监听作为 fallback。
 */
export function useYoutubeProgress(opts: UseYoutubeProgressOptions): void {
  const {
    iframeRef,
    videoUrl,
    lessonId,
    courseId,
    ytLastReportedRef,
    eventBufferRef,
    setMediaDuration,
    loadApi,
    PlayerCtor,
  } = opts;

  // 仅在 videoUrl 看起来是 YouTube embed 时启用
  const enabled = isYoutubeEmbedUrl(videoUrl);

  useEffect(() => {
    if (!enabled) return;
    if (!iframeRef.current) return;

    let cancelled = false;
    let player: YoutubePlayer | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const loader = loadApi ?? loadYouTubeApi;
    // 30s 加载超时 → 让 PlatformLearningContainer 的 postMessage fallback 接管
    // (YouTube iframe_api 在慢网下可能 10s 内还没就绪, 给真实环境余量;
    // 30s 后取消 effect 是为了切课时/卸载时不会无限挂 pending loader)
    const safetyTimeout = setTimeout(() => {
      cancelled = true;
    }, 30_000);

    loader()
      .then(() => {
        if (cancelled) return;
        const Ctor = PlayerCtor ?? window.YT?.Player;
        const el = iframeRef.current;
        if (!Ctor || !el) return;

        player = new Ctor(el, {
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const p = event.target;
              // 取一次真实 duration, 写入 mediaDuration(显示与 fallback 都用到)
              try {
                const dur = p.getDuration();
                if (dur && isFinite(dur) && dur > 0) {
                  setMediaDuration(dur);
                }
              } catch {
                /* getDuration 可能在某些环境 throw, 吞 */
              }
              interval = setInterval(() => {
                if (cancelled) return;
                let t: number;
                try {
                  t = p.getCurrentTime();
                } catch {
                  return;
                }
                if (!isFinite(t) || t <= 0) return;
                const pos = Math.floor(t);
                if (pos % 5 !== 0) return;
                if (pos === ytLastReportedRef.current) return;
                ytLastReportedRef.current = pos;
                eventBufferRef.current?.push({
                  eventType: 'play',
                  lessonId,
                  positionSec: pos,
                  metadata: { courseId, source: 'youtube-iframe-api' },
                });
              }, REPORT_INTERVAL_MS);
            },
            onStateChange: (event) => {
              // PLAYING (1) 时清去重 ref, 让下一次 5s 倍数重新 push
              if (event.data === 1) {
                ytLastReportedRef.current = -1;
              }
            },
          },
        });
      })
      .catch(() => {
        /* iframe_api 加载失败 → PlatformLearningContainer 的 postMessage fallback 接管 */
      });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      if (interval) clearInterval(interval);
      try {
        player?.destroy?.();
      } catch {
        /* destroy 在某些情况下会 throw, 吞 */
      }
    };
  }, [
    enabled,
    iframeRef,
    lessonId,
    courseId,
    ytLastReportedRef,
    eventBufferRef,
    setMediaDuration,
    loadApi,
    PlayerCtor,
  ]);
}
