import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notesApi } from './notesApi';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './api';

describe('notesApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('按课时读取和创建带时间戳的笔记', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'note-1' } });

    await notesApi.list('lesson-1');
    await notesApi.create('lesson-1', { content: '重点', positionSec: 42 });

    expect(api.get).toHaveBeenCalledWith('/api/v1/lessons/lesson-1/notes');
    expect(api.post).toHaveBeenCalledWith('/api/v1/lessons/lesson-1/notes', {
      content: '重点',
      positionSec: 42,
    });
  });

  it('更新和删除时使用 note 资源路由', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { id: 'note-1' } });
    vi.mocked(api.delete).mockResolvedValue({});

    await notesApi.update('note-1', { content: '更新后的重点' });
    await notesApi.remove('note-1');

    expect(api.patch).toHaveBeenCalledWith('/api/v1/notes/note-1', {
      content: '更新后的重点',
    });
    expect(api.delete).toHaveBeenCalledWith('/api/v1/notes/note-1');
  });
});
