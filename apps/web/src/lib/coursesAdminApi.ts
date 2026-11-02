/**
 * coursesAdminApi — 课程 / 章节 / 课时 / 资源 后台管理
 *
 * 后端: ChaptersController + LessonsController + ResourcesController (admin only)
 *   GET    /api/v1/courses/:courseId/chapters           列表(含 lessons + resources)
 *   POST   /api/v1/courses/:courseId/chapters           新建章节
 *   PATCH  /api/v1/courses/chapters/:id                 改章节
 *   DELETE /api/v1/courses/chapters/:id                 软删(级联 lessons)
 *   POST   /api/v1/courses/:courseId/chapters/reorder    批量重排
 *
 *   GET    /api/v1/chapters/:chapterId/lessons           列表
 *   POST   /api/v1/chapters/:chapterId/lessons           新建课时
 *   PATCH  /api/v1/chapters/lessons/:id                  改课时
 *   DELETE /api/v1/chapters/lessons/:id                  软删
 *   POST   /api/v1/chapters/:chapterId/lessons/reorder   批量重排
 *
 *   GET    /api/v1/lessons/:lessonId/resources           列出课时资源
 *   POST   /api/v1/lessons/:lessonId/resources           新建资源
 *   PATCH  /api/v1/resources/:id                         改资源
 *   DELETE /api/v1/resources/:id                         软删
 *
 *   PATCH  /api/v1/courses/:id                           改课程主信息(info/pricing/publish tab)
 */
import { api } from './api';

export type ResourceType = 'pdf' | 'code' | 'link' | 'video' | 'audio';

export interface ChapterResource {
  id: string;
  lessonId: string;
  title: string;
  url: string;
  type: ResourceType;
  isLocked: boolean;
  createdAt: string;
}

export interface ChapterLesson {
  id: string;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  videoDuration?: number | null;
  isPreview: boolean;
  orderIndex: number;
  chapterId: string;
  /** v1.3.0 起:章节树拉取时一并返回(单次 query) */
  resources?: ChapterResource[];
}

export interface Chapter {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  lessons: ChapterLesson[];
}

export interface CourseChapterList {
  chapters: Chapter[];
}

export const coursesAdminApi = {
  // ── 章节 ─────────────────────────────────────────────────────────────
  listChapters: async (courseId: string): Promise<Chapter[]> => {
    const { data } = await api.get(`/api/v1/courses/${courseId}/chapters`);
    return data;
  },

  createChapter: async (
    courseId: string,
    payload: { title: string; description?: string; orderIndex?: number },
  ): Promise<Chapter> => {
    const { data } = await api.post(`/api/v1/courses/${courseId}/chapters`, payload);
    return data;
  },

  updateChapter: async (
    id: string,
    payload: { title?: string; description?: string; orderIndex?: number },
  ): Promise<Chapter> => {
    const { data } = await api.patch(`/api/v1/courses/chapters/${id}`, payload);
    return data;
  },

  deleteChapter: async (id: string): Promise<{ ok: true }> => {
    const { data } = await api.delete(`/api/v1/courses/chapters/${id}`);
    return data;
  },

  reorderChapters: async (courseId: string, ids: string[]): Promise<{ ok: true }> => {
    const { data } = await api.post(`/api/v1/courses/${courseId}/chapters/reorder`, { ids });
    return data;
  },

  // ── 课时 ─────────────────────────────────────────────────────────────
  createLesson: async (
    chapterId: string,
    payload: {
      title: string;
      description?: string;
      videoUrl?: string;
      videoDuration?: number;
      isPreview?: boolean;
      orderIndex?: number;
    },
  ): Promise<ChapterLesson> => {
    const { data } = await api.post(`/api/v1/chapters/${chapterId}/lessons`, payload);
    return data;
  },

  updateLesson: async (
    id: string,
    payload: {
      title?: string;
      description?: string;
      videoUrl?: string;
      videoDuration?: number;
      isPreview?: boolean;
      orderIndex?: number;
    },
  ): Promise<ChapterLesson> => {
    const { data } = await api.patch(`/api/v1/chapters/lessons/${id}`, payload);
    return data;
  },

  deleteLesson: async (id: string): Promise<{ ok: true }> => {
    const { data } = await api.delete(`/api/v1/chapters/lessons/${id}`);
    return data;
  },

  reorderLessons: async (chapterId: string, ids: string[]): Promise<{ ok: true }> => {
    const { data } = await api.post(`/api/v1/chapters/${chapterId}/lessons/reorder`, { ids });
    return data;
  },

  // ── 课程主信息 (info/pricing/publish tab) ──────────────────────────
  updateCourse: async (
    id: string,
    payload: {
      title?: string;
      subtitle?: string;
      description?: string;
      learningPoints?: string[];
      instructor?: string;
      level?: string;
      duration?: string;
      thumbnail?: string;
      tags?: string[];
      costType?: 'free' | 'paid' | 'charity';
      courseType?: 'own' | 'partner' | 'public' | 'third_party';
      externalUrl?: string;
      price?: number;
      status?: 'draft' | 'published' | 'unpublished';
      publishedAt?: string | null;
    },
  ): Promise<unknown> => {
    const { data } = await api.patch(`/api/v1/courses/${id}`, payload);
    return data;
  },

  // ── 资源 (v1.3.0) ───────────────────────────────────────────────────
  listResources: async (lessonId: string): Promise<ChapterResource[]> => {
    const { data } = await api.get(`/api/v1/lessons/${lessonId}/resources`);
    return data;
  },

  createResource: async (
    lessonId: string,
    payload: { title: string; url: string; type: ResourceType; isLocked?: boolean },
  ): Promise<ChapterResource> => {
    const { data } = await api.post(`/api/v1/lessons/${lessonId}/resources`, payload);
    return data;
  },

  updateResource: async (
    id: string,
    payload: { title?: string; url?: string; type?: ResourceType; isLocked?: boolean },
  ): Promise<ChapterResource> => {
    const { data } = await api.patch(`/api/v1/resources/${id}`, payload);
    return data;
  },

  deleteResource: async (id: string): Promise<{ ok: true }> => {
    const { data } = await api.delete(`/api/v1/resources/${id}`);
    return data;
  },
};
