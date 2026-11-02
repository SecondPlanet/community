import api from './api';

export interface InstructorExpertise {
  id: string;
  key: string;
  label: string;
}

export interface InstructorSummary {
  id: string;
  slug: string;
  name: string;
  nameEn?: string | null;
  title?: string | null;
  headline?: string | null;
  avatarUrl?: string | null;
  company?: string | null;
  yearsOfExperience?: number | null;
  publishedAt?: string | null;
  expertiseLinks: Array<{ expertise: InstructorExpertise }>;
  _count: { courseLinks: number };
}

export interface InstructorDetail extends InstructorSummary {
  titleEn?: string | null;
  headlineEn?: string | null;
  bio?: string | null;
  bioEn?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  twitterUrl?: string | null;
  websiteUrl?: string | null;
  courseLinks: Array<{
    id: string;
    role: 'instructor' | 'mentor';
    isPrimary: boolean;
    course: {
      id: string;
      title: string;
      thumbnail?: string | null;
      level: string;
      duration: string;
      costType: 'free' | 'paid' | 'charity';
      status: 'draft' | 'published' | 'archived';
      instructor: string;
    };
  }>;
}

export interface InstructorStats {
  instructorId: string;
  name: string;
  courseCount: number;
  studentCount: number;
  completionRate: number;
  averageRating: number;
  reviewCount: number;
}

export interface InstructorListResponse {
  items: InstructorSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InstructorExpertiseOption {
  id: string;
  key: string;
  label: string;
  labelEn?: string | null;
  isActive: boolean;
  orderIndex: number;
}

export interface InstructorFull extends InstructorDetail {
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  orderIndex: number;
}

export interface CreateInstructorRequest {
  name: string;
  nameEn?: string;
  slug?: string;
  title?: string;
  titleEn?: string;
  headline?: string;
  headlineEn?: string;
  bio?: string;
  bioEn?: string;
  avatarUrl?: string;
  company?: string;
  yearsOfExperience?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  published?: boolean;
  orderIndex?: number;
  expertiseIds?: string[];
}

export type UpdateInstructorRequest = Partial<CreateInstructorRequest>;

export const instructorsApi = {
  async list(params: {
    search?: string;
    page?: number;
    limit?: number;
    sort?: 'orderIndex' | 'name' | 'recent';
    expertiseIds?: string[];
  } = {}) {
    const { data } = await api.get<InstructorListResponse>('/api/v1/instructors', {
      params,
      paramsSerializer: {
        indexes: null, // 让 expertiseIds 走 expertiseIds=id1&expertiseIds=id2 (NestJS 默认行为)
      },
    });
    return data;
  },

  async getBySlug(slug: string) {
    const { data } = await api.get<InstructorDetail>(`/api/v1/instructors/${encodeURIComponent(slug)}`);
    return data;
  },

  async getStats(id: string) {
    const { data } = await api.get<InstructorStats>(`/api/v1/instructors/${id}/stats`);
    return data;
  },

  async listExpertises() {
    const { data } = await api.get<InstructorExpertiseOption[]>('/api/v1/instructors/expertises');
    return data;
  },

  // Admin endpoints
  async adminList(params: { search?: string; page?: number; limit?: number; sort?: 'orderIndex' | 'name' | 'recent' } = {}) {
    const { data } = await api.get<InstructorListResponse>('/api/v1/admin/instructors', { params });
    return data;
  },

  async adminGet(id: string) {
    const { data } = await api.get<InstructorFull>(`/api/v1/admin/instructors/${id}`);
    return data;
  },

  async adminCreate(payload: CreateInstructorRequest) {
    const { data } = await api.post<InstructorFull>('/api/v1/admin/instructors', payload);
    return data;
  },

  async adminUpdate(id: string, payload: UpdateInstructorRequest) {
    const { data } = await api.patch<InstructorFull>(`/api/v1/admin/instructors/${id}`, payload);
    return data;
  },

  async adminDelete(id: string) {
    const { data } = await api.delete<{ id: string }>(`/api/v1/admin/instructors/${id}`);
    return data;
  },

  async adminReorder(orderedIds: string[]) {
    const { data } = await api.post<{ reordered: number }>('/api/v1/admin/instructors/reorder', { orderedIds });
    return data;
  },
};
