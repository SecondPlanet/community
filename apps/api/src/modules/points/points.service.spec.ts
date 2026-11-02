import { PointsService, calculateLevel, levelThreshold } from './points.service';

type AnyFn = (...args: never[]) => unknown;

describe('PointsService (积分 / 等级)', () => {
  describe('calculateLevel（曲线递增等级）', () => {
    it('0 分为 Lv.1', () => expect(calculateLevel(0)).toBe(1));
    it('低于 100 分停在 Lv.1', () => expect(calculateLevel(99)).toBe(1));
    it('100 分跨入 Lv.2（sqrt 阈值取整）', () => expect(calculateLevel(100)).toBe(2));
    it('400 分跨入 Lv.3', () => expect(calculateLevel(400)).toBe(3));
    it('精确落在阈值上稳定（不因浮点误差掉级）', () => {
      expect(calculateLevel(100)).toBe(2);
      expect(calculateLevel(500)).toBe(3); // floor(sqrt(5))+1 = 3
    });
  });

  describe('levelThreshold', () => {
    it('Lv.1 从 0 分起步', () => expect(levelThreshold(1)).toBe(0));
    it('Lv.2 需累计 100 分', () => expect(levelThreshold(2)).toBe(100));
    it('Lv.3 需累计 400 分', () => expect(levelThreshold(3)).toBe(400));
    it('等级为 0 也返回 ≥0，不吃负值', () => expect(levelThreshold(0)).toBeGreaterThanOrEqual(0));
  });

  function makePrisma(user?: { id: string; points: number; level: number } | null, transactions: unknown[] = []) {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue(user ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
      pointTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue(transactions),
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
      $transaction: jest.fn(async (cb: (tx: never) => unknown) => cb({} as never)),
    };
  }

  describe('getUserPoints', () => {
    it('用户存在时按真实积分计算等级与升级进度并返回近 10 条流水', async () => {
      const prisma = makePrisma({ id: 'user-1', points: 250, level: 1 }, [
        { id: 'tx-a', amount: 50 },
      ]);
      const service = new PointsService(prisma as never);
      const result = await service.getUserPoints('user-1');

      expect(result.points).toBe(250);
      expect(result.level).toBe(2); // floor(sqrt(2.5))+1
      expect(result.currentLevelPoints).toBe(100);
      expect(result.nextLevelPoints).toBe(400);
      expect(result.pointsToNextLevel).toBe(150);
      expect(result.recentTransactions).toEqual([{ id: 'tx-a', amount: 50 }]);
      expect(prisma.pointTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' }, orderBy: { createdAt: 'desc' }, take: 10 }),
      );
    });

    it('用户不存在时返回安全的零值，不抛错', async () => {
      const prisma = makePrisma(null);
      const service = new PointsService(prisma as never);
      const result = await service.getUserPoints('ghost-user');

      expect(result).toEqual({
        points: 0,
        level: 1,
        currentLevelPoints: 0,
        nextLevelPoints: 100,
        pointsToNextLevel: 100,
        recentTransactions: [],
      });
    });
  });

  describe('award（发放积分，幂等）', () => {
    it('amount 为 0 时直接返回 null，不产生任何事务', async () => {
      const prisma = makePrisma();
      const service = new PointsService(prisma as never);
      await expect(service.award('user-1', 0, 'none')).resolves.toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('同一来源重复发放返回 null（幂等，不重复加分）', async () => {
      const prisma = makePrisma(undefined, []);
      prisma.pointTransaction.findUnique.mockResolvedValueOnce({ id: 'existing' });
      const service = new PointsService(prisma as never);
      const result = await service.award('user-1', 50, 'lesson-done', 'lesson', 'lesson-1');
      expect(result).toBeNull();
      expect(prisma.pointTransaction.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('无引用来源时跳过幂等检查，直接落分', async () => {
      const tx = {
        pointTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-bonus' }) },
        user: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue({ points: 10 }) },
      };
      const prisma = makePrisma();
      prisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx as never));
      const service = new PointsService(prisma as never);
      await service.award('user-1', 10, 'bonus');
      expect(prisma.pointTransaction.findUnique).not.toHaveBeenCalled();
      expect(tx.pointTransaction.create).toHaveBeenCalled();
    });

    it('成功发放：ledger 流水 + 余额 increment + 按新余额重算等级在同一事务内', async () => {
      const tx = {
        pointTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-new', amount: 60 }) },
        user: {
          update: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue({ points: 160 }),
        },
      };
      const prisma = makePrisma();
      prisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx));
      const service = new PointsService(prisma as never);

      const result = await service.award('user-1', 60, 'course-complete', 'badge', 'badge-1');

      expect(result).toEqual({ id: 'tx-new', amount: 60 });
      expect(tx.pointTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', amount: 60, reason: 'course-complete', refId: 'badge-1' }) }),
      );
      // 余额从 100 → 160,重算等级 Lv.2
      expect(tx.user.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'user-1' }, data: { level: 2 } }),
      );
    });
  });
});