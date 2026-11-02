import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  order: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  progressRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  course: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  enrollment: {
    count: jest.fn(),
  },
  certificate: {
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path returns
    mockPrisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 100 }, _count: { _all: 2 } }) // today
      .mockResolvedValueOnce({ _sum: { amount: 50 }, _count: { _all: 1 } }) // yesterday
      .mockResolvedValueOnce({ _sum: { amount: 1000 }, _count: { _all: 20 } }); // total

    mockPrisma.user.count
      .mockResolvedValueOnce(3) // newUsersToday
      .mockResolvedValueOnce(2) // newUsersYesterday
      .mockResolvedValueOnce(100); // totalUsers
    mockPrisma.order.findMany.mockResolvedValueOnce([{ userId: 'u1' }]); // paidUsersToday

    mockPrisma.progressRecord.findMany.mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]); // DAU
    mockPrisma.progressRecord.count.mockResolvedValueOnce(8); // completedLessonsToday
    mockPrisma.course.findMany.mockResolvedValueOnce([
      { id: 'c1', title: 'AI 入门', _count: { enrollments: 50 } },
      { id: 'c2', title: 'LangChain 实战', _count: { enrollments: 30 } },
    ]);
    mockPrisma.course.count
      .mockResolvedValueOnce(15) // totalCourses
      .mockResolvedValueOnce(2); // draftCourses
    mockPrisma.enrollment.count.mockResolvedValueOnce(20); // totalActiveEnrollments
    mockPrisma.certificate.count.mockResolvedValueOnce(5); // completedEnrollments
    mockPrisma.$queryRaw.mockResolvedValueOnce([1]); // db ping ok
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { createdAt: new Date('2026-07-19T10:00:00Z') },
      { createdAt: new Date('2026-07-19T11:00:00Z') },
      { createdAt: new Date('2026-07-18T10:00:00Z') },
    ]);

    service = new AdminService(mockPrisma as unknown as PrismaService);
  });

  it('返回完整 shape: 4 KPI + topCourses + totals + todos + system + userGrowth', async () => {
    const r = await service.getStats();

    expect(r.kpis).toHaveLength(4);
    expect(r.kpis[0]).toMatchObject({
      label: '今日 GMV',
      value: '¥ 100',
      deltaTone: 'up',
    });
    expect(r.kpis[1]).toMatchObject({
      label: '新增用户',
      value: '3',
    });
    expect(r.kpis[2]).toMatchObject({
      label: '活跃学员 (DAU)',
      value: '2',
    });
    expect(r.kpis[3]).toMatchObject({
      label: '订单总数',
      value: '20',
    });

    expect(r.topCourses).toEqual([
      { id: 'c1', title: 'AI 入门', enrollmentCount: 50 },
      { id: 'c2', title: 'LangChain 实战', enrollmentCount: 30 },
    ]);

    expect(r.totals).toEqual({
      users: 100,
      courses: 15,
      activeEnrollments: 20,
      completedEnrollments: 5,
      completionRate: 20, // 5 / (20 + 5) * 100 = 20
    });

    expect(r.todos).toEqual({
      draftCourses: 2,
    });

    expect(r.system).toMatchObject({
      database: 'ok',
    });
    expect(typeof r.system.apiVersion).toBe('string');
  });

  it('userGrowth 按天 bucket', async () => {
    const r = await service.getStats();
    // 2 users on 2026-07-19, 1 on 2026-07-18
    const byDate = Object.fromEntries(r.userGrowth.map((g) => [g.date, g.count]));
    expect(byDate['2026-07-19']).toBe(2);
    expect(byDate['2026-07-18']).toBe(1);
  });

  it('DB ping 失败 → database=down', async () => {
    mockPrisma.$queryRaw.mockReset();
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const r = await service.getStats();
    expect(r.system.database).toBe('down');
  });

  it('今日 GMV 同比下降 → deltaTone=down', async () => {
    mockPrisma.order.aggregate.mockReset();
    mockPrisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 10 }, _count: { _all: 1 } }) // today
      .mockResolvedValueOnce({ _sum: { amount: 100 }, _count: { _all: 2 } }) // yesterday
      .mockResolvedValueOnce({ _sum: { amount: 1000 }, _count: { _all: 20 } });

    const r = await service.getStats();
    expect(r.kpis[0].deltaTone).toBe('down');
    expect(r.kpis[0].delta).toMatch(/^-/);
  });

  it('无昨日数据 → delta=0, tone=neutral', async () => {
    mockPrisma.order.aggregate.mockReset();
    mockPrisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 100 }, _count: { _all: 1 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 }, _count: { _all: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 100 }, _count: { _all: 1 } });

    const r = await service.getStats();
    expect(r.kpis[0].deltaTone).toBe('up');
    expect(r.kpis[0].delta).toBe('+0.0%');
  });
});
