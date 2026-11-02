import { api } from './api';
import type {
  Badge,
  BadgeWithStatus,
  CreateBadgeRequest,
  UpdateBadgeRequest,
  AdminGamificationStats,
} from '@secondplanet/shared-types';

export const badgesApi = {
  getAll: async (): Promise<Badge[]> => {
    const response = await api.get('/api/v1/badges/admin/all');
    return response.data;
  },

  getMyBadges: async (): Promise<BadgeWithStatus[]> => {
    const response = await api.get('/api/v1/badges/me');
    return response.data;
  },

  create: async (data: CreateBadgeRequest): Promise<Badge> => {
    const response = await api.post('/api/v1/badges', data);
    return response.data;
  },

  update: async (id: string, data: UpdateBadgeRequest): Promise<Badge> => {
    const response = await api.patch(`/api/v1/badges/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/v1/badges/${id}`);
    return response.data;
  },

  getAdminStats: async (): Promise<AdminGamificationStats> => {
    const response = await api.get('/api/v1/badges/admin/stats');
    return response.data;
  },
};
