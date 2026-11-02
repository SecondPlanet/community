/**
 * Theme Store — 全局主题切换(zustand)
 *
 * 解决痛点:之前 Layout / DashboardLayout / AdminDashboardPage 各自 useState
 * 维护 theme,共享同一份 <html class="dark"> + localStorage('theme'),
 * 但 React 端互不感知,会出现 icon 显示跟实际 class 相反。
 *
 * 优势:
 *   - 单点状态:任何组件订阅 useThemeStore,状态一致
 *   - 自动同步:<html class="dark"> + localStorage
 *   - SSR safe:默认 light,客户端 mount 后读 localStorage
 *   - 系统偏好:首次访问读 prefers-color-scheme
 */
import { create } from 'zustand';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

// P1-fix (2026-10-15): 强制互斥管理 theme class。
// html 上同时存在 .dark + .light 时, .dark 选择器 (specificity 0,1,0) 覆盖
// :root 选择器 (0,0,1), CSS 变量被反转, 文字和背景变成同色 → 整页看不见。
// 这里每次都先 remove 再 add, 保证只有 'dark'(或空) 残留。
const THEME_CLASSES = ['dark', 'light'] as const;

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  if (theme === 'dark') {
    root.classList.add('dark');
  }
  root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/**
 * 初始化 theme(SSR-safe 启动时同步,放 index.tsx 顶部)
 * - 读 localStorage('theme')
 * - 读 system prefers-color-scheme
 * - 都不存在则 light
 */
export function initThemeFromStorage(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') {
      applyTheme(saved);
      useThemeStore.setState({ theme: saved });
      return saved;
    }
  } catch {
    /* localStorage 不可用 */
  }
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial: Theme = prefersDark ? 'dark' : 'light';
  applyTheme(initial);
  useThemeStore.setState({ theme: initial });
  return initial;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'light',
  toggle: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return { theme: next };
    }),
  set: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
}));

/** 便捷 hook,只取 theme */
export function useTheme(): Theme {
  return useThemeStore((s) => s.theme);
}
