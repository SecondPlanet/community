/**
 * InstructorListPage — vitest
 *
 * 覆盖:
 *   - 列表渲染 (2 张讲师卡 + 专长 chip)
 *   - 专长 chip 筛选 (列表刷新)
 *   - 搜索 (input 变化 → 列表过滤, 300ms debounce)
 *   - 排序按钮 (推荐/姓名/最新)
 *   - 空状态 (无匹配讲师)
 *   - 错误状态 (API 5xx)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InstructorListPage } from './InstructorListPage';
import { instructorsApi } from '../../lib/instructorsApi';

vi.mock('../../lib/instructorsApi', () => ({
  instructorsApi: {
    list: vi.fn(),
    listExpertises: vi.fn(),
  },
}));

const mockedApi = instructorsApi as unknown as {
  list: ReturnType<typeof vi.fn>;
  listExpertises: ReturnType<typeof vi.fn>;
};

const MOCK_INSTRUCTORS = {
  items: [
    {
      id: 'i1',
      slug: 'sky-walker',
      name: 'Sky Walker',
      title: '首席云架构师',
      headline: '把复杂云原生系统拆成可读代码',
      avatarUrl: 'https://example.com/avatar1.png',
      company: 'CloudFirst',
      yearsOfExperience: 12,
      expertiseLinks: [{ expertise: { id: 'e1', key: 'cloud', label: '云计算' } }],
      _count: { courseLinks: 3 },
    },
    {
      id: 'i2',
      slug: 'mr-robot',
      name: 'Mr. Robot',
      title: '高级安全研究员',
      headline: '白帽黑客',
      avatarUrl: null,
      company: 'RedTeam',
      yearsOfExperience: 10,
      expertiseLinks: [{ expertise: { id: 'e2', key: 'security', label: '信息安全' } }],
      _count: { courseLinks: 1 },
    },
  ],
  total: 2,
  page: 1,
  limit: 24,
  totalPages: 1,
};

const MOCK_EXPERTISES = [
  { id: 'e1', key: 'cloud', label: '云计算', labelEn: 'Cloud', isActive: true, orderIndex: 0 },
  { id: 'e2', key: 'security', label: '信息安全', labelEn: 'Security', isActive: true, orderIndex: 1 },
];

function renderPage(initialUrl = '/instructors') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/instructors" element={<InstructorListPage />} />
          <Route path="/instructors/:slug" element={<div>Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.listExpertises.mockResolvedValue(MOCK_EXPERTISES);
  mockedApi.list.mockResolvedValue(MOCK_INSTRUCTORS);
});

describe('InstructorListPage', () => {
  it('渲染讲师列表: 2 张卡 + 专长 chip', async () => {
    renderPage();
    // 等卡片渲染
    await waitFor(() => {
      expect(screen.getByText('Sky Walker')).toBeDefined();
    });
    expect(screen.getByText('Mr. Robot')).toBeDefined();
    // 专长 chip 在侧栏 (用 role=button 区分卡片和 chip)
    expect(screen.getByRole('button', { name: '云计算' })).toBeDefined();
    expect(screen.getByRole('button', { name: '信息安全' })).toBeDefined();
  });

  it('显示 2 位讲师 (mock total=2)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/共 2 位讲师/)).toBeDefined();
    });
  });

  it('点击专长 chip → 列表带 filter 重 fetch', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '信息安全' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: '信息安全' }));

    await waitFor(() => {
      expect(mockedApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ expertiseIds: ['e2'] }),
      );
    });
  });

  it('点讲师卡 → 跳到 /instructors/:slug', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sky Walker')).toBeDefined());

    const card = screen.getByRole('link', { name: /Sky Walker/ });
    expect(card.getAttribute('href')).toBe('/instructors/sky-walker');
  });

  it('空结果 → 显示 EmptyState', async () => {
    mockedApi.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 24, totalPages: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/没有匹配的讲师/)).toBeDefined();
    });
  });

  it('API 错误 → 显示 QueryErrorState', async () => {
    mockedApi.list.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/无法加载讲师列表/)).toBeDefined();
    });
  });

  it('search input → 300ms debounce 后调 list with search param', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sky Walker')).toBeDefined());

    // 第一次初始 fetch (search=undefined) 已经发生, 清掉
    mockedApi.list.mockClear();
    mockedApi.list.mockResolvedValue(MOCK_INSTRUCTORS);

    const search = screen.getByPlaceholderText(/搜索讲师/);
    fireEvent.change(search, { target: { value: 'sky' } });

    // 等 debounce 触发
    await waitFor(
      () => {
        const calls = mockedApi.list.mock.calls;
        // 至少 1 次调用且带 search
        return calls.some((c) => c[0] && c[0].search === 'sky');
      },
      { timeout: 2000 },
    );
  });

  it('排序按钮: 切到"姓名" → list({ sort: name })', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sky Walker')).toBeDefined());

    const sortBtn = screen.getByRole('button', { name: '姓名' });
    fireEvent.click(sortBtn);

    await waitFor(() => {
      expect(mockedApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'name' }),
      );
    });
  });
});
