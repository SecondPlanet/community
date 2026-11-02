import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';

const mockPrisma: any = {
  review: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  reviewHelpful: {
    createMany: jest.fn(),
  },
  course: {
    findUnique: jest.fn(),
  },
  enrollment: {
    findFirst: jest.fn(),
  },
};
mockPrisma.$transaction = jest.fn(async (ops: any) => {
  // $transaction([findMany, count]) → Promise.all → return tuple
  if (Array.isArray(ops)) {
    return Promise.all(ops);
  }
  // $transaction(cb) → run cb
  return ops(mockPrisma);
});

const mockCourseAccess: any = {
  assertCanLearn: jest.fn(),
  assertCanView: jest.fn(),
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.review.findUnique.mockReset();
    mockPrisma.review.findMany.mockReset();
    mockPrisma.review.count.mockReset();
    mockPrisma.review.create.mockReset();
    mockPrisma.review.update.mockReset();
    mockPrisma.review.groupBy.mockReset();
    mockPrisma.reviewHelpful.createMany.mockReset();
    mockPrisma.course.findUnique.mockReset();
    mockPrisma.enrollment.findFirst.mockReset();

    service = new ReviewsService(
      mockPrisma as unknown as PrismaService,
      mockCourseAccess as unknown as CourseAccessPolicyService,
    );
  });

  // ── adminRemove ───────────────────────────────────────────────────────

  describe('adminRemove', () => {
    it('软删 review: content 置 [已删除], 写 audit log', async () => {
      mockPrisma.review.findUnique.mockResolvedValueOnce({
        id: 'r1',
        userId: 'u1',
      });
      mockPrisma.review.update.mockResolvedValueOnce({ id: 'r1' });

      const result = await service.adminRemove('r1');

      expect(result).toEqual({ ok: true, id: 'r1' });
      expect(mockPrisma.review.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: {
          content: '[已删除]',
          deletedAt: expect.any(Date),
        },
      });
});

    it('review 不存在 → NotFoundException', async () => {
      mockPrisma.review.findUnique.mockResolvedValueOnce(null);
      await expect(service.adminRemove('r-missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });
  });

  // ── findAll (admin 全量列表) ─────────────────────────────────────────

  describe('findAll (admin 全量列表)', () => {
    it('默认分页 1/20', async () => {
      mockPrisma.review.findMany.mockResolvedValueOnce([]);
      mockPrisma.review.count.mockResolvedValueOnce(0);

      const result = await service.findAll({});

      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
      expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('过滤 courseId', async () => {
      mockPrisma.review.findMany.mockResolvedValueOnce([]);
      mockPrisma.review.count.mockResolvedValueOnce(0);

      await service.findAll({ courseId: 'c1', page: 2, limit: 10 });

      expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { courseId: 'c1', deletedAt: null },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('过滤 rating + onlyDeleted', async () => {
      mockPrisma.review.findMany.mockResolvedValueOnce([]);
      mockPrisma.review.count.mockResolvedValueOnce(0);

      await service.findAll({ rating: 5, onlyDeleted: true });

      expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rating: 5, deletedAt: { not: null } },
        }),
      );
    });

    it('limit 上限 100', async () => {
      mockPrisma.review.findMany.mockResolvedValueOnce([]);
      mockPrisma.review.count.mockResolvedValueOnce(0);

      await service.findAll({ limit: 9999 });

      expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  // ── getDistribution ───────────────────────────────────────────────────

  describe('getDistribution', () => {
    it('无评价时 all zero', async () => {
      mockPrisma.review.groupBy.mockResolvedValueOnce([]);

      const r = await service.getDistribution('c1');
      expect(r).toEqual({
        total: 0,
        avg: 0,
        counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        percentages: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    });

    it('混合评分算平均 + 百分比', async () => {
      mockPrisma.review.groupBy.mockResolvedValueOnce([
        { rating: 5, _count: { _all: 2 } },
        { rating: 3, _count: { _all: 2 } },
      ]);

      const r = await service.getDistribution('c1');
      expect(r.total).toBe(4);
      expect(r.avg).toBe(4); // (5*2 + 3*2) / 4 = 4
      expect(r.counts).toEqual({ 1: 0, 2: 0, 3: 2, 4: 0, 5: 2 });
      expect(r.percentages).toEqual({ 1: 0, 2: 0, 3: 50, 4: 0, 5: 50 });
    });
  });

  describe('markHelpful', () => {
    it('records one user vote and increments the cached counter atomically', async () => {
      mockPrisma.review.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'author',
        courseId: 'c1',
        deletedAt: null,
      });
      mockPrisma.reviewHelpful.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.review.update.mockResolvedValue({ id: 'r1', helpful: 3 });

      await expect(service.markHelpful('voter', 'r1')).resolves.toEqual({
        id: 'r1',
        helpful: 3,
      });
      expect(mockPrisma.reviewHelpful.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'voter', reviewId: 'r1' }],
        skipDuplicates: true,
      });
    });

    it('rejects a duplicate users vote without incrementing', async () => {
      mockPrisma.review.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'author',
        courseId: 'c1',
        deletedAt: null,
      });
      mockPrisma.reviewHelpful.createMany.mockResolvedValue({ count: 0 });

      await expect(service.markHelpful('voter', 'r1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.review.update).not.toHaveBeenCalled();
    });
  });
});
