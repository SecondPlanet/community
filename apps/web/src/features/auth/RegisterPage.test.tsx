/**
 * RegisterPage — 注册页测试
 * 关注:
 *   - 4 字段 + 提交按钮
 *   - zod 校验:姓名 / 邮箱 / 复杂度密码(≥12 位·大小写·数字·符号)/ 确认密码一致
 *   - 提交流程:POST /auth/register → signIn(local) → toast + navigate('/')
 *   - 失败 → 错误 toast
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthContext, type AuthContextValue } from '../../lib/auth/AuthContext';
import { ToastProvider } from '../../components/auth/Toast';
import { RegisterPage } from './RegisterPage';

const signIn = vi.fn();
const apiPost = vi.fn().mockResolvedValue({ data: {} });

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
  default: {
    get: vi.fn().mockResolvedValue({
      data: { activeLearners: 0, totalCourses: 0, totalProjects: 0, totalDegrees: 0, activeHackathonCount: 0, currentTermLabel: '' },
    }),
  },
  api: {
    post: (...args: unknown[]) => apiPost(...(args as Parameters<typeof apiPost>)),
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});

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

function renderRegister(auth: AuthContextValue) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/auth/register']}>
          <ToastProvider>
            <AuthContext.Provider value={auth}>
              <RegisterPage />
            </AuthContext.Provider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

const VALID = { name: '张三', email: 'a@b.com', password: 'Abcdef1!xyzw', confirmPassword: 'Abcdef1!xyzw' };

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText('你的姓名'), { target: { value: VALID.name } });
  fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: VALID.email } });
  fireEvent.change(screen.getByPlaceholderText('至少 12 位'), { target: { value: VALID.password } });
  fireEvent.change(screen.getByPlaceholderText('再输入一次'), { target: { value: VALID.confirmPassword } });
  fireEvent.click(screen.getByRole('button', { name: '创建账号' }));
}

beforeEach(() => {
  mockNavigate.mockReset();
  signIn.mockReset();
  apiPost.mockReset();
  apiPost.mockResolvedValue({ data: {} });
  signIn.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com', name: '张三', role: 'student', passwordResetRequired: false }, accessToken: 'tok' });
});

describe('RegisterPage', () => {
  it('渲染 4 个字段与注册按钮,tab 高亮 register', () => {
    renderRegister(makeAuthValue());
    expect(screen.getByText('创建账号', { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('你的姓名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('至少 12 位')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('再输入一次')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '注册' })).toHaveAttribute('aria-selected', 'true');
  });

  it('空提交触发全部校验错误', async () => {
    renderRegister(makeAuthValue());
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByText('请输入姓名')).toBeInTheDocument();
    expect(screen.getByText('请输入有效邮箱')).toBeInTheDocument();
    expect(screen.getByText('密码至少 12 位')).toBeInTheDocument();
    expect(screen.getByText('确认密码至少 12 位')).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('弱密码被逐条拦截(缺符号)', async () => {
    renderRegister(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('你的姓名'), { target: { value: '张三' } });
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('至少 12 位'), { target: { value: 'Abcdef123456' } });
    fireEvent.change(screen.getByPlaceholderText('再输入一次'), { target: { value: 'Abcdef123456' } });
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByText('密码必须包含符号')).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('两次密码不一致被拦截', async () => {
    renderRegister(makeAuthValue());
    fireEvent.change(screen.getByPlaceholderText('你的姓名'), { target: { value: '张三' } });
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('至少 12 位'), { target: { value: VALID.password } });
    fireEvent.change(screen.getByPlaceholderText('再输入一次'), { target: { value: 'Different1!xx' } });
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('提交成功 → POST /auth/register + signIn(local) + 跳转 onboarding', async () => {
    renderRegister(makeAuthValue());
    fillAndSubmit();

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/v1/auth/register', {
        email: VALID.email,
        password: VALID.password,
        name: VALID.name,
      });
    });
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({ kind: 'local', email: VALID.email, password: VALID.password }),
    );
    expect(await screen.findByText('注册成功, 欢迎加入!')).toBeInTheDocument();
    // C-07 方案 A: 注册成功 → 落地 onboarding 引导页,由 CreateAiCoursePage
    // 判定是否已有 LearningProject 来跳过 onboarding 直接落 dashboard。
    expect(mockNavigate).toHaveBeenCalledWith('/ai-courses/new?onboarding=1', { replace: true });
  });

  it('注册接口失败 → 展示后端错误 message toast', async () => {
    apiPost.mockRejectedValue({ response: { data: { message: '该邮箱已注册' } } });
    renderRegister(makeAuthValue());
    fillAndSubmit();

    expect(await screen.findByText('该邮箱已注册')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});