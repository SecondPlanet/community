/**
 * Notifications API — P1-7 通知中心前端客户端
 *
 * 对接后端 5 endpoint:
 *   GET    /notifications                  列表 + 未读数
 *   GET    /notifications/unread-count     仅未读数
 *   POST   /notifications/:id/read         标已读
 *   POST   /notifications/read-all         全部标已读
 *   DELETE /notifications/:id              软删
 *   POST   /notifications/clear-read       清空已读
 */
import { api } from './api';

export type NotificationType = 'announcement' | 'comment' | 'hackathon' | 'order' | string;

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl?: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  data: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

interface NotificationListWireResponse {
  items?: Array<Omit<Notification, 'read'> & { isRead?: boolean; read?: boolean }>;
  /** Backward compatibility with the early frontend-shaped response. */
  data?: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export const notificationsApi = {
  /** 列表 + 未读数(分页) */
  list: async (params?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
  }): Promise<NotificationListResponse> => {
    const { data } = await api.get<NotificationListWireResponse>(
      '/api/v1/notifications',
      { params },
    );
    const notifications = data.items
      ? data.items.map(({ isRead, read, ...item }) => ({
          ...item,
          read: isRead ?? read ?? false,
        }))
      : (data.data ?? []);
    return {
      data: notifications,
      total: data.total,
      unreadCount: data.unreadCount,
      page: data.page,
      limit: data.limit,
    };
  },

  /** 仅未读数(顶部 bell 角标轮询用) */
  unreadCount: async (): Promise<number> => {
    const { data } = await api.get('/api/v1/notifications/unread-count');
    return data.count;
  },

  /** 标已读 */
  markRead: async (id: string): Promise<void> => {
    await api.post(`/api/v1/notifications/${id}/read`);
  },

  /** 全部标已读 */
  markAllRead: async (): Promise<number> => {
    const { data } = await api.post('/api/v1/notifications/read-all');
    return data.count;
  },

  /** 软删单条 */
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/notifications/${id}`);
  },

  /** 清空已读(批量软删) */
  clearRead: async (): Promise<number> => {
    const { data } = await api.post('/api/v1/notifications/clear-read');
    return data.count;
  },
};
