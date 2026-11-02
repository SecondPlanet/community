/**
 * CourseListPage — 课程列表页测试
 * 关注:
 *   - 页头(课程大厅 + 数量副标题)+ 课程卡
 *   - 搜索 300ms debounce → 后端 ?search= 排序 ?sort= 请求
 *   - 收费筛选(免费/付费/公益)客户端过滤
 *   - 空结果与清除筛选
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { CourseListPage } from './CourseListPage';
import api, { api as apiNamed } from '../../lib/api';

const COURSES = [
  {
    id: 'c1', title: 'RAG 系统实战', description: '检索增强生成', thumbnail: '',
    duration: '6 h', instructor: '王老师', level: 'Beginner', costType: 'free',
    courseType: 'own', price: 0, tags: 'rag', rating: 4.8, reviewCount: 12,
    enrollmentCount: 300, createdAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'c2', title: '大模型微调付费课', description: 'LoRA 微调', thumbnail: '',
    duration: '10 h', instructor: '李老师', level: 'Advanced', costType: 'paid',
    courseType: 'own', price: 299, tags: 'fine-tune', rating: 4.2, reviewCount: 8,
    enrollmentCount: 100, createdAt: '2026-08-20T00:00:00Z',
  },
] as never[];

vi.mock('../../lib/api', () => ({
  default: { get: vi.fn() },
  api: { get: vi.fn() },
}));

vi.mock('../../lib/cms', () => {
  const LEVELS: Record<string, string> = {
    Beginner: '入门', Intermediate: '进阶', Advanced: '高级', Expert: '专家',
  };
  return {
    useSiteSettings: () => ({ data: undefined }),
    usePageSettings: () => ({ data: undefined }),
    useList: () => ({ data: undefined }),
    useEnum: () => ({
      data: [], isLoading: false, isError: false, error: null,
      getLabel: (v: string) => LEVELS[v] ?? v,
      getColor: () => undefined,
      getIcon: () => undefined,
    }),
    useI18n: () => ({ t: (_k: string, fb: string) => fb }),
    pickPage: (_d: unknown, _k: string, _l: string, fb: string) => fb,
    pickSite: (_d: unknown, _k: string, _l: string, fb: string) => fb,
    createT: () => (_k: string, fb: string) => fb,
    pickLocalized: (v: string) => v,
    safeNavPath: (p: string) => p,
  };
});

function renderCourses(initialEntries = ['/courses']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          <CourseListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockResolvedValue({ data: COURSES });
  vi.mocked(apiNamed.get).mockReset();
  vi.mocked(apiNamed.get).mockResolvedValue({ data: COURSES });
});

describe('CourseListPage', () => {
  it('渲染页头与课程卡(数量副标题 + 标题链接)', async () => {
    renderCourses();
    expect(screen.getByRole('heading', { level: 1, name: '课程大厅' })).toBeInTheDocument();
    expect(await screen.findByText('从 2 门系统化课程中找到你的下一步')).toBeInTheDocument();
    expect(screen.getByText('RAG 系统实战')).toBeInTheDocument();
    expect(screen.getByText('大模型微调付费课')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /RAG 系统实战/ })).toHaveAttribute('href', '/courses/c1');
  });

  it('搜索输入 debounce 后发起 ?search= 查询', async () => {
    renderCourses();
    await screen.findByText('RAG 系统实战');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'RAG' } });
    await waitFor(
      () => expect(api.get).toHaveBeenCalledWith('/api/v1/courses?search=RAG&sort=popular'),
      { timeout: 1500 },
    );
  });

  it('切换排序触发 ?sort=recent 查询', async () => {
    renderCourses();
    await screen.findByText('RAG 系统实战');
    fireEvent.change(screen.getByRole('combobox', { name: '课程排序' }), { target: { value: 'recent' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/courses?sort=recent'));
  });

  it('收费筛选勾选「免费」后只显示免费课程', async () => {
    renderCourses();
    await screen.findByText('大模型微调付费课');
    fireEvent.click(screen.getByRole('checkbox', { name: '免费' }));

    expect(screen.getByText('RAG 系统实战')).toBeInTheDocument();
    expect(screen.queryByText('大模型微调付费课')).not.toBeInTheDocument();
  });

  it('无匹配结果时展示空态与清除筛选', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderCourses();
    expect(await screen.findByText('没有匹配的课程')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清除筛选' })).toBeInTheDocument();
  });
});