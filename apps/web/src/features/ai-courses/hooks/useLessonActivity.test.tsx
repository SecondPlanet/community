import { act, renderHook } from '@testing-library/react';
import { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiCoursesApi } from '../aiCoursesApi';
import { useLessonActivity } from './useLessonActivity';

vi.mock('../../../lib/api', () => ({
  getAccessToken: () => 'test-token',
}));

describe('useLessonActivity', () => {
  let observerCallback: IntersectionObserverCallback;

  beforeEach(() => {
    vi.spyOn(aiCoursesApi, 'updateActivity').mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal('IntersectionObserver', class {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [];

      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      disconnect() {}
      observe() {}
      takeRecords() { return []; }
      unobserve() {}
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('flushes the latest reading position when a lesson unmounts', () => {
    const container = document.createElement('main');
    const block = document.createElement('section');
    block.dataset.blockId = 'block-2';
    Object.defineProperty(block, 'offsetTop', { value: 40 });
    container.scrollTop = 175;
    container.appendChild(block);
    const containerRef = { current: container } as RefObject<HTMLElement>;

    const { unmount } = renderHook(() => useLessonActivity({
      projectId: 'project/1',
      lessonId: 'lesson-2',
      ready: true,
      containerRef,
    }));

    act(() => {
      observerCallback([{
        isIntersecting: true,
        target: block,
        boundingClientRect: { top: 0 },
      } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    unmount();

    expect(fetch).toHaveBeenCalledWith('/api/v1/learning-projects/project%2F1/activity', expect.objectContaining({
      method: 'PATCH',
      keepalive: true,
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }));
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      lessonId: 'lesson-2',
      blockId: 'block-2',
      blockOffset: 135,
    });
  });
});
