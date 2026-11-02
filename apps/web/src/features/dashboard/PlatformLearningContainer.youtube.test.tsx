/**
 * PlatformLearningContainer — v1.9-alpha.2 (batch-10 A-09) YouTube IFrame Player API
 *
 * 通过 hook 抽离 (useYoutubeProgress) 单测主路径。验证:
 *   1. YouTube embed 课时 → 注入 iframe_api + 用 YT.Player 包住 iframe,
 *      onReady 启动 5s 定时器。
 *   2. getCurrentTime 返回 35 → push play 事件, 同一秒不再 push。
 *   3. onStateChange PLAYING (1) → 清 ytLastReportedRef, 下一次 5s 倍数可再次 push。
 *   4. 直接 mp4 课时 → 不注入 iframe_api / 不构造 YT.Player。
 *   5. Bilibili embed → 不注入 iframe_api / 不构造 YT.Player。
 *
 * 与 NotesPanel.test.tsx 同样走 vitest jsdom + RTL; 不同点: 本测试只测 hook,
 * 不挂整棵 PlatformLearningContainer 树 (避免 router/query/api 串扰)。
 */

import { act, renderHook } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  isYoutubeEmbedUrl,
  useYoutubeProgress,
  type YoutubePlayer,
  type YoutubePlayerConstructor,
  type YoutubePlayerOptions,
} from './useYoutubeProgress';

interface MockedPlayer extends YoutubePlayer {
  getCurrentTime: ReturnType<typeof vi.fn>;
  getDuration: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

interface HookHarness {
  iframeEl: HTMLIFrameElement;
  buffer: { push: ReturnType<typeof vi.fn> };
  ytLastReportedRef: { current: number };
  setMediaDuration: ReturnType<typeof vi.fn>;
  loadApi: ReturnType<typeof vi.fn>;
  PlayerCtor: YoutubePlayerConstructor & ReturnType<typeof vi.fn>;
  /** 最近一次 PlayerCtor 调用注入的 options.events (含 onReady / onStateChange) */
  getEvents: () => NonNullable<YoutubePlayerOptions['events']>;
  /** 最近一次 PlayerCtor 调用返回的 player 实例 */
  getPlayer: () => MockedPlayer;
}

/** 把一条 async 链 (微任务 + setInterval) 都跑完 */
async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function setupHarness(opts: { videoUrl: string | undefined }): HookHarness {
  const iframeEl = document.createElement('iframe');
  iframeEl.id = 'yt-embed-test';
  document.body.appendChild(iframeEl);
  const iframeRef = { current: iframeEl };

  const buffer = { push: vi.fn() };
  const eventBufferRef = {
    current: buffer as unknown as { push: (input: unknown) => void },
  };
  const ytLastReportedRef = { current: -1 };
  const setMediaDuration = vi.fn();
  const loadApi = vi.fn().mockResolvedValue(undefined);

  let lastEvents: NonNullable<YoutubePlayerOptions['events']> | null = null;
  let lastPlayer: MockedPlayer | null = null;
  const PlayerCtor = vi.fn((_el: HTMLElement, options: YoutubePlayerOptions) => {
    lastEvents = options.events ?? {};
    const player: MockedPlayer = {
      getCurrentTime: vi.fn(() => 0),
      getDuration: vi.fn(() => 120),
      destroy: vi.fn(),
    };
    lastPlayer = player;
    return player;
  }) as unknown as YoutubePlayerConstructor & ReturnType<typeof vi.fn>;

  renderHook(() =>
    useYoutubeProgress({
      iframeRef,
      videoUrl: opts.videoUrl,
      lessonId: 'lesson-yt-1',
      courseId: 'course-yt-1',
      ytLastReportedRef: ytLastReportedRef as unknown as React.MutableRefObject<number>,
      eventBufferRef: eventBufferRef as unknown as React.MutableRefObject<{
        push: (input: unknown) => void;
      } | null>,
      setMediaDuration,
      loadApi,
      PlayerCtor,
    }),
  );

  return {
    iframeEl,
    buffer,
    ytLastReportedRef,
    setMediaDuration,
    loadApi,
    PlayerCtor,
    getEvents: () => {
      if (!lastEvents) throw new Error('PlayerCtor not called yet');
      return lastEvents;
    },
    getPlayer: () => {
      if (!lastPlayer) throw new Error('PlayerCtor not called yet');
      return lastPlayer;
    },
  };
}

describe('isYoutubeEmbedUrl', () => {
  it('youtube.com / youtu.be → true', () => {
    expect(isYoutubeEmbedUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYoutubeEmbedUrl('https://youtu.be/abc')).toBe(true);
    expect(isYoutubeEmbedUrl('https://m.youtube.com/watch?v=abc')).toBe(true);
  });
  it('bilibili → false', () => {
    expect(isYoutubeEmbedUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(false);
  });
  it('mp4 / undefined → false', () => {
    expect(isYoutubeEmbedUrl('https://cdn.example.com/lesson.mp4')).toBe(false);
    expect(isYoutubeEmbedUrl(undefined)).toBe(false);
  });
});

describe('useYoutubeProgress — 主路径 hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('YouTube 课时 → 注入 iframe_api + YT.Player 包住 iframe; onReady 后取 duration', async () => {
    const h = setupHarness({ videoUrl: 'https://www.youtube.com/watch?v=abc123' });

    await flushMicrotasks();
    expect(h.loadApi).toHaveBeenCalledTimes(1);
    expect(h.PlayerCtor).toHaveBeenCalledTimes(1);
    // 传入的 el 是 iframe
    expect(h.PlayerCtor.mock.calls[0][0]).toBe(h.iframeEl);

    // onReady 还没触发, setMediaDuration 与 push 都没动
    expect(h.setMediaDuration).not.toHaveBeenCalled();
    expect(h.buffer.push).not.toHaveBeenCalled();

    // 触发 onReady
    const events = h.getEvents();
    expect(events.onReady).toBeDefined();
    const player = h.getPlayer();

    act(() => {
      events.onReady!({ target: player });
    });
    // onReady 里 getDuration() 立刻被调, setMediaDuration(120)
    expect(h.setMediaDuration).toHaveBeenCalledWith(120);
  });

  it('getCurrentTime 返回 35 (5s 倍数) → push play 事件; 重复 35 不重复 push', async () => {
    const h = setupHarness({ videoUrl: 'https://youtu.be/abc123' });
    await flushMicrotasks();
    const events = h.getEvents();
    const player = h.getPlayer();
    let currentTime = 0;
    player.getCurrentTime.mockImplementation(() => currentTime);

    act(() => {
      events.onReady!({ target: player });
    });
    expect(h.buffer.push).not.toHaveBeenCalled();

    // advance 5s → 定时器跑一次, getCurrentTime 返回 35 → push
    currentTime = 35;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(h.buffer.push).toHaveBeenCalledTimes(1);
    expect(h.buffer.push).toHaveBeenLastCalledWith({
      eventType: 'play',
      lessonId: 'lesson-yt-1',
      positionSec: 35,
      metadata: { courseId: 'course-yt-1', source: 'youtube-iframe-api' },
    });
    expect(h.ytLastReportedRef.current).toBe(35);

    // 再 advance 5s, getCurrentTime 仍 35 → 不重复 push
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(h.buffer.push).toHaveBeenCalledTimes(1);

    // currentTime 到 40 → push
    currentTime = 40;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(h.buffer.push).toHaveBeenCalledTimes(2);
    expect(h.buffer.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ positionSec: 40 }),
    );
    expect(h.ytLastReportedRef.current).toBe(40);
  });

  it('getCurrentTime 返回 7 (非 5s 倍数) → 不 push', async () => {
    const h = setupHarness({ videoUrl: 'https://www.youtube.com/watch?v=abc123' });
    await flushMicrotasks();
    const events = h.getEvents();
    const player = h.getPlayer();
    let currentTime = 0;
    player.getCurrentTime.mockImplementation(() => currentTime);

    act(() => {
      events.onReady!({ target: player });
    });

    currentTime = 7;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(h.buffer.push).not.toHaveBeenCalled();
  });

  it('onStateChange PLAYING (1) → 清 ytLastReportedRef, 下一次同秒数仍 push', async () => {
    const h = setupHarness({ videoUrl: 'https://www.youtube.com/watch?v=abc' });
    await flushMicrotasks();
    const events = h.getEvents();
    const player = h.getPlayer();
    let currentTime = 0;
    player.getCurrentTime.mockImplementation(() => currentTime);

    act(() => {
      events.onReady!({ target: player });
    });

    currentTime = 25;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(h.buffer.push).toHaveBeenCalledTimes(1);
    expect(h.ytLastReportedRef.current).toBe(25);

    // PAUSED (2) → 不清
    act(() => {
      events.onStateChange!({ target: player, data: 2 });
    });
    expect(h.ytLastReportedRef.current).toBe(25);

    // PLAYING (1) → 清
    act(() => {
      events.onStateChange!({ target: player, data: 1 });
    });
    expect(h.ytLastReportedRef.current).toBe(-1);

    // currentTime 还在 25, 但 ref 已被清 → 这次定时器跑会再 push 一次
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(h.buffer.push).toHaveBeenCalledTimes(2);
    expect(h.buffer.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ positionSec: 25 }),
    );
  });

  it('直接 mp4 课时 → 不调用 loadApi / 不构造 YT.Player', async () => {
    const h = setupHarness({ videoUrl: 'https://cdn.example.com/lesson.mp4' });
    await flushMicrotasks();
    expect(h.loadApi).not.toHaveBeenCalled();
    expect(h.PlayerCtor).not.toHaveBeenCalled();
  });

  it('Bilibili 课时 → 不调用 loadApi / 不构造 YT.Player', async () => {
    const h = setupHarness({ videoUrl: 'https://www.bilibili.com/video/BV1xx411c7mD' });
    await flushMicrotasks();
    expect(h.loadApi).not.toHaveBeenCalled();
    expect(h.PlayerCtor).not.toHaveBeenCalled();
  });
});
