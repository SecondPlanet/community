/**
 * WebAssistantDrawer — 组件测试
 *
 * 覆盖:
 *   1. store.open=false 时不渲染
 *   2. store.open=true + user 已登录 + 无 session → 渲染"开始一个新对话"CTA
 *   3. 点 CTA → 调 chatApi.createSession + 切换 currentSessionId
 *   4. X 按钮 / backdrop / Esc → 调 closeDrawer
 *   5. 关闭后再开 → 保留 currentSessionId(zustand 内存)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebAssistantDrawer } from './WebAssistantDrawer';
import { useAuthStore } from '../../stores/authStore';
import { useWebAssistantStore } from '../../stores/webAssistantStore';
import type { AuthUser } from '../../stores/authStore';
import type { ChatSession } from '../../lib/chatApi';

// mock chatApi(vi.mock 会被 hoist 到 import 前)
// v1.9-alpha.2 (batch-5b C-02): 补流式导出 — streamChatMessage 用 vi.fn 按
// 用例注入; stripSourceMarkers 直接用与实现等价的简化版(测集成而非算法)。
vi.mock('../../lib/chatApi', () => ({
  chatApi: {
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    deleteSession: vi.fn(),
    // v1.9-alpha.2 (batch-6 A-08): 默认 enabled, 用例按需覆盖
    getCapabilities: vi.fn().mockResolvedValue({ enabled: true }),
  },
  streamChatMessage: vi.fn(),
  stripSourceMarkers: (t: string) =>
    t.replace(/\[\[src:[^\]]*\]\]/g, '').split('[[src:')[0],
}));

import { chatApi } from '../../lib/chatApi';

const mockUser: AuthUser = {
  id: 'u1',
  email: 'test@test.com',
  name: 'Test User',
  role: 'student',
};

const mockSessions: ChatSession[] = [
  {
    id: 's1',
    title: '第一场对话',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
    messageCount: 2,
  },
];

function renderDrawer() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // This component reads managed quick prompts. Keep the unit test isolated
  // from the live API while exercising the empty database state.
  qc.setQueryData(['cms', 'list', 'quick-prompts'], []);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WebAssistantDrawer />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useWebAssistantStore.setState({
    open: false,
    currentSessionId: null,
    messagesBySession: {},
    draftInput: '',
  });
  useAuthStore.setState({ user: null });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WebAssistantDrawer', () => {
  it('store.open=false 时不渲染', () => {
    const { container } = renderDrawer();
    expect(container.querySelector('[data-testid="web-assistant-drawer"]')).toBeNull();
  });

  it('store.open=true + user 已登录 + 无 session → 显示 EmptyState "开始一个新对话"', async () => {
    useAuthStore.setState({ user: mockUser });
    (chatApi.listSessions as any).mockResolvedValue([]);

    act(() => useWebAssistantStore.getState().openDrawer());
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByTestId('chat-empty-cta')).toBeInTheDocument();
    });
  });

  it('点 EmptyState 的 "开始一个新对话" CTA → 调 chatApi.createSession + 切 currentSessionId', async () => {
    useAuthStore.setState({ user: mockUser });
    (chatApi.listSessions as any).mockResolvedValue([]);
    (chatApi.createSession as any).mockResolvedValue({
      sessionId: 'new-sess-1',
      title: null,
    });
    (chatApi.getMessages as any).mockResolvedValue([]);

    act(() => useWebAssistantStore.getState().openDrawer());
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByTestId('chat-empty-cta')).toBeInTheDocument();
    });

    // click 触发 async handler, 用 await act 跨越 await 边界
    await act(async () => {
      screen.getByTestId('chat-empty-cta').click();
    });

    expect(chatApi.createSession).toHaveBeenCalled();
    expect(useWebAssistantStore.getState().currentSessionId).toBe('new-sess-1');
  });

  it('点 X 按钮 → closeDrawer', async () => {
    useAuthStore.setState({ user: mockUser });
    (chatApi.listSessions as any).mockResolvedValue(mockSessions);

    act(() => useWebAssistantStore.getState().openDrawer());
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByTestId('web-assistant-drawer')).toBeInTheDocument();
    });

    act(() => {
      // 多个 aria-label="关闭";用 last() 拿 header 里的 X
      const all = screen.getAllByLabelText('关闭');
      all[all.length - 1].click();
    });

    expect(useWebAssistantStore.getState().open).toBe(false);
  });

  it('点 backdrop → closeDrawer', async () => {
    useAuthStore.setState({ user: mockUser });
    (chatApi.listSessions as any).mockResolvedValue(mockSessions);

    act(() => useWebAssistantStore.getState().openDrawer());
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByTestId('web-assistant-drawer')).toBeInTheDocument();
    });

    act(() => {
      // backdrop 是第一个 aria-label="关闭"
      const all = screen.getAllByLabelText('关闭');
      all[0].click();
    });

    expect(useWebAssistantStore.getState().open).toBe(false);
  });

  it('ESC 键 → closeDrawer', async () => {
    useAuthStore.setState({ user: mockUser });
    (chatApi.listSessions as any).mockResolvedValue(mockSessions);

    act(() => useWebAssistantStore.getState().openDrawer());
    renderDrawer();

    await waitFor(() => {
      expect(useWebAssistantStore.getState().open).toBe(true);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    await waitFor(() => {
      expect(useWebAssistantStore.getState().open).toBe(false);
    });
  });

  it('"新对话" 按钮在 header → 调 createSession', async () => {
    useAuthStore.setState({ user: mockUser });
    (chatApi.listSessions as any).mockResolvedValue(mockSessions);
    (chatApi.createSession as any).mockResolvedValue({
      sessionId: 'header-sess',
      title: null,
    });
    (chatApi.getMessages as any).mockResolvedValue([]);

    act(() => useWebAssistantStore.getState().openDrawer());
    renderDrawer();

    await waitFor(() => {
      expect(screen.getByTestId('chat-header-new')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTestId('chat-header-new').click();
    });

    expect(chatApi.createSession).toHaveBeenCalled();
    expect(useWebAssistantStore.getState().currentSessionId).toBe('header-sess');
  });

  it('关闭后再开, currentSessionId 在 zustand 内存里保留', () => {
    useWebAssistantStore.setState({ currentSessionId: 'kept' });
    act(() => useWebAssistantStore.getState().openDrawer());
    expect(useWebAssistantStore.getState().currentSessionId).toBe('kept');
    act(() => useWebAssistantStore.getState().closeDrawer());
    expect(useWebAssistantStore.getState().currentSessionId).toBe('kept');
    act(() => useWebAssistantStore.getState().openDrawer());
    expect(useWebAssistantStore.getState().currentSessionId).toBe('kept');
  });

  // v1.9-alpha.2 (batch-5b C-02): drawer 的流式 handleSend 集成覆盖由
  // chatApi.test.ts (streamChatMessage + stripSourceMarkers) + chat.service.spec.ts
  // (streamAnswer 7 case) + chat.controller.spec.ts (SSE endpoint) 联合验证;
  // 这里 jsdom 集成测试因 zustand 持久化/QueryClient refetch 与 act 时机对不齐,
  // 单测 renderer 流式集成性价比低, 跳过。drawer 端的 stripSourceMarkers 行为
  // 通过 chatApi 测试覆盖。
});
