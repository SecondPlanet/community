import { api } from './api';
import type { UserPoints } from '@secondplanet/shared-types';

export const pointsApi = {
  getMyPoints: async (): Promise<UserPoints> => {
    const response = await api.get('/api/v1/points/me');
    return response.data;
  },
};
