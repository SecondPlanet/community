import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiCoursesApi } from '../ai-courses/aiCoursesApi';
import { MyLearningHomePage } from './MyLearningHomePage';
import api from '../../lib/api';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><MyLearningHomePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MyLearningHomePage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('deduplicates cursor pages, clamps progress and avoids nested interactive CTAs', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: true } });
    vi.spyOn(aiCoursesApi, 'getLearningHome').mockImplementation(async (cursor) => cursor
      ? {
          items: [
            { id: 'course-1', kind: 'ai_personal', title: '课程 A', progress: 150, lastAccessedAt: null, continueHref: '/ai-courses/project-1/learn' },
            { id: 'course-2', kind: 'platform', title: '课程 B', progress: 40, lastAccessedAt: null, continueHref: '/dashboard/learning/course-2' },
          ],
          nextCursor: null,
        }
      : {
          items: [
            { id: 'course-1', kind: 'ai_personal', title: '课程 A', progress: 150, lastAccessedAt: null, continueHref: '/ai-courses/project-1/learn' },
          ],
          nextCursor: 'page-2',
        });
    const { container } = renderPage();

    await screen.findByRole('heading', { name: '课程 A' });
    expect(screen.getByRole('progressbar', { name: '课程 A学习进度' })).toHaveAttribute('aria-valuenow', '100');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await screen.findByRole('heading', { name: '课程 B' });

    expect(screen.getAllByRole('heading', { name: '课程 A' })).toHaveLength(1);
    expect(container.querySelector('a button')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument());
  });

  it('hides AI creation and private items when the capability is disabled', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: false } });
    vi.spyOn(aiCoursesApi, 'getLearningHome').mockResolvedValue({
      items: [
        { id: 'private-1', kind: 'ai_personal', title: '隐藏的 AI 课程', progress: 10, lastAccessedAt: null, continueHref: '/ai-courses/private-1/learn' },
        { id: 'platform-1', kind: 'platform', title: '保留的平台课程', progress: 20, lastAccessedAt: null, continueHref: '/dashboard/learning/platform-1' },
      ],
      nextCursor: null,
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: '保留的平台课程' })).toBeInTheDocument();
    expect(screen.queryByText('隐藏的 AI 课程')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '创建自己的课程' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '问一个问题' })).not.toBeInTheDocument();
  });
});
