/**
 * ProfilePage — 个人中心页测试
 * 关注:
 *   - 用户头部(头像首字母 / 姓名 / 邮箱 / 角色徽章 / Lv)
 *   - 4 个统计卡(课时 / 连续学习 / 徽章 / 积分)
 *   - 6 个个人服务入口
 *   - 编辑资料:打开表单 → 空名拦截 → 保存调 PATCH + updateUser + 成功提示
 *   - 退出登录 → signOut + 跳首页
 *   - admin 显示管理后台入口;徽章墙 / 空课程态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextValue } from '../../lib/auth/AuthContext';
import { ProfilePage } from './ProfilePage';

const signOut = vi.fn().mockResolvedValue(undefined);
const updateUser = vi.fn();

vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    patch: vi.fn().mockResolvedValue({ data: { name: '新名字' } }),
  },
}));
vi.mock('../../lib/progressApi', () => ({
  progressApi: {
    getMyStats: vi.fn().mockResolvedValue({
      totalCompletedLessons: 12,
      streakDays: 3,
      activity: [{ date: '2026-08-30', count: 2 }],
    }),
    getCourseProgress: vi.fn().mockResolvedValue({
      courseId: 'course-1', totalLessons: 10, completedLessons: 4, percent: 40, isCompleted: false,
    }),
  },
}));
vi.mock('../../lib/pointsApi', () => ({
  pointsApi: {
    getMyPoints: vi.fn().mockResolvedValue({
      points: 250, level: 2, currentLevelPoints: 100, nextLevelPoints: 400, pointsToNextLevel: 150, recentTransactions: [],
    }),
  },
}));
vi.mock('../../lib/badgesApi', () => ({
  badgesApi: {
    getMyBadges: vi.fn().mockResolvedValue([
      { id: 'b1', name: '初来乍到', description: '完成注册', target: 1, progress: 1, unlocked: true },
      { id: 'b2', name: '课程达人', description: '完成 5 门课', target: 5, progress: 2, unlocked: false },
    ]),
  },
}));

import api from '../../lib/api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeAuthValue(partial: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: { id: 'user-1', email: 'stu@example.com', name: '小明', role: 'student', passwordResetRequired: false },
    identities: [],
    providers: [],
    signIn: vi.fn(),
    signOut,
    updateUser,
    bindProvider: vi.fn().mockResolvedValue(undefined),
    unbindProvider: vi.fn().mockResolvedValue(undefined),
    isAuthenticating: false,
    ...partial,
  };
}

function renderProfile(auth: AuthContextValue = makeAuthValue()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile']}>
        <AuthContext.Provider value={auth}>
          <ProfilePage />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  updateUser.mockReset();
  signOut.mockClear();
  vi.mocked(api.get).mockResolvedValue({ data: [] });
  vi.mocked(api.patch).mockResolvedValue({ data: { name: '新名字' } });
});

describe('ProfilePage', () => {
  it('渲染用户头部:姓名 / 邮箱 / 学员徽章 / 等级', async () => {
    renderProfile();
    expect(screen.getByRole('heading', { level: 1, name: '小明' })).toBeInTheDocument();
    expect(screen.getByText('stu@example.com')).toBeInTheDocument();
    expect(screen.getByText('学员')).toBeInTheDocument();
    expect((await screen.findAllByText('Lv.2')).length).toBeGreaterThan(0);
  });

  it('渲染 4 个统计卡(取自 stats / 徽章 / 积分)', async () => {
    renderProfile();
    expect(await screen.findByText('12')).toBeInTheDocument(); // 已完成课时
    expect(screen.getByText('3 天')).toBeInTheDocument(); // 连续学习
    expect(await screen.findByText('1/2')).toBeInTheDocument(); // 已获徽章
    expect((await screen.findAllByText('250')).length).toBeGreaterThan(0); // 我的积分
  });

  it('渲染 6 个个人服务入口链接', () => {
    renderProfile();
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    for (const href of [
      '/dashboard',
      '/dashboard/notifications',
      '/dashboard/orders',
      '/dashboard/certificates',
      '/dashboard/settings/bindings',
      '/dashboard/settings/ai',
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it('编辑资料:打开表单,空姓名提示,保存成功调 PATCH + updateUser', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /编辑资料/ }));
    expect(screen.getByText('显示姓名')).toBeInTheDocument();

    // 清空姓名:按钮 disabled,无法提交空名
    const nameInput = screen.getByDisplayValue('小明');
    fireEvent.change(nameInput, { target: { value: '' } });
    const save = screen.getByRole('button', { name: /保存修改/ });
    expect(save).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: '新名字' } });
    fireEvent.click(screen.getByRole('button', { name: /保存修改/ }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/v1/users/user-1', { name: '新名字' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ name: '新名字' }));
    expect(await screen.findByText('个人资料已更新')).toBeInTheDocument();
  });

  it('退出登录:signOut 后跳转首页', async () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('admin 显示管理后台入口,student 不显示', () => {
    const { unmount } = renderProfile();
    expect(screen.queryByRole('link', { name: /管理后台/ })).not.toBeInTheDocument();
    unmount();

    renderProfile(makeAuthValue({
      user: { id: 'u2', email: 'ad@example.com', name: '阿管', role: 'admin', passwordResetRequired: false },
    }));
    expect(screen.getByText('管理员')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /管理后台/ })).toHaveAttribute('href', '/admin');
  });

  it('徽章墙渲染已解锁与进行中的徽章', async () => {
    renderProfile();
    expect(await screen.findByText('初来乍到')).toBeInTheDocument();
    expect(screen.getByText('已解锁')).toBeInTheDocument();
    expect(screen.getByText('课程达人')).toBeInTheDocument();
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('未报名任何课程时展示空态与浏览课程 CTA', async () => {
    renderProfile();
    expect(await screen.findByText('还没有报名课程')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /浏览课程/ })).toHaveAttribute('href', '/courses');
  });
});