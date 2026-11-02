import { beforeEach, describe, expect, it, vi } from 'vitest';
import { practicesApi } from './practicesApi';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from './api';

describe('practicesApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the versioned API for public project queries and user progress', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    await practicesApi.getProjectsByCourse('course-1');
    await practicesApi.getAccessibleProjectsByCourse('course-1');
    await practicesApi.getAdminProjectsByCourse('course-1');
    await practicesApi.getProject('practice-1');
    await practicesApi.getUserProgress('course-1');

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/v1/practices/courses/course-1');
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/v1/practices/courses/course-1/access');
    expect(api.get).toHaveBeenNthCalledWith(3, '/api/v1/practices/admin/courses/course-1');
    expect(api.get).toHaveBeenNthCalledWith(4, '/api/v1/practices/practice-1');
    expect(api.get).toHaveBeenNthCalledWith(5, '/api/v1/practices/user/progress', {
      params: { courseId: 'course-1' },
    });
  });

  it('uses the versioned API for learner actions', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'completion-1' } });

    await practicesApi.startProject('practice-1');
    await practicesApi.completeProject('practice-1', { submissionUrl: 'https://example.com/result' });
    await practicesApi.skipProject('practice-1');

    expect(api.post).toHaveBeenNthCalledWith(1, '/api/v1/practices/practice-1/start');
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/v1/practices/practice-1/complete', {
      submissionUrl: 'https://example.com/result',
    });
    expect(api.post).toHaveBeenNthCalledWith(3, '/api/v1/practices/practice-1/skip');
  });

  it('uses the versioned API for admin CRUD', async () => {
    const payload = {
      courseId: 'course-1',
      title: 'Deploy a model',
      description: 'Ship a working model endpoint.',
      projectUrl: 'https://example.com/lab',
      difficulty: 'beginner' as const,
      estimatedTime: 60,
      projectType: 'model_deployment' as const,
    };
    vi.mocked(api.post).mockResolvedValue({ data: payload });
    vi.mocked(api.patch).mockResolvedValue({ data: payload });
    vi.mocked(api.delete).mockResolvedValue({});

    await practicesApi.createProject(payload);
    await practicesApi.updateProject('practice-1', { title: 'Updated' });
    await practicesApi.deleteProject('practice-1');

    expect(api.post).toHaveBeenCalledWith('/api/v1/practices', payload);
    expect(api.patch).toHaveBeenCalledWith('/api/v1/practices/practice-1', { title: 'Updated' });
    expect(api.delete).toHaveBeenCalledWith('/api/v1/practices/practice-1');
  });
});
