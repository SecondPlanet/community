import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationsApi } from './notificationsApi';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from './api';

describe('notificationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('GET /notifications 返回列表 + 未读数', async () => {
      const mockResp = {
        data: {
          data: [
            {
              id: 'n1',
              type: 'announcement',
              title: '新功能上线',
              body: 'AI 助教升级',
              read: false,
              createdAt: '2026-07-19T10:00:00Z',
            },
          ],
          total: 1,
          unreadCount: 1,
          page: 1,
          limit: 50,
        },
      };
      (api.get as any).mockResolvedValue(mockResp);
      const result = await notificationsApi.list({ page: 1, limit: 50 });
      expect(result.data).toHaveLength(1);
      expect(result.unreadCount).toBe(1);
      expect(api.get).toHaveBeenCalledWith('/api/v1/notifications', {
        params: { page: 1, limit: 50 },
      });
    });

    it('支持 unreadOnly 参数', async () => {
      (api.get as any).mockResolvedValue({ data: { data: [], total: 0, unreadCount: 0, page: 1, limit: 50 } });
      await notificationsApi.list({ unreadOnly: true });
      expect(api.get).toHaveBeenCalledWith('/api/v1/notifications', {
        params: { unreadOnly: true },
      });
    });

    it('适配后端 items/isRead 响应为页面使用的 data/read', async () => {
      (api.get as any).mockResolvedValue({
        data: {
          items: [{
            id: 'n1',
            type: 'order',
            title: '支付成功',
            body: '课程已开通',
            isRead: true,
            createdAt: '2026-07-28T10:00:00Z',
          }],
          total: 1,
          unreadCount: 0,
          page: 1,
          limit: 20,
        },
      });

      const result = await notificationsApi.list();

      expect(result.data).toEqual([
        expect.objectContaining({ id: 'n1', read: true }),
      ]);
      expect(result.data[0]).not.toHaveProperty('isRead');
    });
  });

  describe('unreadCount', () => {
    it('返回未读数', async () => {
      (api.get as any).mockResolvedValue({ data: { count: 7 } });
      const count = await notificationsApi.unreadCount();
      expect(count).toBe(7);
      expect(api.get).toHaveBeenCalledWith('/api/v1/notifications/unread-count');
    });
  });

  describe('markRead', () => {
    it('POST /notifications/:id/read', async () => {
      (api.post as any).mockResolvedValue({ data: { ok: true } });
      await notificationsApi.markRead('n1');
      expect(api.post).toHaveBeenCalledWith('/api/v1/notifications/n1/read');
    });
  });

  describe('markAllRead', () => {
    it('POST /notifications/read-all 返回已读数', async () => {
      (api.post as any).mockResolvedValue({ data: { ok: true, count: 5 } });
      const n = await notificationsApi.markAllRead();
      expect(n).toBe(5);
      expect(api.post).toHaveBeenCalledWith('/api/v1/notifications/read-all');
    });
  });

  describe('remove', () => {
    it('DELETE /notifications/:id', async () => {
      (api.delete as any).mockResolvedValue({ data: { ok: true } });
      await notificationsApi.remove('n2');
      expect(api.delete).toHaveBeenCalledWith('/api/v1/notifications/n2');
    });
  });

  describe('clearRead', () => {
    it('POST /notifications/clear-read', async () => {
      (api.post as any).mockResolvedValue({ data: { ok: true, count: 3 } });
      const n = await notificationsApi.clearRead();
      expect(n).toBe(3);
    });
  });
});
