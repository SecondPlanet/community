/**
 * LoginPage — 登录页测试
 * 关注:
 *   - 表单字段 + 提交按钮渲染
 *   - zod 校验(邮箱格式 / 密码长度)
 *   - signIn(local) 成功 → toast + navigate(from | /admin)
 *   - 失败 → 错误 toast
 *   - 已登录访问 → 自动重定向(admin → /admin)
 *   - 第三方 provider 按钮动态渲染 + oauth-redirect 调用
 *   - 密码可见性切换
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthContext, type AuthContextValue } from '../../lib/auth/AuthContext';
import { ToastProvider } from '../../components/auth/Toast';
import { LoginPage } from './LoginPage';

// ───── 模块级 mock ─────
const signIn = vi.fn();

vi.mock('../../lib/cms', () => ({
  useSiteSettings: () => ({ data: undefined }),
  usePageSettings: () => ({ data: undefined }),
  useList: () => ({ data: undefined }),
  useEnum: () => ({}),
  useI18n: () => ({ t: (_k: string, fb: string) => fb }),
  pickPage: (_d: unknown, _k: string, _l: string, fb: string) => fb,
  pickSite: (_d: unknown, _k: string, _l: string, fb: string) => fb,
  createT: () => (_k: string, fb: string) => fb,
  pickLocalized: (v: string) => v,
  safeNavPath: (p: string) => p,
}));

vi.mock('../../lib/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { activeLearners: 0, totalCourses: 0, totalProjects: 0, totalDegrees: 0, activeHackathonCount: 0, currentTermLabel: '' } }) },
  api: { get: vi.fn().mockResolvedValue({ data: {} }) },
}));

// ───── 导航 mock(捕获跳转目标) ─────
const mockNavigate = vi.fn();
let mockLocationState: unknown = null;
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/auth/login', search: '', hash: '', key: 'k', state: mockLocationState }),
  };
});

// ───── webAssistant store mock ─────
const mockOpenDrawer = vi.fn();
let mockWebAssistantState: { open: boolean } = { open: false };
vi.mock('../../stores/webAssistantStore', () => ({
  useWebAssistantStore: (selector: (s: { open: boolean; openDrawer: () => void }) => unknown) =>
    selector({ open: mockWebAssistantState.open, openDrawer: mockOpenDrawer }),
}));

function baseSession(over: Record<string, unknown> = {}) {
  return {
    user: { id: 'u1', email: 'a@b.com', name: '测试', role: 'student', passwordResetRequired: false, ...over },
    accessToken: 'tok',
  };
}

function makeAuthValue(partial: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    identities: [],
    providers: [],
    signIn,
    signOut: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
    bindProvider: vi.fn().mockResolvedValue(undefined),
    unbindProvider: vi.fn().mockResolvedValue(undefined),
    isAuthenticating: false,
    ...partial,
  };
}

function renderLogin(auth: AuthContextValue, initialEntries = ['/auth/login']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          <ToastProvider>
            <AuthContext.Provider value={auth}>
              <LoginPage />
            </AuthContext.Provider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockOpenDrawer.mockReset();
  mockLocationState = null;
  mockWebAssistantState = { open: false };
  signIn.mockReset();
  // 默认成功会话,oauth-redirect 等用例可按需覆盖
  signIn.mockResolvedValue(baseSession());
});

describe('LoginPage', () => {
  it('渲染邮箱/密码表单与登录按钮', () => {
    renderLogin(makeAuthValue());
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    // 双 tab 都在
    expect(screen.getAllByText('登录').length).toBeGreaterThan(0);
    expect(screen.getByText('注册')).toBeInTheDocument();
  });

  it('空提交触发 zod 校验错误', async () => {
    renderLogin(makeAuthValue());
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('请输入有效邮箱')).toBeInTheDocument();
    expect(screen.getByText('请输入密码')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('非法邮箱 + 空密码被拦截', async () => {
    renderLogin(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('请输入有效邮箱')).toBeInTheDocument();
    expect(screen.getByText('请输入密码')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('登录成功 → 携带 local 参数调用 signIn 并跳转 from(默认 /)', async () => {
    signIn.mockResolvedValue(baseSession());
    renderLogin(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ kind: 'local', email: 'a@b.com', password: 'secret1' }));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(await screen.findByText('登录成功')).toBeInTheDocument();
  });

  it('admin 登录成功后跳转 /admin', async () => {
    signIn.mockResolvedValue(baseSession({ role: 'admin' }));
    renderLogin(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true }));
  });

  it('从 ?from= 参数读取重定向目标', async () => {
    signIn.mockResolvedValue(baseSession());
    renderLogin(makeAuthValue(), ['/auth/login?from=/dashboard/learning/course-1']);
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/learning/course-1', { replace: true }));
  });

  it('v1.9-alpha.1 (B-02) state.from === "web-assistant" 登录后触发 openDrawer', async () => {
    mockLocationState = { from: 'web-assistant' };
    signIn.mockResolvedValue(baseSession());
    renderLogin(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mockOpenDrawer).toHaveBeenCalledTimes(1));
    // 'web-assistant' 不是路由,fallback 仍走 from 默认值 '/'
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('v1.9-alpha.1 (B-02) state.from 是路径字符串时,登录后只跳转不 openDrawer', async () => {
    mockLocationState = { from: '/dashboard/learning' };
    signIn.mockResolvedValue(baseSession());
    renderLogin(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/learning', { replace: true }));
    expect(mockOpenDrawer).not.toHaveBeenCalled();
  });

  it('登录失败 → 展示后端错误 message(行内 + toast)', async () => {
    signIn.mockRejectedValue({ response: { data: { message: '账号被禁用' } } });
    renderLogin(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect((await screen.findAllByText('账号被禁用')).length).toBeGreaterThan(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('已登录 admin 访问登录页自动重定向到 /admin(不请求 isAuthenticating)', async () => {
    renderLogin(
      makeAuthValue({
        user: { id: 'u1', email: 'a@b.com', name: '管理', role: 'admin', passwordResetRequired: false },
      }),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true }));
  });

  it('第三方 provider 存在时渲染按钮并走 oauth-redirect', () => {
    renderLogin(
      makeAuthValue({
        providers: [
          { id: 'google', label: 'Google', type: 'oauth', enabled: true },
          { id: 'email_password', label: '邮箱', type: 'email_password', enabled: true },
        ],
      }),
    );
    expect(screen.getByText('或使用邮箱')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '用 Google 登录' }));
    expect(signIn).toHaveBeenCalledWith({ kind: 'oauth-redirect', provider: 'google' });
  });

  it('密码可见性切换 button 切换 type', () => {
    renderLogin(makeAuthValue());
    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: '显示密码' }));
    expect((screen.getByPlaceholderText('••••••••') as HTMLInputElement).type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: '隐藏密码' }));
    expect((screen.getByPlaceholderText('••••••••') as HTMLInputElement).type).toBe('password');
  });
});