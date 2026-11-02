import { ForbiddenException } from '@nestjs/common';
import { PracticesService } from './practices.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadgesService } from '../badges/badges.service';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';

describe('PracticesService access control', () => {
  const prisma = {
    practiceProject: { findMany: jest.fn(), findUnique: jest.fn() },
    practiceCompletion: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    course: { findUnique: jest.fn() },
    enrollment: { findFirst: jest.fn(), upsert: jest.fn() },
  };
  const courseAccess = new CourseAccessPolicyService(prisma as unknown as PrismaService);
  const service = new PracticesService(
    prisma as unknown as PrismaService,
    { checkAndAward: jest.fn() } as unknown as BadgesService,
    courseAccess,
  );

  beforeEach(() => jest.clearAllMocks());

  it('redacts project URLs from the public course listing', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1', status: 'published', visibility: 'public', origin: 'platform', ownerUserId: null, costType: 'free',
    });
    prisma.practiceProject.findMany.mockResolvedValue([
      { id: 'practice-1', courseId: 'course-1', projectUrl: 'https://private.example/lab' },
    ]);

    await expect(service.getProjectsByCourseId('course-1')).resolves.toEqual([
      { id: 'practice-1', courseId: 'course-1', projectUrl: '' },
    ]);
  });

  it('returns full projects for free courses', async () => {
    const projects = [{ id: 'practice-1', courseId: 'course-1', projectUrl: 'https://example.org/lab' }];
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1', status: 'published', visibility: 'public', origin: 'platform', ownerUserId: null, costType: 'free',
    });
    prisma.enrollment.upsert.mockResolvedValue({ id: 'enrollment-1' });
    prisma.practiceProject.findMany.mockResolvedValue(projects);

    await expect(service.getAccessibleProjectsByCourseId('user-1', 'course-1')).resolves.toBe(projects);
    expect(prisma.enrollment.upsert).toHaveBeenCalled();
  });

  it('requires an active enrollment for paid-course projects', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1', status: 'published', visibility: 'public', origin: 'platform', ownerUserId: null, costType: 'paid',
    });
    prisma.enrollment.findFirst.mockResolvedValue(null);

    await expect(service.getAccessibleProjectsByCourseId('user-1', 'course-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1', courseId: 'course-1', deletedAt: null }),
    }));
  });
});
