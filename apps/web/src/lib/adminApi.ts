/**
 * Admin API — 后台数据
 *
 * GET /api/v1/admin/stats — 看板 KPI / 图表 / 待办 / 系统状态
 */
import { api } from './api';

export interface AdminKpi {
  label: string;
  value: string;
  delta: string;
  deltaTone: 'up' | 'down' | 'neutral' | 'warning';
  sub: string;
}

export interface AdminStats {
  kpis: AdminKpi[];
  topCourses: { id: string; title: string; enrollmentCount: number }[];
  totals: {
    users: number;
    courses: number;
    activeEnrollments: number;
    completedEnrollments: number;
    completionRate: number;
  };
  todos: {
    draftCourses: number;
  };
  system: {
    database: 'ok' | 'down';
    apiVersion: string;
    lastDeploy: string;
  };
  userGrowth: { date: string; count: number }[];
}

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const { data } = await api.get('/api/v1/admin/stats');
    return data;
  },
};
