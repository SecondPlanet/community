/**
 * HomePage — 首页测试
 * 关注 8 段位中的核心数据段:
 *   1) Hero:大标语 + 4 KPI(万级格式化) + term/黑客松徽章 + 双 CTA + GitHub 链接
 *   2) 未登录右侧 featured course 预览卡
 *   3) 热门课程 / 学位路径 / 黑客松 / 讲师墙 四个数据段
 * 数据全部来自 mock 的 api / hackathonsApi / instructorsApi。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { HomePage } from './HomePage';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { instructorsApi } from '../../lib/instructorsApi';
import { useAuthStore } from '../../stores/authStore';

const STATS = {
  activeLearners: 12400,
  totalCourses: 24,
  totalProjects: 300,
  totalDegrees: 4,
  activeHackathonCount: 2,
  currentTermLabel: '2026 夏季',
  featuredCourse: {
    id: 'c-feat',
    title: 'RAG 从零到一',
    description: '用 6 周搭出生产级检索增强问答',
    level: 'Beginner',
    duration: '6 周',
    instructor: '王老师',
    tags: 'rag',
    thumbnail: '',
    enrollmentCount: 1200,
    lessonCount: 24,
  },
};

const COURSE = {
  id: 'c1',
  title: 'RAG 实战营',
  description: '检索增强生成系统实战',
  thumbnail: '',
  duration: '6 周',
  instructor: '王老师',
  level: 'Beginner',
  costType: 'free',
  price: 0,
  tags: 'rag, llm',
  rating: 4.8,
  reviewCount: 12,
};

const DEGREE = {
  id: 'd1',
  title: 'AI 应用工程师学位',
  description: '4-8 门课的系统能力路径',
  icon: 'rocket',
  price: 0,
  costType: 'free',
  courses: [{ id: 'c1', title: 'RAG 实战营', stepNumber: 1 }],
  stats: { courseCount: 4, totalLessons: 40, estimatedHours: 60, totalLearners: 1000 },
};

const HACKATHON = {
  id: 'h1',
  title: 'AI Agent 极客周',
  description: '限时交付可演示方案',
  status: 'active',
  startDate: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
  endDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
  location: '线上',
  maxTeamSize: 4,
  minTeamSize: 1,
  _count: { registrations: 30 },
};

const INSTRUCTOR = { id: 'i1', slug: 'wang', name: '王老师', title: '一线大模型工程师', avatarUrl: null };

vi.mock('../../lib/hackathonsApi', () => ({
  hackathonsApi: { getAll: vi.fn() },
}));
vi.mock('../../lib/instructorsApi', () => ({
  instructorsApi: { list: vi.fn() },
}));

vi.mock('../../lib/cms', () => ({
  useSiteSettings: () => ({ data: undefined }),
  usePageSettings: () => ({ data: undefined }),
  useList: () => ({ data: undefined }),
  useEnum: () => ({ data: [], getLabel: (v: string) => v, getColor: () => undefined, getIcon: () => undefined }),
  useI18n: () => ({ t: (_k: string, fb: string) => fb }),
  pickPage: (_d: unknown, _k: string, _l: string, fb: string) => fb,
  pickSite: (_d: unknown, _k: string, _l: string, fb: string) => fb,
  createT: () => (_k: string, fb: string) => fb,
  pickLocalized: (v: string) => v,
  safeNavPath: (p: string) => p,
}));

vi.mock('../../lib/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../lib/api';

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: null });
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/api/v1/courses')) return { data: [COURSE] };
    if (url.includes('/api/v1/degrees')) return { data: [DEGREE] };
    if (url.includes('/api/v1/site/stats')) return { data: STATS };
    return { data: [] };
  });
  vi.mocked(hackathonsApi.getAll).mockImplementation(async (params?: { status?: string }) =>
    params?.status === 'upcoming' ? ([] as never) : ([HACKATHON] as never),
  );
  vi.mocked(instructorsApi.list).mockResolvedValue({ items: [INSTRUCTOR] } as never);
});

describe('HomePage', () => {
  it('Hero:大标语 + 4 KPI(万级格式化)', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('让 AI 时代的能力');
    expect(await screen.findByText('1.2万')).toBeInTheDocument(); // 12400 → 1.2万
    expect(screen.getByText('在读学员')).toBeInTheDocument();
    expect(screen.getByText('系统化课程')).toBeInTheDocument();
    expect(screen.getByText('已完成项目')).toBeInTheDocument();
    expect(screen.getByText('学位')).toBeInTheDocument();
  });

  it('Hero:term 徽章拼接黑客松数量,CTA 与 GitHub 链接指向正确', async () => {
    renderHome();
    expect(await screen.findByText('2026 夏季 · 2 场黑客松进行中')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /免费开始/ });
    expect(cta).toHaveAttribute('href', '/courses');
    expect(screen.getByRole('link', { name: /了解学位路径/ })).toHaveAttribute('href', '/degrees');
    expect(
      screen.getByRole('link', { name: /在 GitHub 查看 SecondPlanet 开源仓库/ }),
    ).toHaveAttribute('href', 'https://github.com/SecondPlanet/community');
  });

  it('未登录:右侧预览卡展示 featured course(产品示例)', async () => {
    renderHome();
    expect(await screen.findByText('产品示例 · Featured course')).toBeInTheDocument();
    expect(screen.getByText('RAG 从零到一')).toBeInTheDocument();
    expect(screen.getByText('1200 人已报名')).toBeInTheDocument();
    const previewLinks = screen.getAllByRole('link', { name: /立即试看/ });
    expect(previewLinks[0]).toHaveAttribute('href', '/courses/c-feat');
    expect(screen.getByRole('link', { name: '登录查看你的进度' })).toHaveAttribute('href', '/login');
  });

  it('热门课程段:课程卡 + 免费标记 + 评分', async () => {
    renderHome();
    expect((await screen.findAllByText('RAG 实战营')).length).toBeGreaterThan(0);
    expect(screen.getByText('免费')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('热门课程')).toBeInTheDocument();
  });

  it('学位路径段:学位卡渲染', async () => {
    renderHome();
    expect(await screen.findByText('AI 应用工程师学位')).toBeInTheDocument();
    expect(screen.getByText('学位路径')).toBeInTheDocument();
  });

  it('黑客松段:进行中赛事 + 倒计时标签', async () => {
    renderHome();
    expect(await screen.findByText('AI Agent 极客周')).toBeInTheDocument();
    expect(screen.getByText(/距开始 \d+ 天/)).toBeInTheDocument();
    expect(hackathonsApi.getAll).toHaveBeenCalledWith({ status: 'active' });
    expect(hackathonsApi.getAll).toHaveBeenCalledWith({ status: 'upcoming' });
  });

  it('讲师墙:讲师卡与详情链接', async () => {
    renderHome();
    expect((await screen.findAllByText('王老师')).length).toBeGreaterThan(0);
    expect(screen.getByText('一线大模型工程师')).toBeInTheDocument();
    const instLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/instructors/wang');
    expect(instLink).toBeDefined();
  });
});