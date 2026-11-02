/**
 * useCollapsibleHero — 顶部 hero 收起/展开 hook
 *
 * 行为(iOS Safari / Twitter 风格):
 *   - 用户向下滚动超过 threshold → hero 收起 (返回 isCollapsed=true)
 *   - 用户向上滚动超过 revealDelta → hero 展开 (返回 isCollapsed=false)
 *   - 滚动距离 < threshold 时不触发(避免页面顶部误触收起)
 *   - revealDelta > 阈值(下滚)防止微小滚动抖动触发频繁切换
 *
 * 用法:
 *   const { ref, isCollapsed } = useCollapsibleHero<HTMLElement>({ threshold: 120 });
 *   <section
 *     ref={ref}
 *     className={cn('overflow-hidden transition-all duration-300 ease-out',
 *                   isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1200px] opacity-100',
 *                   '<原 className>')}
 *   >
 *     ...hero 内容...
 *   </section>
 *
 * 设计选择:
 *   - 用 rAF 节流 scroll,避免每帧 60+ 次状态更新
 *   - passive scroll listener,不阻塞滚动
 *   - max-h-[1200px] 足够大(实际 hero 高度 600-800),transition 性能可接受
 *   - 收起时同时降 opacity,避免内容瞬间消失的突兀感
 *   - 用 isCollapsedRef 镜像 React state,避免 re-render 期间
 *     (max-h 0 引起 viewport 收缩 → scrollY 反向变化 → 误判展开) 的循环
 *
 * 不引入新依赖(framer-motion 太大,自己 rAF + CSS transition 足够)。
 */

import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseCollapsibleHeroOptions {
  /** 滚过这个距离(px)后才允许收起, 默认 120 */
  threshold?: number;
  /** 上滚多少 px 才触发展开(避免误触抖动), 默认 12 */
  revealDelta?: number;
}

export interface UseCollapsibleHeroResult<T> {
  ref: RefObject<T>;
  isCollapsed: boolean;
}

export function useCollapsibleHero<T extends HTMLElement = HTMLElement>(
  options: UseCollapsibleHeroOptions = {},
): UseCollapsibleHeroResult<T> {
  const { threshold = 120, revealDelta = 12 } = options;
  const ref = useRef<T>(null);
  const [isCollapsed, setCollapsed] = useState(false);
  const lastYRef = useRef(0);
  // 镜像 isCollapsed 状态,供 rAF 内读取,避免 setCollapsed 引起的
  // re-render → DOM reflow → scrollY 反向变化 → 误判反向 scroll → setCollapsed(false) 死循环
  const isCollapsedRef = useRef(false);

  useEffect(() => {
    // SSR / 测试环境兜底
    if (typeof window === 'undefined') return;
    lastYRef.current = window.scrollY;

    let rafId = 0;
    // 收起/展开后,React re-render → DOM 高度变 → viewport 收缩/扩张 →
    // 浏览器触发新 scroll event(scrollY 反向变化),会被错判为"用户反向滚"
    // → 立刻反向 setCollapsed → 死循环。
    // 解决:收起/展开后短暂静默 (~200ms,覆盖 transition 中段) 忽略 scroll。
    let settleUntil = 0;
    const SETTLE_MS = 220;

    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        // settle 期:只更新 lastY,不切状态
        if (Date.now() < settleUntil) {
          lastYRef.current = window.scrollY;
          return;
        }
        const y = window.scrollY;
        const delta = y - lastYRef.current;
        if (delta > 0 && y > threshold && !isCollapsedRef.current) {
          isCollapsedRef.current = true;
          setCollapsed(true);
          settleUntil = Date.now() + SETTLE_MS;
        } else if (delta < -revealDelta && isCollapsedRef.current) {
          isCollapsedRef.current = false;
          setCollapsed(false);
          settleUntil = Date.now() + SETTLE_MS;
        }
        lastYRef.current = y;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
    };
  }, [threshold, revealDelta]);

  return { ref, isCollapsed };
}
