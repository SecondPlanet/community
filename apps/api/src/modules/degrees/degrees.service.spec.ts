import { BadRequestException } from '@nestjs/common';
import { DegreesService } from './degrees.service';
import { PUBLIC_COURSE_WHERE } from '../../common/course-access/course-access-policy.service';

describe('DegreesService course visibility', () => {
  it('filters linked courses from public degree reads', async () => {
    const prisma = {
      nanoDegree: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DegreesService(prisma as never);

    await service.findAll({ status: 'published' as never });

    expect(prisma.nanoDegree.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          courses: expect.objectContaining({
            where: { course: PUBLIC_COURSE_WHERE },
          }),
        }),
      }),
    );
  });

  it('rejects replacing a degree curriculum with a private or draft course', async () => {
    const prisma = {
      course: { count: jest.fn().mockResolvedValue(1) },
      degreeCourse: { deleteMany: jest.fn(), createMany: jest.fn() },
      nanoDegree: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new DegreesService(prisma as never);

    await expect(service.linkCourses('degree-1', {
      courses: [
        { courseId: 'public-1', orderIndex: 0 },
        { courseId: 'private-1', orderIndex: 1 },
      ],
    })).rejects.toThrow(BadRequestException);
    expect(prisma.course.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['public-1', 'private-1'] },
        ...PUBLIC_COURSE_WHERE,
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
