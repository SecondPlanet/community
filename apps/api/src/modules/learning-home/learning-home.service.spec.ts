import { Test } from '@nestjs/testing';
import { LearningHomeService } from './learning-home.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('LearningHomeService', () => {
  const prisma = {
    learningProject: { findMany: jest.fn() },
    enrollment: { findMany: jest.fn() },
  };
  let service: LearningHomeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        LearningHomeService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(true) } },
      ],
    }).compile();
    service = module.get(LearningHomeService);
  });

  it('merges private AI projects and enrolled platform courses by recent activity', async () => {
    prisma.learningProject.findMany.mockResolvedValue([{
      id: 'project-1',
      status: 'ready',
      lastAccessedAt: new Date('2026-08-22T12:00:00Z'),
      activeLessonId: 'ai-lesson',
      course: { title: '我的 AI 课程' },
    }]);
    prisma.enrollment.findMany.mockResolvedValue([{
      id: 'enrollment-1',
      enrolledAt: new Date('2026-08-20T12:00:00Z'),
      course: {
        id: 'course-1',
        title: '平台课程',
        chapters: [{ lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }] }],
        progressRecords: [{ lessonId: 'lesson-1', status: 'completed', updatedAt: new Date('2026-08-21T12:00:00Z') }],
      },
    }]);

    const result = await service.getHome('user-1');

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'project-1', kind: 'ai_personal', continueHref: '/ai-courses/project-1/learn/ai-lesson' }),
      expect.objectContaining({ id: 'course-1', kind: 'platform', progress: 50, continueHref: '/dashboard/learning/course-1/lesson-1' }),
    ]);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1', course: { origin: 'platform' } }),
    }));
  });

  it('routes unfinished planning projects back to their plan', async () => {
    prisma.learningProject.findMany.mockResolvedValue([{
      id: 'project-plan',
      status: 'plan_ready',
      lastAccessedAt: null,
      activeLessonId: null,
      course: { title: '待确认课程' },
    }]);
    prisma.enrollment.findMany.mockResolvedValue([]);

    const result = await service.getHome('user-1');

    expect(result.items[0]?.continueHref).toBe('/ai-courses/project-plan/plan');
  });

  it('excludes AI projects when the effective capability is disabled', async () => {
    const module = await Test.createTestingModule({ providers: [
      LearningHomeService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(false) } },
    ] }).compile();
    prisma.enrollment.findMany.mockResolvedValue([]);
    const disabledService = module.get(LearningHomeService);
    await expect(disabledService.getHome('user-1')).resolves.toEqual({ items: [], nextCursor: null });
    expect(prisma.learningProject.findMany).not.toHaveBeenCalled();
  });

});
