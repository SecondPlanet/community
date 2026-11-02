/**
 * reviewsApi — 评价 (admin)
 *
 * GET    /api/v1/reviews?page=&limit=&courseId=&rating=&onlyDeleted=   admin 全量列表
 * DELETE /api/v1/reviews/:id                                          admin 软删
 *
 * 公开:
 * GET    /api/v1/courses/:id/reviews?page=&limit=                     课程评价列表
 * POST   /api/v1/courses/:id/reviews                                  写评价(需登录)
 * POST   /api/v1/reviews/:id/helpful                                   点赞(需登录)
 */
import { api } from './api';

export interface ReviewUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Review {
  id: string;
  userId: string;
  courseId: string;
  rating: number;
  content: string;
  helpful: number;
  createdAt: string;
  updatedAt: string;
  user: ReviewUser;
}

export interface ReviewListResponse {
  items: Review[];
  total: number;
  page: number;
  limit: number;
}

export const reviewsApi = {
  // ── admin ────────────────────────────────────────────────────────────
  listAll: async (params: {
    page?: number;
    limit?: number;
    courseId?: string;
    rating?: number;
    onlyDeleted?: boolean;
  } = {}): Promise<ReviewListResponse> => {
    const { data } = await api.get('/api/v1/reviews', { params });
    return data;
  },

  adminRemove: async (id: string): Promise<{ ok: true; id: string }> => {
    const { data } = await api.delete(`/api/v1/reviews/${id}`);
    return data;
  },

  // ── 公开 / 用户 ─────────────────────────────────────────────────────
  listByCourse: async (
    courseId: string,
    page = 1,
    limit = 10,
  ): Promise<ReviewListResponse> => {
    const { data } = await api.get(`/api/v1/courses/${courseId}/reviews`, {
      params: { page, limit },
    });
    return data;
  },

  create: async (
    courseId: string,
    payload: { rating: number; content: string },
  ): Promise<Review> => {
    const { data } = await api.post(`/api/v1/courses/${courseId}/reviews`, payload);
    return data;
  },

  markHelpful: async (id: string): Promise<{ id: string; helpful: number }> => {
    const { data } = await api.post(`/api/v1/reviews/${id}/helpful`);
    return data;
  },
};
