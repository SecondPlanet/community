import { BadgesService, UserStats } from './badges.service';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from '../points/points.service';

// ── mocks ────────────────────────────────────────────────────────────────

const mockPrisma: any = {
  badge: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  userBadge: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  progressRecord: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  enrollment: {
    count: jest.fn(),
  },
  practiceCompletion: {
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  course: {
    findMany: jest.fn(),
  },
};
mockPrisma.$transaction = jest.fn(async (cb: (tx: any) => any) => cb(mockPrisma));

const mockPointsService: any = {
  award: jest.fn().mockResolvedValue({ id: 'points-1' }),
};

function makeStats(over: Partial<UserStats> = {}): UserStats {
  return {
    completedCourseIds: [],
    completedLessonsCount: 0,
    streakDays: 0,
    enrollmentsCount: 0,
    completedPracticesCount: 0,
    points: 0,
    ...over,
  };
}

describe('BadgesService', () => {
  let service: BadgesService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset common default implementations
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.badge.findMany.mockResolvedValue([]);
    mockPrisma.userBadge.findMany.mockResolvedValue([]);
    mockPrisma.userBadge.count.mockResolvedValue(0);
    mockPrisma.userBadge.groupBy.mockResolvedValue([]);
    mockPrisma.badge.count.mockResolvedValue(0);
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.progressRecord.count.mockResolvedValue(0);
    mockPrisma.progressRecord.groupBy.mockResolvedValue([]);
    mockPrisma.progressRecord.findMany.mockResolvedValue([]);
    mockPrisma.enrollment.count.mockResolvedValue(0);
    mockPrisma.practiceCompletion.count.mockResolvedValue(0);
    mockPrisma.course.findMany.mockResolvedValue([]);

    // Manual DI — BadgesService doesn't depend on prismaModule's lifecycle
    service = new BadgesService(
      mockPrisma as unknown as PrismaService,
      mockPointsService as unknown as PointsService,
    );
  });

  // ── evaluateCriteria: 叶子节点 ────────────────────────────────────────

  describe('evaluateCriteria - 叶子节点', () => {
    it('lessons_completed 命中阈值', () => {
      const stats = makeStats({ completedLessonsCount: 5 });
      const r = service.evaluateCriteria(
        { type: 'lessons_completed', value: 3 },
        stats,
      );
      expect(r.passed).toBe(true);
      expect(r.current).toBe(5);
      expect(r.target).toBe(3);
    });

    it('lessons_completed 未达阈值', () => {
      const stats = makeStats({ completedLessonsCount: 1 });
      const r = service.evaluateCriteria(
        { type: 'lessons_completed', value: 3 },
        stats,
      );
      expect(r.passed).toBe(false);
      expect(r.current).toBe(1);
      expect(r.target).toBe(3);
    });

    it('points_reached', () => {
      const stats = makeStats({ points: 250 });
      const r = service.evaluateCriteria(
        { type: 'points_reached', value: 100 },
        stats,
      );
      expect(r.passed).toBe(true);
    });

    it('streak_days', () => {
      const stats = makeStats({ streakDays: 7 });
      const r = service.evaluateCriteria({ type: 'streak_days', value: 7 }, stats);
      expect(r.passed).toBe(true);
    });

    it('first_enrollment', () => {
      const stats = makeStats({ enrollmentsCount: 1 });
      const r = service.evaluateCriteria(
        { type: 'first_enrollment', value: 1 },
        stats,
      );
      expect(r.passed).toBe(true);
    });

    it('practice_completed', () => {
      const stats = makeStats({ completedPracticesCount: 2 });
      const r = service.evaluateCriteria(
        { type: 'practice_completed', value: 2 },
        stats,
      );
      expect(r.passed).toBe(true);
    });

    it('value 缺省时默认为 1', () => {
      const stats = makeStats({ enrollmentsCount: 1 });
      const r = service.evaluateCriteria({ type: 'first_enrollment' }, stats);
      expect(r.passed).toBe(true);
      expect(r.target).toBe(1);
    });

    it('criteria 为 null 时返回未通过', () => {
      const r = service.evaluateCriteria(null as any, makeStats());
      expect(r.passed).toBe(false);
    });
  });

  // ── evaluateCriteria: 组合节点 ────────────────────────────────────────

  describe('evaluateCriteria - 组合节点', () => {
    it('AND 全通过', () => {
      const stats = makeStats({ completedLessonsCount: 5, points: 100 });
      const r = service.evaluateCriteria(
        {
          op: 'and',
          rules: [
            { type: 'lessons_completed', value: 3 },
            { type: 'points_reached', value: 50 },
          ],
        },
        stats,
      );
      expect(r.passed).toBe(true);
      expect(r.current).toBe(2);
      expect(r.target).toBe(2);
    });

    it('AND 部分通过 → 整体不通过', () => {
      const stats = makeStats({ completedLessonsCount: 5, points: 10 });
      const r = service.evaluateCriteria(
        {
          op: 'and',
          rules: [
            { type: 'lessons_completed', value: 3 },
            { type: 'points_reached', value: 50 },
          ],
        },
        stats,
      );
      expect(r.passed).toBe(false);
      expect(r.current).toBe(1);
      expect(r.target).toBe(2);
    });

    it('OR 任一通过', () => {
      const stats = makeStats({ completedLessonsCount: 1, points: 0 });
      const r = service.evaluateCriteria(
        {
          op: 'or',
          rules: [
            { type: 'lessons_completed', value: 3 },
            { type: 'points_reached', value: 50 },
          ],
        },
        stats,
      );
      expect(r.passed).toBe(false); // 1 < 3, 0 < 50, 两个都不通过
      // 改 stats 让一个通过
      const stats2 = makeStats({ completedLessonsCount: 5, points: 0 });
      const r2 = service.evaluateCriteria(
        {
          op: 'or',
          rules: [
            { type: 'lessons_completed', value: 3 },
            { type: 'points_reached', value: 50 },
          ],
        },
        stats2,
      );
      expect(r2.passed).toBe(true);
    });

    it('NOT — 所有子规则都不通过', () => {
      const stats = makeStats({ completedLessonsCount: 1 });
      const r = service.evaluateCriteria(
        {
          op: 'not',
          rules: [{ type: 'lessons_completed', value: 100 }],
        },
        stats,
      );
      expect(r.passed).toBe(true); // 1 < 100 → 子规则未通过 → NOT 整体通过
    });

    it('NOT — 有一个子规则通过则整体不通过', () => {
      const stats = makeStats({ completedLessonsCount: 5 });
      const r = service.evaluateCriteria(
        {
          op: 'not',
          rules: [{ type: 'lessons_completed', value: 3 }],
        },
        stats,
      );
      expect(r.passed).toBe(false);
    });

    it('嵌套 AND/OR', () => {
      // (lessons >= 3 AND points >= 50) OR (streak >= 7)
      const stats = makeStats({ completedLessonsCount: 1, points: 10, streakDays: 10 });
      const r = service.evaluateCriteria(
        {
          op: 'or',
          rules: [
            {
              op: 'and',
              rules: [
                { type: 'lessons_completed', value: 3 },
                { type: 'points_reached', value: 50 },
              ],
            },
            { type: 'streak_days', value: 7 },
          ],
        },
        stats,
      );
      expect(r.passed).toBe(true); // streak >= 7 触发 OR
    });

    it('空 rules 数组', () => {
      const r = service.evaluateCriteria({ op: 'and', rules: [] }, makeStats());
      expect(r.passed).toBe(false);
      expect(r.current).toBe(0);
      expect(r.target).toBe(0);
    });
  });
});
