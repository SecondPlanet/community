/**
 * useYoutubeProgress — v1.9-alpha.2 (batch-10 A-09) 测试
 *
 * plan §3.6 + 用户决策：放开 CSP + 官方 IFrame Player API。
 * 本测试锁定主路径行为：
 *   1. YouTube embed videoUrl → 加载 loadApi + 构造 YT.Player
 *   2. getCurrentTime() 返回 5s 倍数 → push eventBuffer，去重生效
 *   3. onStateChange PLAYING → 清去重 ref，下次同秒仍 push
 *   4. 非 YouTube → 不加载、不构造 YT.Player
 *   5. cleanup → 调 player.destroy + clearInterval
 */
import { RefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateLearningEventInput } from '../../lib/learningEventsApi';
import {
  isYoutubeEmbedUrl,
  loadYouTubeApi,
  useYoutubeProgress,
  type YoutubePlayer,
  type YoutubePlayerConstructor,
} from './useYoutubeProgress';

class FakePlayer implements YoutubePlayer {
  private t = 0;
  private d = 100;
  destroyed = false;
  constructor(public options: { events?: { onReady?: (e: { target: YoutubePlayer }) => void; onStateChange?: (e: { target: YoutubePlayer; data: number }) => void } }) {
    // YT.Player 构造器触发 onReady（YouTube 官方行为是异步，setTimeout 0 模拟）
    setTimeout(() => options.events?.onReady?.({ target: this }), 0);
  }
  getCurrentTime() { return this.t; }
  getDuration() { return this.d; }
  destroy() { this.destroyed = true; }
  // helpers for tests
  __setTime(t: number) { this.t = t; }
  __setDuration(d: number) { this.d = d; }
  __fireStateChange(data: number) {
    this.options.events?.onStateChange?.({ target: this, data });
  }
}

function makeIframeEl(): HTMLIFrameElement {
  const el = document.createElement('iframe');
  document.body.appendChild(el);
  return el;
}

function makeBuffer() {
  const events: CreateLearningEventInput[] = [];
  const ref = { current: { push: (e: CreateLearningEventInput) => events.push(e) } };
  return { events, ref: ref as RefObject<{ push: (e: CreateLearningEventInput) => void } | null> };
}

describe('isYoutubeEmbedUrl', () => {
  it('youtube.com / youtu.be / www.youtube.com / m.youtube.com → true', () => {
    expect(isYoutubeEmbedUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYoutubeEmbedUrl('https://youtu.be/abc')).toBe(true);
    expect(isYoutubeEmbedUrl('https://youtube.com/embed/abc')).toBe(true);
    expect(isYoutubeEmbedUrl('https://m.youtube.com/watch?v=abc')).toBe(true);
  });
  it('B 站 / 直接 mp4 / undefined → false', () => {
    expect(isYoutubeEmbedUrl('https://player.bilibili.com/player.html?bvid=BV1')).toBe(false);
    expect(isYoutubeEmbedUrl('https://example.com/video.mp4')).toBe(false);
    expect(isYoutubeEmbedUrl(undefined)).toBe(false);
  });
});

describe('loadYouTubeApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.querySelectorAll('script[data-yt-iframe-api]').forEach((s) => s.remove());
    delete (window as { YT?: unknown }).YT;
    delete (window as { onYouTubeIframeAPIReady?: unknown }).onYouTubeIframeAPIReady;
  });

  it('window.YT.Player 已就绪 → 直接 resolve, 不注入 script', async () => {
    (window as { YT?: { Player: YoutubePlayerConstructor } }).YT = {
      Player: class { getCurrentTime() { return 0; } getDuration() { return 0; } } as unknown as YoutubePlayerConstructor,
    };
    const before = document.head.querySelectorAll('script[data-yt-iframe-api]').length;
    await loadYouTubeApi();
    const after = document.head.querySelectorAll('script[data-yt-iframe-api]').length;
    expect(after).toBe(before);
  });

  it('未就绪 → 注入 <script src="https://www.youtube.com/iframe_api"> 并 resolve on onYouTubeIframeAPIReady', async () => {
    const promise = loadYouTubeApi();
    // script 应已注入
    const tag = document.head.querySelector('script[data-yt-iframe-api]') as HTMLScriptElement | null;
    expect(tag).not.toBeNull();
    expect(tag?.src).toBe('https://www.youtube.com/iframe_api');
    // 模拟 YouTube API 加载完毕
    (window as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady?.();
    await promise;
    expect((window as { onYouTubeIframeAPIReady?: unknown }).onYouTubeIframeAPIReady).toBeNull();
  });
});

describe('useYoutubeProgress 主路径', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('非 YouTube videoUrl → 不调 loadApi、不构造 Player', () => {
    const iframe = makeIframeEl();
    const { ref: iframeRef } = { ref: { current: iframe } as RefObject<HTMLIFrameElement | null> };
    const buf = makeBuffer();
    const loadApi = vi.fn(() => Promise.resolve());
    const PlayerCtor = vi.fn() as unknown as YoutubePlayerConstructor;

    renderHook(() => useYoutubeProgress({
      iframeRef,
      videoUrl: 'https://example.com/video.mp4',
      lessonId: 'lesson-1',
      courseId: 'course-1',
      ytLastReportedRef: { current: -1 },
      eventBufferRef: buf.ref,
      setMediaDuration: () => {},
      loadApi,
      PlayerCtor,
    }));

    act(() => vi.runAllTimers());
    expect(loadApi).not.toHaveBeenCalled();
    expect(PlayerCtor).not.toHaveBeenCalled();
  });

  it('YouTube videoUrl → 构造 YT.Player, getCurrentTime → push eventBuffer, 去重生效', async () => {
    const iframe = makeIframeEl();
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement | null>;
    const buf = makeBuffer();
    const ytLastReportedRef = { current: -1 };
    const players: FakePlayer[] = [];
    const PlayerCtor = vi.fn() as unknown as YoutubePlayerConstructor & ReturnType<typeof vi.fn>;
    (PlayerCtor as unknown as ReturnType<typeof vi.fn>).mockImplementation((_el: HTMLElement, options: FakePlayer['options']) => {
      const p = new FakePlayer(options);
      players.push(p);
      return p;
    });

    renderHook(() => useYoutubeProgress({
      iframeRef,
      videoUrl: 'https://www.youtube.com/watch?v=abc',
      lessonId: 'lesson-1',
      courseId: 'course-1',
      ytLastReportedRef,
      eventBufferRef: buf.ref,
      setMediaDuration: () => {},
      loadApi: () => Promise.resolve(),
      PlayerCtor,
    }));

    // 让 onReady 跑完(setTimeout(0) 用 fake timer 需 advance)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(PlayerCtor).toHaveBeenCalledTimes(1);
    expect(players).toHaveLength(1);

    // 模拟 getCurrentTime = 25 (5 的倍数)
    players[0].__setTime(25);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(buf.events).toHaveLength(1);
    expect(buf.events[0]).toMatchObject({
      eventType: 'play', lessonId: 'lesson-1', positionSec: 25,
      metadata: { courseId: 'course-1', source: 'youtube-iframe-api' },
    });

    // 同一次再触发 25 → 去重, 不 push
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(buf.events).toHaveLength(1);

    // PLAYING 事件 → 清去重
    players[0].__fireStateChange(1);
    expect(ytLastReportedRef.current).toBe(-1);

    // 推进时间到 30s, pos=30 (5s 倍数且 ≠ -1) → 应 push
    players[0].__setTime(30);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(buf.events.length).toBeGreaterThanOrEqual(2);
    expect(ytLastReportedRef.current).toBe(30);

    // 非 5 倍数 12 → 不 push
    const before = buf.events.length;
    players[0].__setTime(12);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(buf.events.length).toBe(before);
  });

  it('onReady 把 getDuration 写回 setMediaDuration', async () => {
    const iframe = makeIframeEl();
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement | null>;
    const buf = makeBuffer();
    const setMediaDuration = vi.fn();
    const PlayerCtor = vi.fn() as unknown as YoutubePlayerConstructor & ReturnType<typeof vi.fn>;
    (PlayerCtor as unknown as ReturnType<typeof vi.fn>).mockImplementation((_el: HTMLElement, options: FakePlayer['options']) => {
      const p = new FakePlayer(options);
      p.__setDuration(123);
      return p;
    });

    renderHook(() => useYoutubeProgress({
      iframeRef,
      videoUrl: 'https://www.youtube.com/watch?v=abc',
      lessonId: 'lesson-1',
      courseId: 'course-1',
      ytLastReportedRef: { current: -1 },
      eventBufferRef: buf.ref,
      setMediaDuration,
      loadApi: () => Promise.resolve(),
      PlayerCtor,
    }));

    // onReady 走 setTimeout(0),需要推进 fake timer 才会触发
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(setMediaDuration).toHaveBeenCalledWith(123);
  });

  it('unmount → 调 player.destroy + clearInterval (无残留)', async () => {
    const iframe = makeIframeEl();
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement | null>;
    const buf = makeBuffer();
    const PlayerCtor = vi.fn() as unknown as YoutubePlayerConstructor & ReturnType<typeof vi.fn>;
    (PlayerCtor as unknown as ReturnType<typeof vi.fn>).mockImplementation((_el: HTMLElement, options: FakePlayer['options']) => {
      return new FakePlayer(options);
    });

    const { unmount } = renderHook(() => useYoutubeProgress({
      iframeRef,
      videoUrl: 'https://www.youtube.com/watch?v=abc',
      lessonId: 'lesson-1',
      courseId: 'course-1',
      ytLastReportedRef: { current: -1 },
      eventBufferRef: buf.ref,
      setMediaDuration: () => {},
      loadApi: () => Promise.resolve(),
      PlayerCtor,
    }));

    await act(async () => {
      await Promise.resolve();
    });
    // 暂存 player 引用
    const fakePlayerBefore = (PlayerCtor.mock.results[0].value as FakePlayer);
    unmount();
    expect(fakePlayerBefore.destroyed).toBe(true);
    // 之后推进 setInterval 不应再 push（interval 已 clear）
    const before = buf.events.length;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(buf.events.length).toBe(before);
  });
});
