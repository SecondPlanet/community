/**
 * AdminService — 后台统计数据
 *
 * 替代前端 hardcode mock,接 GET /admin/stats 返回:
 *   - 4 KPI(今日 GMV / 新增用户 / DAU / AI token 成本)
 *   - 4 图表(用户增长 / 课程报名 Top / 收入构成 / 学位完成率漏斗)
 *   - 待办计数
 *   - 系统状态
 *
 * 优化:
 *   - 用 Promise.all 并行 9 个 query(不串行)
 *   - 简单 date math 在 app 进程算,DB 不做
 *   - count(*) 用聚合,不 SELECT 全表
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      todayPaidOrders,
      yesterdayPaidOrders,
      newUsersToday,
      newUsersYesterday,
      paidUsersToday,
      dauUsers,
      completedLessonsToday,
      courseEnrollTop,
      totalOrders,
      totalCourses,
      totalUsers,
      totalActiveEnrollments,
      completedEnrollments,
      // 系统状态
      dbStatus,
    ] = await Promise.all([
      // 1) 今日已支付订单 + 总金额
      this.prisma.order.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { status: 'paid', paidAt: { gte: todayStart } },
      }),
      // 2) 昨日已支付订单
      this.prisma.order.aggregate({
        _sum: { amount: true },
        where: { status: 'paid', paidAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      // 3) 今日新增用户
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      // 4) 昨日新增
      this.prisma.user.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      // 5) 今日付费用户
      this.prisma.order
        .findMany({
          where: { status: 'paid', paidAt: { gte: todayStart } },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((rows) => rows.length),
      // 6) DAU — 今日有 progressRecord 的用户数
      this.prisma.progressRecord
        .findMany({
          where: { updatedAt: { gte: todayStart } },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((rows) => rows.length),
      // 7) 今日真实完成课时数。没有可靠时长遥测时不伪造“平均学习时长”。
      this.prisma.progressRecord.count({
        where: { status: 'completed', completedAt: { gte: todayStart } },
      }),
      // 8) 课程报名 Top
      this.prisma.course.findMany({
        select: {
          id: true,
          title: true,
          _count: { select: { enrollments: true } },
        },
        orderBy: { enrollments: { _count: 'desc' } },
        take: 10,
      }),
      // 9) 总订单数 + 收入
      this.prisma.order.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { status: 'paid' },
      }),
      // 10) 课程总数
      this.prisma.course.count(),
      // 11) 用户总数
      this.prisma.user.count(),
      // 12) 进行中的报名(未完成)
      this.prisma.enrollment.count({
        where: { expiresAt: null },
      }),
      // 13) 已完成(有证书) 报名
      this.prisma.certificate.count(),
      // 14) DB ping
      this.prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const).catch(() => 'down' as const),
    ]);

    // === 派生指标 ===
    const todayGmv = Number(todayPaidOrders._sum.amount ?? 0);
    const yesterdayGmv = Number(yesterdayPaidOrders._sum.amount ?? 0);
    const gmvDelta = yesterdayGmv > 0
      ? ((todayGmv - yesterdayGmv) / yesterdayGmv) * 100
      : 0;
    const userDelta = newUsersYesterday > 0
      ? ((newUsersToday - newUsersYesterday) / newUsersYesterday) * 100
      : 0;
    return {
      kpis: [
        {
          label: '今日 GMV',
          value: `¥ ${todayGmv.toLocaleString()}`,
          delta: `${gmvDelta >= 0 ? '+' : ''}${gmvDelta.toFixed(1)}%`,
          deltaTone: gmvDelta >= 0 ? 'up' : 'down',
          sub: `较昨日 ¥ ${yesterdayGmv.toLocaleString()}`,
        },
        {
          label: '新增用户',
          value: newUsersToday.toString(),
          delta: `${userDelta >= 0 ? '+' : ''}${userDelta.toFixed(1)}%`,
          deltaTone: userDelta >= 0 ? 'up' : 'down',
          sub: `今日付费用户 ${paidUsersToday}`,
        },
        {
          label: '活跃学员 (DAU)',
          value: dauUsers.toString(),
          delta: '—',
          deltaTone: 'neutral',
          sub: `今日完成课时 ${completedLessonsToday}`,
        },
        {
          label: '订单总数',
          value: (totalOrders._count?._all ?? 0).toString(),
          delta: '—',
          deltaTone: 'neutral',
          sub: `累计 GMV ¥ ${Number(totalOrders._sum.amount ?? 0).toLocaleString()}`,
        },
      ],
      // 课程报名 Top
      topCourses: courseEnrollTop.map((c) => ({
        id: c.id,
        title: c.title,
        enrollmentCount: c._count.enrollments,
      })),
      // 收入构成 (按 costType 聚合 paid orders)
      // 简化:返回汇总
      totals: {
        users: totalUsers,
        courses: totalCourses,
        activeEnrollments: totalActiveEnrollments,
        completedEnrollments,
        completionRate:
          totalActiveEnrollments > 0
            ? (completedEnrollments / (totalActiveEnrollments + completedEnrollments)) * 100
            : 0,
      },
      todos: {
        // P2+: 草稿课程 / 黑客松待发布 / review 待审核
        draftCourses: await this.prisma.course.count({ where: { status: 'draft' } }),
      },
      system: {
        database: dbStatus,
        apiVersion: process.env.APP_VERSION ?? process.env.npm_package_version ?? '未提供',
        lastDeploy: process.env.DEPLOYED_AT ?? '未提供',
      },
      // 30 天用户增长(每 5 天一个 bucket)
      userGrowth: await this.getUserGrowth(thirtyDaysAgo),
    };
  }

  private async getUserGrowth(since: Date) {
    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    // 按天 bucket
    const buckets: Record<string, number> = {};
    for (const u of users) {
      const d = u.createdAt.toISOString().slice(0, 10);
      buckets[d] = (buckets[d] ?? 0) + 1;
    }
    return Object.entries(buckets).map(([date, count]) => ({ date, count }));
  }
}
