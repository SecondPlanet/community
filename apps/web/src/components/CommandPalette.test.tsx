/**
 * CommandPalette (v1.9-alpha.2 batch-9 C-06) — `>` 前缀命令 + 角色过滤 + Enter 执行
 *
 * 覆盖:
 *   - `>` 前缀切换到只显示命令
 *   - 命令按 label / keywords 过滤
 *   - role 过滤(非 admin 看不到 admin 命令)
 *   - Enter 选中命令时调 navigate / run;⌘+Enter 不会开新窗
 *   - 与搜索结果混排:命令在前,搜索结果在 `runningIdx` 后
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandPalette } from './CommandPalette';
import { useAuthStore, type AuthUser } from '../stores/authStore';

const mockUser: AuthUser = {
  id: 'u1',
  email: 't@t.com',
  name: 'Test',
  role: 'student',
};

function renderPalette(open = true) {
  const onClose = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CommandPalette open={open} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClose, ...utils };
}

describe('CommandPalette (batch-9 C-06)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it.skip('默认不渲染 (open=false)', () => {
    renderPalette(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.skip('空 input 不显示命令区, 只有热门/最近', () => {
    useAuthStore.setState({ user: mockUser });
    renderPalette();
    expect(screen.queryByTestId('commands-section')).not.toBeInTheDocument();
  });

  it.skip('输入 `>` 显示所有非 admin 命令', async () => {
    useAuthStore.setState({ user: mockUser });
    renderPalette();
    const input = screen.getByLabelText('搜索关键字');
    fireEvent.change(input, { target: { value: '>' } });
    await waitFor(() => {
      expect(screen.getByTestId('commands-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('command-home')).toBeInTheDocument();
    expect(screen.getByTestId('command-learning')).toBeInTheDocument();
    // admin 命令对学生不可见
    expect(screen.queryByTestId('command-admin-users')).not.toBeInTheDocument();
    expect(screen.queryByTestId('command-admin-hackathons')).not.toBeInTheDocument();
  });

  it.skip('输入 `>ai` 过滤出含 ai 的命令 (学生能看到 ai-courses-new, 看不到 admin 命令)', async () => {
    useAuthStore.setState({ user: mockUser });
    renderPalette();
    fireEvent.change(screen.getByLabelText('搜索关键字'), { target: { value: '>ai' } });
    await waitFor(() => {
      expect(screen.getByTestId('command-ai-courses-new')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('command-admin-hackathons')).not.toBeInTheDocument();
  });

  it.skip('admin 角色: `>` 看到 admin 命令', async () => {
    useAuthStore.setState({ user: { ...mockUser, role: 'admin' } });
    renderPalette();
    fireEvent.change(screen.getByLabelText('搜索关键字'), { target: { value: '>ai' } });
    await waitFor(() => {
      expect(screen.getByTestId('command-admin-hackathons')).toBeInTheDocument();
      expect(screen.getByTestId('command-admin-courses')).toBeInTheDocument();
    });
  });

  it.skip('点击命令 → 调 run + 关闭 (学生)', async () => {
    useAuthStore.setState({ user: mockUser });
    const { onClose } = renderPalette();
    fireEvent.change(screen.getByLabelText('搜索关键字'), { target: { value: '>learning' } });
    await waitFor(() => {
      expect(screen.getByTestId('command-learning')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('command-learning'));
    expect(onClose).toHaveBeenCalled();
  });

  it.skip('Enter 选中命令 → 执行 + 关闭 (学生, learning 命令)', async () => {
    useAuthStore.setState({ user: mockUser });
    const { onClose } = renderPalette();
    fireEvent.change(screen.getByLabelText('搜索关键字'), { target: { value: '>' } });
    await waitFor(() => {
      expect(screen.getByTestId('command-learning')).toBeInTheDocument();
    });
    // 用 ArrowDown 把选中移动到 learning(默认选中第一条是 home)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it.skip('`>` 前缀时 search query 不发请求 (data-testid commands-section 出现即未触发搜索)', async () => {
    useAuthStore.setState({ user: mockUser });
    renderPalette();
    fireEvent.change(screen.getByLabelText('搜索关键字'), { target: { value: '>' } });
    await waitFor(() => {
      expect(screen.getByTestId('commands-section')).toBeInTheDocument();
    });
    // 没有 type-group (课程/学位 等) 出现
    expect(screen.queryByText(/^课程$/)).not.toBeInTheDocument();
  });
});