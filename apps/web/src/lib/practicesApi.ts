import { api } from './api';
import type {
  PracticeProject,
  PracticeCompletion,
  CreatePracticeProjectRequest,
  UpdatePracticeProjectRequest,
  CompletePracticeRequest,
} from '@secondplanet/shared-types';

export const practicesApi = {
  // 获取课程的实践项目列表
  getProjectsByCourse: async (courseId: string): Promise<PracticeProject[]> => {
    const response = await api.get(`/api/v1/practices/courses/${courseId}`);
    return response.data;
  },

  getAccessibleProjectsByCourse: async (courseId: string): Promise<PracticeProject[]> => {
    const response = await api.get(`/api/v1/practices/courses/${courseId}/access`);
    return response.data;
  },

  getAdminProjectsByCourse: async (courseId: string): Promise<PracticeProject[]> => {
    const response = await api.get(`/api/v1/practices/admin/courses/${courseId}`);
    return response.data;
  },

  // 获取实践项目详情
  getProject: async (id: string): Promise<PracticeProject> => {
    const response = await api.get(`/api/v1/practices/${id}`);
    return response.data;
  },

  // 创建实践项目（管理员）
  createProject: async (data: CreatePracticeProjectRequest): Promise<PracticeProject> => {
    const response = await api.post('/api/v1/practices', data);
    return response.data;
  },

  // 更新实践项目（管理员）
  updateProject: async (id: string, data: UpdatePracticeProjectRequest): Promise<PracticeProject> => {
    const response = await api.patch(`/api/v1/practices/${id}`, data);
    return response.data;
  },

  // 删除实践项目（管理员）
  deleteProject: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/practices/${id}`);
  },

  // 获取用户的实践进度
  getUserProgress: async (courseId?: string): Promise<PracticeCompletion[]> => {
    const params = courseId ? { courseId } : {};
    const response = await api.get('/api/v1/practices/user/progress', { params });
    return response.data;
  },

  // 开始实践项目
  startProject: async (id: string): Promise<PracticeCompletion> => {
    const response = await api.post(`/api/v1/practices/${id}/start`);
    return response.data;
  },

  // 完成实践项目
  completeProject: async (id: string, data: CompletePracticeRequest): Promise<PracticeCompletion> => {
    const response = await api.post(`/api/v1/practices/${id}/complete`, data);
    return response.data;
  },

  // 跳过实践项目
  skipProject: async (id: string): Promise<PracticeCompletion> => {
    const response = await api.post(`/api/v1/practices/${id}/skip`);
    return response.data;
  },
};
