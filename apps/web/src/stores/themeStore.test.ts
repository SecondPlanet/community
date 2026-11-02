import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useThemeStore, initThemeFromStorage } from './themeStore';

// 在每个 test 替换 localStorage,然后恢复
let storageMock: Record<string, string> = {};

beforeEach(() => {
  storageMock = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => storageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storageMock[key];
      }),
    },
    writable: true,
    configurable: true,
  });
  useThemeStore.setState({ theme: 'light' });
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('themeStore', () => {
  it('initThemeFromStorage 默认返回 light (无 localStorage)', () => {
    const theme = initThemeFromStorage();
    expect(theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('initThemeFromStorage 读 localStorage "dark"', () => {
    storageMock.theme = 'dark';
    const theme = initThemeFromStorage();
    expect(theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('initThemeFromStorage 读 localStorage "light"', () => {
    storageMock.theme = 'light';
    initThemeFromStorage();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggle 切 light → dark → light', () => {
    useThemeStore.setState({ theme: 'light' });
    expect(useThemeStore.getState().theme).toBe('light');

    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(storageMock.theme).toBe('dark');

    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(storageMock.theme).toBe('light');
  });

  it('set 直接设', () => {
    useThemeStore.setState({ theme: 'light' });
    useThemeStore.getState().set('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(storageMock.theme).toBe('dark');
  });
});
