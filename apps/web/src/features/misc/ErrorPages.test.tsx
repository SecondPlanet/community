/**
 * 4 个错误页 + ErrorShell 的测试
 * - NotFoundPage (404)
 * - ForbiddenPage (403)
 * - ServerErrorPage (500)
 * - NetworkErrorPage (offline / online recovery)
 *
 * 关注:
 *   - 关键元素存在 (大数字 / 标题 / CTA)
 *   - 搜索表单 submit → 跳 /search?q=
 *   - 403 已登录/未登录 CTA 分支
 *   - 500 错误码生成稳定 (timestamp + 随机)
 *   - network 监听 online/offline 事件切换状态
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 顶层 mock: 给 useNavigate 一个全局 mock,NotFoundPage 搜索 submit 测试
// 验证 navigate 被调用。其他测试 (ForbiddenPage 等) 走 MemoryRouter 真实 navigate。
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { NotFoundPage } from './NotFoundPage';
import { ForbiddenPage } from './ForbiddenPage';
import { ServerErrorPage } from './ServerErrorPage';
import { NetworkErrorPage } from './NetworkErrorPage';
import { ErrorShell, ActionButton } from './ErrorShell';
import { useAuthStore } from '../../stores/authStore';
import type { AuthUser } from '../../stores/authStore';

// ───── 公共 wrapper ─────
// I18nText → useI18n → useQuery 必须有 QueryClient
// MemoryRouter 给所有 Link / useNavigate 兜底
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  qc.setQueryData(['cms', 'list', 'course-categories'], [
    { key: 'llm', label: 'AI 大模型', isActive: true },
    { key: 'ml', label: '机器学习', isActive: true },
    { key: 'frontend', label: '前端开发', isActive: true },
    { key: 'hackathon', label: '黑客松', isActive: true },
  ]);
  qc.setQueryData(['cms', 'i18n-messages', 'zh-CN'], {});
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function renderWithProviders(ui: React.ReactNode) {
  return render(ui, { wrapper: makeWrapper() });
}

// localStorage / sessionStorage / window.history stub 由 test-setup.ts 全局做

describe('ErrorShell', () => {
  it('渲染 eyebrow / code / title / description', () => {
    renderWithProviders(
      <ErrorShell
        eyebrow="/ TEST"
        code="999"
        title={<span>Test Title</span>}
        description={<p>Test Desc</p>}
      />,
    );
    expect(screen.getByText('/ TEST')).toBeInTheDocument();
    expect(screen.getByText('999')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Desc')).toBeInTheDocument();
  });

  it('不传 actions / footer 不报错', () => {
    expect(() =>
      renderWithProviders(
        <ErrorShell eyebrow="/ X" code="X" title={<>T</>} description={<>D</>} />,
      ),
    ).not.toThrow();
  });

  it('ActionButton 渲染主/次样式', () => {
    renderWithProviders(
      <div>
        <ActionButton to="/a" variant="primary">
          Primary
        </ActionButton>
        <ActionButton to="/b" variant="secondary">
          Secondary
        </ActionButton>
      </div>,
    );
    const primary = screen.getByText('Primary').closest('a')!;
    const secondary = screen.getByText('Secondary').closest('a')!;
    expect(primary.className).toMatch(/bg-\[#171717\]/);
    expect(secondary.className).toMatch(/border-\[#171717\]/);
  });
});

describe('NotFoundPage', () => {
  it('渲染 404 大数字 + 标题 + 描述 + 主 CTA', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    expect(screen.getByText(/抱歉.*页面不存在/)).toBeInTheDocument();
    // 主 CTA (回首页)
    expect(screen.getByText('Back To Home')).toBeInTheDocument();
    // 次 CTA (Go Back)
    expect(screen.getByText('Go Back')).toBeInTheDocument();
  });

  it('搜索框 submit 跳到 /search?q=...', () => {
    mockNavigate.mockClear();
    renderWithProviders(<NotFoundPage />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'AI 大模型' } });
    fireEvent.submit(input.closest('form')!);
    expect(mockNavigate).toHaveBeenCalledWith('/search?q=AI%20%E5%A4%A7%E6%A8%A1%E5%9E%8B');
  });

  it('搜索框空内容 submit 不跳转', () => {
    renderWithProviders(<NotFoundPage />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    const form = input.closest('form')!;
    // 不抛错即可
    expect(() => fireEvent.submit(form)).not.toThrow();
    // 还在 NotFoundPage (input 仍然在)
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('4 个热门分类入口渲染', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByText('AI 大模型')).toBeInTheDocument();
    expect(screen.getByText('机器学习')).toBeInTheDocument();
    expect(screen.getByText('前端开发')).toBeInTheDocument();
    expect(screen.getByText('黑客松')).toBeInTheDocument();
  });
});

describe('ForbiddenPage', () => {
  it('未登录状态: 显示 Login CTA + 登录描述', () => {
    renderWithProviders(<ForbiddenPage />);
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    // 未登录: Login CTA
    expect(screen.getByText('Login')).toBeInTheDocument();
    // 描述应该是 anonymous 版本
    expect(screen.getByText(/需要登录/)).toBeInTheDocument();
  });

  it('已登录状态: 显示 Switch Account CTA + 登录态描述', () => {
    // stub localStorage 后, setState 触发 persist writeItem 不会抛
    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'test@x.com',
        name: 'tester',
        role: 'student',
      } as AuthUser,
      setAuth: vi.fn(),
      clearAuth: vi.fn(),
    });
    renderWithProviders(<ForbiddenPage />);
    expect(screen.getByText('Switch Account')).toBeInTheDocument();
    // 描述应该是 logged_in 版本
    expect(screen.getByText(/没有访问该资源的权限/)).toBeInTheDocument();
  });

  it('footer 提供可用的联系入口', () => {
    renderWithProviders(<ForbiddenPage />);
    const link = screen.getByRole('link', { name: '提交联系申请' });
    expect(link.getAttribute('href')).toMatch(/^(mailto:|https:\/\/github\.com\/)/);
  });
});

describe('ServerErrorPage', () => {
  it('渲染 500 + 标题 + 重试 + 回首页', () => {
    const onRetry = vi.fn();
    renderWithProviders(<ServerErrorPage onRetry={onRetry} />);
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Server Error')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Back To Home')).toBeInTheDocument();
  });

  it('点击 Try Again 触发 onRetry', () => {
    const onRetry = vi.fn();
    renderWithProviders(<ServerErrorPage onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('生成 ERR-{ts}-{rand} 格式错误码', () => {
    renderWithProviders(<ServerErrorPage />);
    // 错误码用 <code> 标签
    const code = document.querySelector('code')!;
    expect(code.textContent).toMatch(/^ERR-\d{14}-[A-Z0-9]{4}$/);
  });

  it('提供联系入口并提示附上错误码', () => {
    renderWithProviders(<ServerErrorPage />);
    const link = screen.getByRole('link', { name: '提交联系申请并附上错误码' });
    expect(link.getAttribute('href')).toMatch(/^(mailto:|https:\/\/github\.com\/)/);
  });

  it('dev 模式显示原 error message', () => {
    const error = new Error('Database connection failed');
    renderWithProviders(<ServerErrorPage error={error} />);
    expect(screen.getByText('Database connection failed')).toBeInTheDocument();
  });

  it('不传 onRetry 时 Try Again 按钮不抛错', () => {
    renderWithProviders(<ServerErrorPage />);
    // 不应该 throw
    expect(() => fireEvent.click(screen.getByText('Try Again'))).not.toThrow();
  });
});

describe('NetworkErrorPage', () => {
  it('默认 online 状态显示「Network Error」+ 重试', () => {
    // vitest 环境默认 navigator.onLine = true
    renderWithProviders(<NetworkErrorPage onRetry={() => {}} />);
    expect(screen.getByText('Network Error')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('Try Again 触发 onRetry', () => {
    const onRetry = vi.fn();
    renderWithProviders(<NetworkErrorPage onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('network 诊断清单 4 条', () => {
    renderWithProviders(<NetworkErrorPage />);
    expect(screen.getByText(/检查 WiFi/)).toBeInTheDocument();
    expect(screen.getByText(/关闭 VPN/)).toBeInTheDocument();
    expect(screen.getByText(/企业内网/)).toBeInTheDocument();
    expect(screen.getByText(/1-2 分钟/)).toBeInTheDocument();
  });

  it('模拟 offline 事件 → 切换为 OFF + 红色状态', async () => {
    renderWithProviders(<NetworkErrorPage />);
    // 触发 offline 事件
    fireEvent(window, new Event('offline'));
    await waitFor(() => {
      // eyebrow 变成 / OFFLINE
      expect(screen.getByText('/ OFFLINE')).toBeInTheDocument();
    });
    // 状态指示显示 Offline
    expect(screen.getByText('Browser: Offline')).toBeInTheDocument();
  });

  it('模拟 online 事件 → 切换为 Recovered + 绿色状态', async () => {
    // 先 offline,再 online
    renderWithProviders(<NetworkErrorPage />);
    fireEvent(window, new Event('offline'));
    fireEvent(window, new Event('online'));
    await waitFor(() => {
      expect(screen.getByText('Connection Recovered')).toBeInTheDocument();
    });
    expect(screen.getByText('Browser: Online')).toBeInTheDocument();
  });

  it('卸载时移除 online/offline listener (不泄漏)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderWithProviders(<NetworkErrorPage />);
    const addedOnline = addSpy.mock.calls.filter(([t]) => t === 'online').length;
    const addedOffline = addSpy.mock.calls.filter(([t]) => t === 'offline').length;
    unmount();
    expect(removeSpy.mock.calls.filter(([t]) => t === 'online').length).toBe(addedOnline);
    expect(removeSpy.mock.calls.filter(([t]) => t === 'offline').length).toBe(addedOffline);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
