import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../lib/api';
import { AiCourseCapabilityGuard, filterAiCourseNavigation, getAiCourseCapability } from './aiCourseCapability';

function renderGuard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AiCourseCapabilityGuard><div>受保护的课程页面</div></AiCourseCapabilityGuard></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AI course public capability', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the public capability contract', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: true } });
    await expect(getAiCourseCapability()).resolves.toEqual({ enabled: true });
    expect(get).toHaveBeenCalledWith('/api/v1/ai-personal-courses/capabilities');
  });

  it('removes all private-course destinations from CMS navigation when disabled', () => {
    const links = [
      { label: 'AI Hub', path: '/ai-courses' },
      { label: 'Create', path: '/ai-courses/new' },
      { label: 'Courses', path: '/courses' },
    ];
    expect(filterAiCourseNavigation(links, false)).toEqual([{ label: 'Courses', path: '/courses' }]);
    expect(filterAiCourseNavigation(links, true)).toEqual(links);
  });

  it('does not mount route content while capability is loading', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    renderGuard();
    expect(screen.getByRole('status')).toHaveTextContent('正在确认 AI 课程是否可用');
    expect(screen.queryByText('受保护的课程页面')).not.toBeInTheDocument();
  });

  it('renders route content only when enabled', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: true } });
    renderGuard();
    expect(await screen.findByText('受保护的课程页面')).toBeInTheDocument();
  });

  it('fails closed with a dashboard exit when disabled', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { enabled: false } });
    renderGuard();
    expect(await screen.findByRole('heading', { name: 'AI 自建课程暂未开放' })).toBeInTheDocument();
    expect(screen.queryByText('受保护的课程页面')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '回到学习中心' })).toHaveAttribute('href', '/dashboard');
  });
});
