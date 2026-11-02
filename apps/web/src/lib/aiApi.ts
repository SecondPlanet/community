import api from './api';

export interface CourseDraft {
  title: string;
  description: string;
  learningPoints: string;
  instructor: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  duration: string;
  thumbnail: string;
  tags: string;
  costType: 'free' | 'paid' | 'charity';
  price: number;
  courseType?: 'own' | 'external';
  externalUrl?: string;
}

export interface DegreeDraft {
  title: string;
  description: string;
  learningPoints: string;
  icon: string;
  costType: 'free' | 'paid' | 'charity';
  price: number;
  thumbnail: string;
  tags: string;
}

export const aiApi = {
  async generateCourse(topic: string, hint?: string): Promise<CourseDraft> {
    const { data } = await api.post<{ draft: CourseDraft }>('/api/v1/ai/generate-course', {
      topic,
      hint,
    });
    return data.draft;
  },

  async generateDegree(topic: string, hint?: string): Promise<DegreeDraft> {
    const { data } = await api.post<{ draft: DegreeDraft }>('/api/v1/ai/generate-degree', {
      topic,
      hint,
    });
    return data.draft;
  },
};

export default aiApi;
