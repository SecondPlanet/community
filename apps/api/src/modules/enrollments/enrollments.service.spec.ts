import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadgesService } from '../badges/badges.service';
import { CostType } from '@prisma/client';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';

// Mock PrismaService. enrollments.service only uses:
//   - course.findUnique
//   - enrollment.findMany
//   - enrollment.upsert
const mockPrisma: any = {
  course: {
    findUnique: jest.fn(),
  },
  enrollment: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

const mockBadgesService: any = {
  checkAndAward: jest.fn().mockResolvedValue(undefined),
};

const mockCourseAccess = {
  assertCanEnroll: jest.fn(),
};

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.course.findUnique.mockReset();
    mockPrisma.enrollment.findMany.mockReset();
    mockPrisma.enrollment.upsert.mockReset();
    mockBadgesService.checkAndAward.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BadgesService, useValue: mockBadgesService },
        { provide: CourseAccessPolicyService, useValue: mockCourseAccess },
      ],
    }).compile();

    service = module.get<EnrollmentsService>(EnrollmentsService);
  });

  // ============================================================
  // findByUser
  // ============================================================
  describe('findByUser', () => {
    it('应返回用户报名列表 (含 course + degree, 最多 100)', async () => {
      const mockList = [
        { id: 'e1', userId: 'u1', courseId: 'c1', degreeId: null, course: { id: 'c1' }, degree: null },
        { id: 'e2', userId: 'u1', courseId: null, degreeId: 'd1', course: null, degree: { id: 'd1' } },
      ];
      mockPrisma.enrollment.findMany.mockResolvedValue(mockList);

      const result = await service.findByUser('u1');

      expect(result).toEqual(mockList);
      expect(mockPrisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'u1',
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
          include: { course: true, degree: true },
          take: 100,
        }),
      );
    });
  });

  // ============================================================
  // enrollFreeCourse
  // ============================================================
  describe('enrollFreeCourse', () => {
    it('应成功报名 free 课程 (create path)', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.free,
      });
      mockPrisma.enrollment.upsert.mockResolvedValue({
        id: 'e1',
        userId: 'u1',
        courseId: 'c1',
        source: 'direct',
      });

      const result = await service.enrollFreeCourse('u1', 'c1');

      expect(result).toMatchObject({ id: 'e1', userId: 'u1', courseId: 'c1' });
      expect(mockCourseAccess.assertCanEnroll).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1', costType: CostType.free }),
        { userId: 'u1', role: undefined },
      );
      expect(mockPrisma.enrollment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_courseId: { userId: 'u1', courseId: 'c1' } },
          create: expect.objectContaining({
            userId: 'u1',
            courseId: 'c1',
            source: 'direct',
          }),
          update: {
            deletedAt: null,
            expiresAt: null,
            enrolledAt: expect.any(Date),
            source: 'direct',
          },
        }),
      );
    });

    it('应允许 charity 课程 (同 free 路径)', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.charity,
      });
      mockPrisma.enrollment.upsert.mockResolvedValue({
        id: 'e1',
        userId: 'u1',
        courseId: 'c1',
        source: 'direct',
      });

      const result = await service.enrollFreeCourse('u1', 'c1');

      expect(result.id).toBe('e1');
    });

    it('paid 课程应抛 BadRequestException', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.paid,
      });

      await expect(service.enrollFreeCourse('u1', 'c1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.enrollment.upsert).not.toHaveBeenCalled();
    });

    it('课程不存在应抛 BadRequestException', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);

      await expect(service.enrollFreeCourse('u1', 'invalid')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.enrollment.upsert).not.toHaveBeenCalled();
    });

    it('重复报名应幂等 (upsert 走 update path, 返现 enrollment)', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.free,
      });
      // upsert 行为: 找到已存在记录时恢复可能已软删除/过期的报名。
      const existing = {
        id: 'e-existing',
        userId: 'u1',
        courseId: 'c1',
        source: 'direct',
      };
      mockPrisma.enrollment.upsert.mockResolvedValue(existing);

      const result = await service.enrollFreeCourse('u1', 'c1');

      expect(result).toEqual(existing);
      expect(result.id).toBe('e-existing');
    });

    it('应 fire-and-forget 触发 BadgesService.checkAndAward', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.free,
      });
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });

      await service.enrollFreeCourse('u1', 'c1');

      expect(mockBadgesService.checkAndAward).toHaveBeenCalledWith('u1');
    });

    it('BadgesService 抛错不应阻塞 enroll (catch 静默)', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.free,
      });
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });
      mockBadgesService.checkAndAward.mockRejectedValue(new Error('badge boom'));

      // enroll 自身不应 reject, 因为 .catch(() => undefined)
      const result = await service.enrollFreeCourse('u1', 'c1');
      expect(result.id).toBe('e1');
    });
  });
});
