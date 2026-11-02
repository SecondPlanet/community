import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instructorsApi } from './instructorsApi';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import api from './api';

describe('instructorsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('使用公开列表、slug 详情和 id 统计端点', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { items: [], total: 0 } })
      .mockResolvedValueOnce({ data: { id: 'inst-1', slug: 'alice' } })
      .mockResolvedValueOnce({ data: { instructorId: 'inst-1' } });

    await instructorsApi.list({ search: 'Alice', limit: 20 });
    await instructorsApi.getBySlug('alice');
    await instructorsApi.getStats('inst-1');

    // 2026-08-04: list 现在带 paramsSerializer (expertiseIds 数组序列化)
    expect(api.get).toHaveBeenNthCalledWith(1, '/api/v1/instructors', {
      params: { search: 'Alice', limit: 20 },
      paramsSerializer: { indexes: null },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/v1/instructors/alice');
    expect(api.get).toHaveBeenNthCalledWith(3, '/api/v1/instructors/inst-1/stats');
  });

  it('listExpertises 调 /api/v1/instructors/expertises', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });
    await instructorsApi.listExpertises();
    expect(api.get).toHaveBeenCalledWith('/api/v1/instructors/expertises');
  });

  it('adminCreate POST /api/v1/admin/instructors', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'new-1' } });
    await instructorsApi.adminCreate({ name: 'New', published: true });
    expect(api.post).toHaveBeenCalledWith('/api/v1/admin/instructors', { name: 'New', published: true });
  });

  it('adminReorder POST /api/v1/admin/instructors/reorder', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { reordered: 3 } });
    await instructorsApi.adminReorder(['a', 'b', 'c']);
    expect(api.post).toHaveBeenCalledWith('/api/v1/admin/instructors/reorder', { orderedIds: ['a', 'b', 'c'] });
  });
});
