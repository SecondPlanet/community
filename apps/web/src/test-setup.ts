/**
 * Vitest 测试 setup — 引入 @testing-library/jest-dom matchers
 *
 * 包括 matchers:
 *   - toBeInTheDocument
 *   - toHaveTextContent
 *   - toBeVisible
 *   - toHaveClass
 *   - 等等
 *
 * 2026-07-24 P1-8 错误页补全: jsdom 25 默认 url=about:blank 时 localStorage
 * 会 throw SecurityError, zustand 5 persist middleware 拿到 undefined storage
 * 后 setState 走 setItem 路径报「storage.setItem is not a function」。
 * 这里给 localStorage / sessionStorage 装 in-memory stub, 让 zustand persist
 * 正常工作。
 */
import '@testing-library/jest-dom/vitest';

// v1.9-alpha.2 (batch-8 fix): 每个测试后 cleanup RTL, 避免跨测试 DOM 残留
// (带 useState 的 admin 组件会在 test 之间留下 DOM, 干扰下一个测试的 getByRole)。
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => {
  cleanup();
});

// vite 在构建时定义 __APP_VERSION__,vitest 走 esbuild 不走 vite 的 define,
// 这里给 layout/site footer 用,任何 Layout 测试都需要它。
// vite-env.d.ts 已声明 global var;直接赋值即可。
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ =
  (globalThis as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ ?? '0.0.0-test';

// ───── jsdom localStorage / sessionStorage stub ─────
const makeStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
};

const installStorage = () => {
  // v1.5.3: localStorage 和 sessionStorage 各自独立 stub
  // (之前共用同一 stub, 导致 test 没法验证两个 storage 的隔离行为)
  const localStub = makeStorage();
  const sessionStub = makeStorage();
  try {
    Object.defineProperty(window, 'localStorage', {
      value: localStub,
      writable: true,
      configurable: true,
    });
  } catch {
    // jsdom 25 在 url=about:blank 时 localStorage 已经是只读 getter
    // 强制覆盖: 先 delete 再赋值
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).localStorage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).localStorage = localStub;
  }
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStub,
      writable: true,
      configurable: true,
    });
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).sessionStorage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).sessionStorage = sessionStub;
  }
};
installStorage();

// 每个 test 前重置 storage
import { beforeEach } from 'vitest';
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.localStorage as any)?.clear?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.sessionStorage as any)?.clear?.();
});
