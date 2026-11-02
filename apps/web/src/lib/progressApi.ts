import { api } from './api';
import type { CourseProgress, LearningStats } from '@secondplanet/shared-types';

export interface CompleteLessonResponse {
  record: any;
  courseProgress: CourseProgress;
  pointsAwarded: number;
  newlyUnlockedBadges: { badgeId: string; name: string; pointsAwarded: number }[];
  // v1.9-alpha.2 (batch-7 A-04): 课程刚完成 (从进行中 → 完成) 时为 true,
  // 用于前端弹祝贺卡片 (C-05)。重标已完成返回 false, 不重复弹。
  courseJustCompleted: boolean;
  // v1.9-alpha.2 (batch-7 A-04 / C-05): 后端 issueCertificate 的产物
  certificate?: { id: string; title?: string } | null;
  degreeCertificates?: { id: string; title?: string }[];
}

export const progressApi = {
  getMyProgress: async () => {
    const response = await api.get('/api/v1/progress/me');
    return response.data;
  },

  getMyStats: async (): Promise<LearningStats> => {
    const response = await api.get('/api/v1/progress/me/stats');
    return response.data;
  },

  getCourseProgress: async (courseId: string): Promise<CourseProgress> => {
    const response = await api.get(`/api/v1/progress/courses/${courseId}`);
    return response.data;
  },

  completeLesson: async (lessonId: string): Promise<CompleteLessonResponse> => {
    const response = await api.post(`/api/v1/progress/lessons/${lessonId}/complete`);
    return response.data;
  },
};
