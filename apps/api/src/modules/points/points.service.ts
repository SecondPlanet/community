import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** 根据累计积分计算等级（曲线递增） */
export function calculateLevel(points: number): number {
  return Math.floor(Math.sqrt(points / 100)) + 1;
}

/** 当前等级起始积分 */
export function levelThreshold(level: number): number {
  return Math.max(0, (level - 1) ** 2 * 100);
}

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取当前用户积分、等级与升级进度 */
  async getUserPoints(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, points: true, level: true },
    });

    if (!user) {
      return {
        points: 0,
        level: 1,
        currentLevelPoints: 0,
        nextLevelPoints: 100,
        pointsToNextLevel: 100,
        recentTransactions: [],
      };
    }

    const level = calculateLevel(user.points);
    const currentLevelPoints = levelThreshold(level);
    const nextLevelPoints = levelThreshold(level + 1);
    const pointsToNextLevel = Math.max(0, nextLevelPoints - user.points);

    const recentTransactions = await this.prisma.pointTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      points: user.points,
      level,
      currentLevelPoints,
      nextLevelPoints,
      pointsToNextLevel,
      recentTransactions,
    };
  }

  /**
   * 发放积分（幂等）
   * @returns 成功发放的 transaction，若已存在则返回 null
   */
  async award(
    userId: string,
    amount: number,
    reason: string,
    refType?: 'lesson' | 'practice' | 'badge' | 'enrollment' | null,
    refId?: string | null,
    client?: Prisma.TransactionClient,
  ) {
    if (amount === 0) return null;

    // 幂等：同一来源不重复发放
    if (refType && refId) {
      const existing = await (client ?? this.prisma).pointTransaction.findUnique({
        where: {
          userId_refType_refId: {
            userId,
            refType,
            refId,
          },
        },
      });
      if (existing) return null;
    }

    // 原子发放: ledger 流水 + 余额更新放进同一事务, 用 increment 累加,
    // 避免两个并发 award 读到同一快照互相覆盖 (丢失积分)。
    // 调用方已处于事务内时 (传入 client) 直接复用, Prisma 不支持嵌套交互式事务。
    const run = async (tx: Prisma.TransactionClient) => {
      const transaction = await tx.pointTransaction.create({
        data: {
          userId,
          amount,
          reason,
          refType: (refType as 'lesson' | 'practice' | 'badge' | 'enrollment' | undefined) ?? null,
          refId: refId ?? null,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { points: { increment: amount } },
      });

      // 在同事务内基于真实余额重算等级 (increment 结果需要再读一次才可知)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { points: true },
      });
      if (user) {
        await tx.user.update({
          where: { id: userId },
          data: { level: calculateLevel(user.points) },
        });
      }

      return transaction;
    };

    if (client) return run(client);
    return this.prisma.$transaction(run);
  }
}
