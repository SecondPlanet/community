/**
 * webAssistantStore — v1.5.3 持久化策略回归测试
 *
 * 锁定:
 *   1. setCurrentSession(id) → sessionStorage('webAssistant.currentSessionId') 写入
 *   2. reset() → sessionStorage 清空 + 全部 state 回初值
 *   3. 当前 store 不再读 localStorage (改 sessionStorage 行为)
 *   4. logout 流程: Layout.handleLogout 调 reset() 后, 任何残留 sessionId 清空
 *
 * 注: 改 localStorage → sessionStorage (v1.5.3 决策) 原因:
 *   共享设备/同浏览器换账号时, account A 的 sessionId 不能污染 account B
 *   (b8cc017 P0 verifier audit 2026-07-24 反馈, Frank 实际场景)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useWebAssistantStore } from './webAssistantStore';

const STORAGE_KEY = 'webAssistant.currentSessionId';

describe('webAssistantStore — v1.5.3 持久化策略', () => {
  beforeEach(() => {
    // 每个 test 前清 sessionStorage + 重置 store state
    window.sessionStorage.clear();
    useWebAssistantStore.getState().reset();
  });

  it('初始: sessionStorage 无残留时, currentSessionId 为 null', () => {
    expect(useWebAssistantStore.getState().currentSessionId).toBeNull();
  });

  it('setCurrentSession: 写 sessionStorage', () => {
    useWebAssistantStore.getState().setCurrentSession('session-123');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('session-123');
    expect(useWebAssistantStore.getState().currentSessionId).toBe('session-123');
  });

  it('setCurrentSession(null): 清 sessionStorage', () => {
    useWebAssistantStore.getState().setCurrentSession('session-456');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('session-456');
    useWebAssistantStore.getState().setCurrentSession(null);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('reset: 清 sessionStorage + 全部 state 回初值', () => {
    const store = useWebAssistantStore.getState();
    store.setCurrentSession('session-789');
    store.setMessages('session-789', [
      { id: 'm1', role: 'user', content: 'hi', createdAt: '2026-07-25' },
    ]);
    store.setDraftInput('draft text');
    store.openDrawer();

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('session-789');

    // 模拟 Layout.handleLogout 调 reset
    useWebAssistantStore.getState().reset();

    const after = useWebAssistantStore.getState();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(after.currentSessionId).toBeNull();
    expect(after.messagesBySession).toEqual({});
    expect(after.draftInput).toBe('');
    expect(after.open).toBe(false);
  });

  it('不写 localStorage (回归锁定: v1.5.3 改后只走 sessionStorage)', () => {
    useWebAssistantStore.getState().setCurrentSession('session-abc');
    // sessionStorage 写了
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('session-abc');
    // localStorage 没写 (key 在 localStorage 必须为 null)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('appendMessage / clearMessages 行为锁定', () => {
    const store = useWebAssistantStore.getState();
    const msg = {
      id: 'm1',
      role: 'user' as const,
      content: 'hi',
      createdAt: '2026-07-25',
    };

    store.appendMessage('s1', msg);
    expect(useWebAssistantStore.getState().messagesBySession['s1']).toEqual([msg]);

    const msg2 = {
      id: 'm2',
      role: 'assistant' as const,
      content: 'hello',
      createdAt: '2026-07-25',
    };
    store.appendMessage('s1', msg2);
    expect(useWebAssistantStore.getState().messagesBySession['s1']).toHaveLength(2);

    store.clearMessages('s1');
    expect(useWebAssistantStore.getState().messagesBySession['s1']).toBeUndefined();
  });
});
