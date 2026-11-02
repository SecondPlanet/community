/**
 * NotesPanel — v1.9-alpha.1 (A-03) 笔记时间戳点击跳转测试
 *
 * UX-AUDIT-2026-09-11 C-05 + FEATURES §5: 笔记时间戳可点击跳转到视频对应秒。
 * 只有父组件传了 onSeek(即直接 <video> 课时)才渲染 button;iframe 课时降级为
 * 纯文本 span。这里锁定两条渲染分支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotesPanel } from './PlatformLearningContainer';
import { notesApi } from '../../lib/notesApi';

vi.mock('../../lib/notesApi', () => ({
  notesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockList = vi.mocked(notesApi.list);

const noteWithTs = {
  id: 'n-1',
  userId: 'u-1',
  lessonId: 'lesson-1',
  content: '关键概念在这里',
  positionSec: 125,
  createdAt: '2026-09-13T00:00:00Z',
  updatedAt: '2026-09-13T00:00:00Z',
};

function renderPanel(onSeek?: (sec: number) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotesPanel lessonId="lesson-1" positionSec={0} onSeek={onSeek} />
    </QueryClientProvider>,
  );
}

describe('NotesPanel 时间戳跳转 (A-03)', () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  it('有 onSeek + positionSec → 渲染可点击 button,点击回调对应秒数', async () => {
    mockList.mockResolvedValue([noteWithTs]);
    const onSeek = vi.fn();
    renderPanel(onSeek);

    const btn = await screen.findByRole('button', { name: '跳转到 2:05' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSeek).toHaveBeenCalledWith(125);
  });

  it('无 onSeek (iframe 课时) → 时间戳是纯文本,无 button', async () => {
    mockList.mockResolvedValue([noteWithTs]);
    renderPanel(undefined);

    expect(screen.queryByRole('button', { name: /跳转/ })).not.toBeInTheDocument();
    // 纯文本仍在,学员至少能看到时间点
    expect(await screen.findByText('2:05')).toBeInTheDocument();
  });

  it('positionSec=null → 显示"无时间戳",无跳转 button', async () => {
    mockList.mockResolvedValue([{ ...noteWithTs, positionSec: null }]);
    const onSeek = vi.fn();
    renderPanel(onSeek);

    expect(await screen.findByText('无时间戳')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /跳转/ })).not.toBeInTheDocument();
  });
});
