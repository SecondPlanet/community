import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CostType,
  CourseOrigin,
  CourseStatus,
  CourseVisibility,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../modules/prisma/prisma.service';
import {
  CourseAccessPolicyService,
  CourseAccessSubject,
  PUBLIC_COURSE_WHERE,
} from './course-access-policy.service';

describe('CourseAccessPolicyService', () => {
  const prisma = {
    enrollment: { findFirst: jest.fn(), upsert: jest.fn() },
  };
  const service = new CourseAccessPolicyService(
    prisma as unknown as PrismaService,
  );
  const personalCourse: CourseAccessSubject = {
    id: 'personal-1',
    status: CourseStatus.draft,
    visibility: CourseVisibility.private,
    origin: CourseOrigin.ai_personal,
    ownerUserId: 'owner',
    costType: CostType.free,
  };
  const publicPaid: CourseAccessSubject = {
    id: 'public-paid',
    status: CourseStatus.published,
    visibility: CourseVisibility.public,
    origin: CourseOrigin.platform,
    ownerUserId: null,
    costType: CostType.paid,
  };

  beforeEach(() => jest.clearAllMocks());

  it('exports the canonical public-course selector', () => {
    expect(PUBLIC_COURSE_WHERE).toEqual({
      status: CourseStatus.published,
      visibility: CourseVisibility.public,
    });
  });

  it('allows the owner and an admin to view a private personal course', () => {
    expect(() => service.assertCanView(personalCourse, { userId: 'owner' })).not.toThrow();
    expect(() => service.assertCanView(personalCourse, { userId: 'admin', role: UserRole.admin })).not.toThrow();
  });

  it.each([
    ['another user', { userId: 'user-b', role: UserRole.student }],
    ['an anonymous caller', undefined],
  ])('hides a private personal course from %s with 404', (_label, principal) => {
    expect(() => service.assertCanView(personalCourse, principal)).toThrow(
      NotFoundException,
    );
  });

  it('does not let free pricing bypass private ownership', async () => {
    await expect(
      service.assertCanLearn(personalCourse, {
        userId: 'user-b',
        role: UserRole.student,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.enrollment.upsert).not.toHaveBeenCalled();
  });

  it('keeps public paid preview open but requires active enrollment to learn', async () => {
    prisma.enrollment.findFirst.mockResolvedValue(null);
    await expect(
      service.hasFullContentAccess(publicPaid, { userId: 'student' }),
    ).resolves.toBe(false);
    await expect(
      service.assertCanLearn(publicPaid, { userId: 'student' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('auto-enrolls an authenticated learner only for a public free course', async () => {
    prisma.enrollment.upsert.mockResolvedValue({ id: 'enrollment-1' });
    await service.assertCanLearn(
      { ...publicPaid, id: 'public-free', costType: CostType.free },
      { userId: 'student', role: UserRole.student },
    );
    expect(prisma.enrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_courseId: {
            userId: 'student',
            courseId: 'public-free',
          },
        },
      }),
    );
  });
});
