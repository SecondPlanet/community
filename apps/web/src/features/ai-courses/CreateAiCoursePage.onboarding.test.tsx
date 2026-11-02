/**
 * CreateAiCoursePage.onboarding — C-07 方案 A 测试
 *
 * 用例:
 *  1. onboarding=1 + 名下无项目 → 渲染 hero + 跳过按钮,点"跳过" → /
 *  2. onboarding=1 + 名下已有项目 → getLearningHome 被触发 + 立即跳 '/'
 *  3. onboarding=1 + getLearningHome 抛错 → hero 正常 + 跳过按钮可点
 *  4. onboarding=1 + submit createProject 成功 → /ai-courses/<id>/plan
 *  5. 无 onboarding 参数 → 不显示 onboarding-only 文案
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiCoursesApi } from './aiCoursesApi';
import { CreateAiCoursePage } from './CreateAiCoursePage';

// ───── 导航 mock(捕获跳转目标) ─────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage(initialEntry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CreateAiCoursePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CreateAiCoursePage onboarding (C-07 方案 A)', () => {
  it('onboarding=1 + 名下无项目 → 渲染 hero + 跳过按钮,点击跳过 → /', async () => {
    vi.spyOn(aiCoursesApi, 'getLearningHome').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    renderPage('/ai-courses/new?onboarding=1');
    // hero 文案存在
    expect(screen.getByText('从一个真实问题开始。')).toBeInTheDocument();
    expect(screen.getByText('欢迎，先告诉 AI 你想学什么')).toBeInTheDocument();
    expect(screen.getByText('可随时跳过，之后从首页也能开始。')).toBeInTheDocument();
    const skip = await screen.findByTestId('onboarding-skip');
    expect(skip).toBeInTheDocument();
    fireEvent.click(skip);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('onboarding=1 + 名下已有项目 → getLearningHome 被触发 + 立即跳 /', async () => {
    const home = vi.spyOn(aiCoursesApi, 'getLearningHome').mockResolvedValue({
      items: [
        {
          id: 'c1',
          kind: 'platform',
          title: '老课程',
          progress: 30,
          lastAccessedAt: null,
          continueHref: '/dashboard',
        },
      ],
      nextCursor: null,
    });
    renderPage('/ai-courses/new?onboarding=1');
    await waitFor(() => expect(home).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }),
    );
  });

  it('onboarding=1 + getLearningHome 抛错 → 不阻塞,hero 正常 + 跳过按钮可点', async () => {
    vi.spyOn(aiCoursesApi, 'getLearningHome').mockRejectedValue(new Error('network'));
    renderPage('/ai-courses/new?onboarding=1');
    expect(screen.getByText('欢迎，先告诉 AI 你想学什么')).toBeInTheDocument();
    expect(screen.getByText('可随时跳过，之后从首页也能开始。')).toBeInTheDocument();
    const skip = await screen.findByTestId('onboarding-skip');
    expect(skip).not.toBeDisabled();
    fireEvent.click(skip);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('onboarding=1 + submit createProject 成功 → 跳 /ai-courses/<id>/plan', async () => {
    vi.spyOn(aiCoursesApi, 'getLearningHome').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.spyOn(aiCoursesApi, 'createProject').mockResolvedValue({
      projectId: 'p-new',
      courseId: 'c-new',
      jobId: 'job-new',
      status: 'planning',
    });
    renderPage('/ai-courses/new?onboarding=1');
    const question = screen.getByLabelText('你真正想学会什么？');
    fireEvent.change(question, {
      target: { value: '用直觉讲清楚 Transformer 为什么有效' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始设计课程' }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/ai-courses/p-new/plan'),
    );
  });

  it('无 onboarding 参数 → 行为等同旧版(不显示 onboarding-only 文案)', () => {
    vi.spyOn(aiCoursesApi, 'getLearningHome').mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    renderPage('/ai-courses/new');
    expect(screen.getByText('从一个真实问题开始。')).toBeInTheDocument();
    // 旧版小标题 + onboarding 文案都不应出现
    expect(screen.queryByText('欢迎，先告诉 AI 你想学什么')).not.toBeInTheDocument();
    expect(screen.queryByText('可随时跳过，之后从首页也能开始。')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-skip')).not.toBeInTheDocument();
  });
});