import { RefObject, useEffect, useRef } from 'react';
import { getAccessToken } from '../../../lib/api';
import { aiCoursesApi } from '../aiCoursesApi';

interface LessonActivityOptions {
  projectId: string;
  lessonId: string;
  ready: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialBlockId?: string | null;
  initialBlockOffset?: number | null;
}

const REPORT_INTERVAL_MS = 10_000;

export function useLessonActivity({
  projectId,
  lessonId,
  ready,
  containerRef,
  initialBlockId,
  initialBlockOffset,
}: LessonActivityOptions) {
  const latestRef = useRef<{ blockId: string; blockOffset: number } | null>(null);
  const lastSentRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const restoredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    latestRef.current = null;
    lastSentRef.current = 0;
    const container = containerRef.current;
    const restoreKey = `${projectId}:${lessonId}:${initialBlockId ?? ''}`;
    if (restoredKeyRef.current !== restoreKey) {
      restoredKeyRef.current = restoreKey;
      const block = initialBlockId
        ? [...container.querySelectorAll<HTMLElement>('[data-block-id]')]
          .find((candidate) => candidate.dataset.blockId === initialBlockId) ?? null
        : null;
      if (block) {
        block.scrollIntoView?.({ block: 'start' });
        if (initialBlockOffset) container.scrollBy?.({ top: initialBlockOffset });
      } else {
        container.scrollTo?.({ top: 0 });
      }
    }

    if (typeof IntersectionObserver === 'undefined') return;

    const send = () => {
      const latest = latestRef.current;
      if (!latest) return;
      lastSentRef.current = Date.now();
      void aiCoursesApi.updateActivity(projectId, {
        lessonId,
        blockId: latest.blockId,
        blockOffset: latest.blockOffset,
        occurredAt: new Date().toISOString(),
      }).catch(() => undefined);
    };
    const schedule = () => {
      const wait = REPORT_INTERVAL_MS - (Date.now() - lastSentRef.current);
      if (wait <= 0) send();
      else if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          send();
        }, wait);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => Math.abs(left.boundingClientRect.top) - Math.abs(right.boundingClientRect.top))[0];
      const element = visible?.target as HTMLElement | undefined;
      const blockId = element?.dataset.blockId;
      if (!element || !blockId) return;
      latestRef.current = {
        blockId,
        blockOffset: Math.max(0, Math.round(container.scrollTop - element.offsetTop)),
      };
      schedule();
    }, { root: container, rootMargin: '0px 0px -70% 0px', threshold: [0, 0.01] });
    container.querySelectorAll<HTMLElement>('[data-block-id]').forEach((block) => observer.observe(block));

    const flush = () => {
      const latest = latestRef.current;
      if (!latest) return;
      const token = getAccessToken();
      void fetch(`/api/v1/learning-projects/${encodeURIComponent(projectId)}/activity`, {
        method: 'PATCH',
        keepalive: true,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          lessonId,
          blockId: latest.blockId,
          blockOffset: latest.blockOffset,
          occurredAt: new Date().toISOString(),
        }),
      });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      // Client-side route changes do not emit pagehide. Flush before clearing
      // the timer so a short visit still records its latest visible block.
      flush();
      observer.disconnect();
      window.removeEventListener('pagehide', flush);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [containerRef, initialBlockId, initialBlockOffset, lessonId, projectId, ready]);
}
