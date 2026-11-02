/**
 * HackathonListPage — 黑客松列表页测试
 * 关注:
 *   - Hero + 状态 Tabs + 卡片渲染(标题 / 状态徽章 / 已报名标记 / 详情链接)
 *   - 搜索框输入 → hackathonsApi.getAll({ search })
 *   - 切换状态 tab → getAll({ status })
 *   - 空结果展示空态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { HackathonListPage } from './HackathonListPage';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { useAuthStore } from '../../stores/authStore';

const HACKATHONS = [
  {
    id: 'h1',
    title: 'AI Agent 黑客松',
    description: '48 小时构建 Agent 应用',
    status: 'upcoming',
    startDate: '2026-10-01T00:00:00Z',
    endDate: '2026-10-03T00:00:00Z',
    registerDeadline: '2026-09-20T00:00:00Z',
    location: '线上',
    minTeamSize: 1,
    maxTeamSize: 4,
  },
  {
    id: 'h2',
    title: 'RAG 挑战赛',
    description: '检索增强生成实战',
    status: 'active',
    startDate: '2026-08-01T00:00:00Z',
    endDate: '2026-08-31T00:00:00Z',
    minTeamSize: 2,
    maxTeamSize: 5,
    myRegistration: { status: 'registered' },
  },
] as never[];

vi.mock('../../lib/hackathonsApi', () => ({
  hackathonsApi: { getAll: vi.fn() },
}));

vi.mock('../../lib/cms', () => {
  const ENUM_ITEMS: { value: string; label: string; colorClass?: string; icon?: string }[] = [
    { value: 'upcoming', label: '招募中' },
    { value: 'active', label: '进行中' },
    { value: 'judging', label: '评审中' },
    { value: 'finished', label: '已结束' },
  ];
  const byValue = new Map(ENUM_ITEMS.map((i) => [i.value, i]));
  return {
    useEnum: () => ({
      data: ENUM_ITEMS,
      isLoading: false,
      isError: false,
      error: null,
      getLabel: (v: string) => byValue.get(v)?.label ?? v,
      getColor: (v: string) => byValue.get(v)?.colorClass,
      getIcon: (v: string) => byValue.get(v)?.icon,
    }),
    usePageSettings: () => ({ data: undefined }),
    useI18n: () => ({ t: (_k: string, fb: string) => fb }),
    pickPage: (_d: unknown, _k: string, _l: string, fb: string) => fb,
    pickSite: (_d: unknown, _k: string, _l: string, fb: string) => fb,
    createT: () => (_k: string, fb: string) => fb,
    pickLocalized: (v: string) => v,
    safeNavPath: (p: string) => p,
  };
});

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/hackathons']}>
          <HackathonListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(hackathonsApi.getAll).mockReset();
  vi.mocked(hackathonsApi.getAll).mockResolvedValue(HACKATHONS);
  useAuthStore.setState({ user: null });
});

describe('HackathonListPage', () => {
  it('渲染 hero 与状态 tabs', async () => {
    renderList();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('BUILD.');
    const tablist = screen.getByRole('tablist', { name: '黑客松状态筛选' });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '全部' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '招募中' })).toBeInTheDocument();
  });

  it('渲染黑客松卡片:标题 / 状态徽章 / 已报名标记 / 详情链接', async () => {
    renderList();
    expect(await screen.findByText('AI Agent 黑客松')).toBeInTheDocument();
    expect(screen.getByText('RAG 挑战赛')).toBeInTheDocument();
    // '招募中'/'进行中' 同时出现在 tab 与卡片状态徽章上
    expect(screen.getAllByText('招募中').length).toBe(2);
    expect(screen.getAllByText('进行中').length).toBe(2);
    expect(screen.getByText('已报名')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /AI Agent 黑客松/ })).toHaveAttribute('href', '/hackathons/h1');
  });

  it('搜索输入触发带 search 参数的查询', async () => {
    renderList();
    await screen.findByText('AI Agent 黑客松');
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索黑客松...' }), { target: { value: 'RAG' } });
    await waitFor(() => expect(hackathonsApi.getAll).toHaveBeenCalledWith({ search: 'RAG' }));
  });

  it('切换状态 tab 触发带 status 参数的查询', async () => {
    renderList();
    await screen.findByText('AI Agent 黑客松');
    fireEvent.click(screen.getByRole('tab', { name: '进行中' }));
    await waitFor(() => expect(hackathonsApi.getAll).toHaveBeenCalledWith({ status: 'active' }));
  });

  it('无结果时展示空态', async () => {
    vi.mocked(hackathonsApi.getAll).mockResolvedValue([] as never);
    renderList();
    expect(await screen.findByText('没有找到符合条件的黑客松')).toBeInTheDocument();
    expect(screen.getByText('清除筛选')).toBeInTheDocument();
  });
});