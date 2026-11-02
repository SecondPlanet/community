import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BadgeCriteriaType } from '@prisma/client';
import { PointsService } from '../points/points.service';

export interface UserStats {
  completedCourseIds: string[];
  completedLessonsCount: number;
  streakDays: number;
  enrollmentsCount: number;
  completedPracticesCount: number;
  points: number;
}

@Injectable()
export class BadgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService,
  ) {}

  // ==================== 公共查询 ====================

  async findAllActive() {
    return this.prisma.badge.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findAllAdmin() {
    return this.prisma.badge.findMany({
      orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string) {
    const badge = await this.prisma.badge.findUnique({ where: { id } });
    if (!badge) throw new NotFoundException('Badge not found');
    return badge;
  }

  async findByCode(code: string) {
    return this.prisma.badge.findUnique({ where: { code } });
  }

  // ==================== 用户徽章墙（含进度） ====================

  async getUserBadgesWithStatus(userId: string) {
    const [badges, userStats, userBadges] = await Promise.all([
      this.findAllActive(),
      this.computeUserStats(userId),
      this.prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
      }),
    ]);

    const unlockedMap = new Map(userBadges.map((ub) => [ub.badgeId, ub.unlockedAt]));

    return badges.map((badge) => {
      // P1-3 嵌套规则优先
      const evalResult: { passed: boolean; current: number; target: number } = badge.criteriaJson
        ? this.evaluateCriteria(badge.criteriaJson, userStats)
        : { ...this.computeProgress(badge.criteriaType, badge.criteriaValue, userStats), passed: false };
      evalResult.passed = evalResult.current >= evalResult.target;
      const unlocked = !!unlockedMap.get(badge.id);
      return {
        ...badge,
        unlocked,
        unlockedAt: unlockedMap.get(badge.id) ?? null,
        progress: evalResult.current,
        target: evalResult.target,
      };
    });
  }

  /** 检查并发放符合条件的徽章 */
  async checkAndAward(userId: string) {
    const [badges, userStats, existingUserBadges] = await Promise.all([
      this.findAllActive(),
      this.computeUserStats(userId),
      this.prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
    ]);

    const unlockedBadgeIds = new Set(existingUserBadges.map((ub) => ub.badgeId));
    const newlyUnlocked: { badgeId: string; name: string; pointsAwarded: number }[] = [];

    for (const badge of badges) {
      if (unlockedBadgeIds.has(badge.id)) continue;

      // P1-3 嵌套规则
      const baseProgress = badge.criteriaJson
        ? this.evaluateCriteria(badge.criteriaJson, userStats)
        : { ...this.computeProgress(badge.criteriaType, badge.criteriaValue, userStats), passed: false };
      const passed = baseProgress.passed ?? baseProgress.current >= baseProgress.target;
      if (passed) {
        try {
          await this.prisma.userBadge.create({
            data: { userId, badgeId: badge.id },
          });

          let pointsAwarded = 0;
          if (badge.points > 0) {
            await this.pointsService.award(
              userId,
              badge.points,
              `解锁徽章「${badge.name}」`,
              'badge',
              badge.id,
            );
            pointsAwarded = badge.points;
          }

          newlyUnlocked.push({ badgeId: badge.id, name: badge.name, pointsAwarded });
          unlockedBadgeIds.add(badge.id);
        } catch (e: any) {
          // 并发唯一约束冲突时忽略
          if (e.code !== 'P2002') throw e;
        }
      }
    }

    return newlyUnlocked;
  }

  // ==================== 管理员 CRUD ====================

  async create(dto: {
    code: string;
    name: string;
    description: string;
    icon?: string;
    category?: string;
    criteriaType: BadgeCriteriaType;
    criteriaValue?: number;
    points?: number;
    isActive?: boolean;
    orderIndex?: number;
  }) {
    return this.prisma.badge.create({
      data: {
        ...dto,
        criteriaValue: dto.criteriaValue ?? 1,
        points: dto.points ?? 0,
        isActive: dto.isActive ?? true,
        orderIndex: dto.orderIndex ?? 0,
        icon: dto.icon ?? 'award',
        category: dto.category ?? 'general',
      },
    });
  }

  async update(id: string, dto: Partial<Parameters<BadgesService['create']>[0]>) {
    await this.findById(id);
    return this.prisma.badge.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.badge.delete({ where: { id } });
    return { message: 'Badge deleted successfully' };
  }

  // ==================== 管理员数据看板 ====================

  async getAdminStats() {
    const [
      totalUsers,
      activeUsers7d,
      totalLessonsCompleted,
      totalBadgesUnlocked,
      badgeDistribution,
      leaderboard,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.progressRecord.groupBy({
        by: ['userId'],
        where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }).then((rows) => rows.length),
      this.prisma.progressRecord.count({ where: { status: 'completed' } }),
      this.prisma.userBadge.count(),
      this.prisma.userBadge.groupBy({
        by: ['badgeId'],
        _count: { badgeId: true },
      }),
      this.prisma.user.findMany({
        orderBy: { points: 'desc' },
        take: 10,
        select: { id: true, name: true, points: true, level: true },
      }),
    ]);

    const badges = await this.prisma.badge.findMany({
      where: { id: { in: badgeDistribution.map((d) => d.badgeId) } },
      select: { id: true, name: true, icon: true },
    });

    const badgeMap = new Map(badges.map((b) => [b.id, b]));

    return {
      totalUsers,
      activeUsers7d,
      totalLessonsCompleted,
      totalBadgesUnlocked,
      badgeDistribution: badgeDistribution
        .map((d) => ({
          badgeId: d.badgeId,
          name: badgeMap.get(d.badgeId)?.name ?? d.badgeId,
          icon: badgeMap.get(d.badgeId)?.icon ?? 'award',
          count: d._count.badgeId,
        }))
        .sort((a, b) => b.count - a.count),
      leaderboard: leaderboard.map((u) => ({
        userId: u.id,
        name: u.name ?? '匿名用户',
        points: u.points,
        level: u.level,
      })),
    };
  }

  // ==================== 内部工具 ====================

  private async computeUserStats(userId: string): Promise<UserStats> {
    const [
      completedLessons,
      completedCourses,
      enrollmentsCount,
      completedPractices,
      user,
      streakDays,
    ] = await Promise.all([
      this.prisma.progressRecord.count({
        where: {
          userId,
          status: 'completed',
          course: { origin: 'platform' },
          lesson: {
            deletedAt: null,
            isHidden: false,
            chapter: { deletedAt: null },
          },
        },
      }),
      this.getCompletedCourseIds(userId),
      this.prisma.enrollment.count({
        where: { userId, deletedAt: null, course: { origin: 'platform' } },
      }),
      this.prisma.practiceCompletion.count({
        where: {
          userId,
          status: 'completed',
          project: { course: { origin: 'platform' } },
        },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
      this.computeStreakDays(userId),
    ]);

    return {
      completedCourseIds: completedCourses,
      completedLessonsCount: completedLessons,
      streakDays,
      enrollmentsCount,
      completedPracticesCount: completedPractices,
      points: user?.points ?? 0,
    };
  }

  /** 返回用户已完整完成的课程 ID 列表 */
  private async getCompletedCourseIds(userId: string): Promise<string[]> {
    // 查询该用户所有已报名/有进度的课程，统计每门课完成课时数 vs 总课时数
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, deletedAt: null, course: { origin: 'platform' } },
      select: { courseId: true },
    });

    const courseIds = enrollments.map((e) => e.courseId).filter((id): id is string => !!id);
    if (courseIds.length === 0) return [];

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds }, origin: 'platform' },
      include: {
        chapters: {
          where: { deletedAt: null },
          include: {
            lessons: {
              where: { deletedAt: null, isHidden: false },
              select: { id: true },
            },
          },
        },
      },
    });

    const progressRecords = await this.prisma.progressRecord.findMany({
      where: {
        userId,
        status: 'completed',
        course: { origin: 'platform' },
        lesson: {
          deletedAt: null,
          isHidden: false,
          chapter: { deletedAt: null },
        },
      },
      select: { lessonId: true },
    });
    const completedLessonIds = new Set(progressRecords.map((p) => p.lessonId));

    const completedCourseIds: string[] = [];
    for (const course of courses) {
      const allLessonIds = course.chapters.flatMap((c) => c.lessons.map((l) => l.id));
      if (allLessonIds.length > 0 && allLessonIds.every((id) => completedLessonIds.has(id))) {
        completedCourseIds.push(course.id);
      }
    }

    return completedCourseIds;
  }

  /** 基于 progressRecord.completedAt 计算连续学习天数 */
  private async computeStreakDays(userId: string): Promise<number> {
    const records = await this.prisma.progressRecord.findMany({
      where: {
        userId,
        status: 'completed',
        completedAt: { not: null },
        course: { origin: 'platform' },
        lesson: {
          deletedAt: null,
          isHidden: false,
          chapter: { deletedAt: null },
        },
      },
      select: { completedAt: true },
      orderBy: { completedAt: 'desc' },
    });

    if (records.length === 0) return 0;

    const dates = Array.from(
      new Set(records.map((r) => new Date(r.completedAt!).toISOString().slice(0, 10))),
    ).sort().reverse();

    let streak = 1;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 如果今天和昨天都没活动，连续中断
    if (dates[0] !== today && dates[0] !== yesterday) return 0;

    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffDays = (prev.getTime() - curr.getTime()) / (24 * 60 * 60 * 1000);
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  private computeProgress(
    type: BadgeCriteriaType,
    target: number,
    stats: UserStats,
  ): { current: number; target: number } {
    switch (type) {
      case 'course_completed':
        return { current: stats.completedCourseIds.length, target };
      case 'lessons_completed':
        return { current: stats.completedLessonsCount, target };
      case 'streak_days':
        return { current: stats.streakDays, target };
      case 'first_enrollment':
        return { current: stats.enrollmentsCount, target: Math.max(1, target) };
      case 'practice_completed':
        return { current: stats.completedPracticesCount, target };
      case 'points_reached':
        return { current: stats.points, target };
      // P1 修复(2026-07-24): 完成指定课程, 1 = 已修过, 0 = 没修
      // leaf 节点带 courseId, 但 computeProgress 只看 stats, 所以这个 case
      // 实际不工作 — 真正的判定走 evaluateCriteria 叶子分支
      case 'course_specific':
        return { current: 0, target: 1 };
      default:
        return { current: 0, target };
    }
  }

  /**
   * P1-3 嵌套规则 DSL 评估
   *
   * 支持两种结构:
   * 1) 叶子节点: { type: 'course_completed', value: 5 }
   * 2) 组合节点: { op: 'and' | 'or' | 'not', rules: [...] }
   *
   * 返回: { passed: boolean, current: number, target: number }
   *   - passed: 规则是否达成
   *   - current: 进度(组合节点 = 命中子规则数 / 总数)
   *   - target: 目标(组合节点 = 子规则总数)
   */
  evaluateCriteria(
    criteria: any,
    stats: UserStats,
  ): { passed: boolean; current: number; target: number } {
    if (!criteria) return { passed: false, current: 0, target: 0 };
    if (criteria.op) {
      // 组合节点
      const childResults = (criteria.rules ?? []).map((r: any) =>
        this.evaluateCriteria(r, stats),
      );
      const total = childResults.length;
      const passedCount = childResults.filter(
        (r: { passed: boolean }) => r.passed,
      ).length;
      let passedAll = false;
      if (criteria.op === 'and') {
        passedAll = total > 0 && childResults.every((r: { passed: boolean }) => r.passed);
      } else if (criteria.op === 'or') {
        passedAll = childResults.some((r: { passed: boolean }) => r.passed);
      } else if (criteria.op === 'not') {
        // not: 所有子规则都不通过(not 的语义)
        passedAll = childResults.every((r: { passed: boolean }) => !r.passed);
      }
      return { passed: passedAll, current: passedCount, target: total };
    }
    // 叶子
    if (criteria.type === 'course_specific') {
      // P1 修复(2026-07-24): 完成指定 courseId
      const courseId = criteria.courseId as string | undefined;
      const passed = !!courseId && stats.completedCourseIds.includes(courseId);
      return { passed, current: passed ? 1 : 0, target: 1 };
    }
    const leaf = this.computeProgress(criteria.type, criteria.value ?? 1, stats);
    return { passed: leaf.current >= leaf.target, current: leaf.current, target: leaf.target };
  }
}
