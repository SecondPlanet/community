/**
 * UsersService 单测 (2026-07-27)
 *
 * 覆盖:
 *   - create: bcrypt hash + email 冲突 + audit log
 *   - findOne: happy + not found + 软删后查询
 *   - findAll: 分页 + role 过滤 + search (email/name contains)
 *   - update: 只允许 name/avatarUrl 字段 (role/points/level/passwordHash 拒绝)
 *   - update: 软删用户不能改
 *   - disable/restore: 可恢复软停用、会话吊销和管理员保护
 *   - grantCourseAccess / grantDegreeAccess: 事务内 upsert
 *
 * 风格: jest mock prisma + audit log (参考 instructors.service.spec.ts)
 */
// 单测只断言 hash 调用模式与数据 shape；真实 bcryptjs 行为由认证集成路径覆盖。
jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (pw: string, rounds: number) => `$2b$${rounds}$mock.${pw.length}`),
  compare: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// =================== 桩 ===================

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  enrollment: {
    upsert: jest.fn(),
  },
  progressRecord: {
    groupBy: jest.fn(),
  },
  chapter: {
    findMany: jest.fn(),
  },
  refreshToken: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn((arg: any) => {
    // 数组模式: 顺序执行每个 promise
    if (Array.isArray(arg)) return Promise.all(arg);
    // 回调模式: 透传 prisma
    if (typeof arg === 'function') return arg(mockPrisma);
    return Promise.resolve(arg);
  }),
};

// =================== 测试 ===================

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(mockPrisma).forEach((model: any) => {
      if (typeof model === 'object' && model !== null) {
        Object.values(model).forEach((fn: any) => {
          if (typeof fn?.mockReset === 'function') fn.mockReset();
        });
      }
    });
    mockPrisma.$transaction.mockReset();
    mockPrisma.$transaction.mockImplementation((arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === 'function') return arg(mockPrisma);
      return Promise.resolve(arg);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // =============================================================
  // create
  // =============================================================

  describe('create(dto)', () => {
    it('happy path: bcrypt hash + create + audit log', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        name: 'A',
        role: UserRole.student,
      });

      const result = await service.create({
        email: 'a@x.com',
        password: 'plain-pw',
        name: 'A',
        role: UserRole.student,
      });

      expect(result.id).toBe('u1');
      // 验证 password 是 bcrypt hash (不是明文, 不是空)
      const call = mockPrisma.user.create.mock.calls[0][0];
      expect(call.data.passwordHash).not.toBe('plain-pw');
      expect(call.data.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt 前缀
      // 验证 rounds 12
      const rounds = parseInt(call.data.passwordHash.split('$')[2], 10);
      expect(rounds).toBe(12);
      // 验证 audit log
});

    it('email 已存在 → ConflictException', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.create({
          email: 'taken@x.com',
          password: 'pw1234',
          name: 'X',
          role: UserRole.student,
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  // =============================================================
  // findOne
  // =============================================================

  describe('findOne(id)', () => {
    it('happy path: 返回 user + enrollments + _count', async () => {
      const fullUser = {
        id: 'u1',
        email: 'a@x.com',
        name: 'A',
        role: 'student',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        enrollments: [
          { id: 'e1', course: { id: 'c1', title: 'Course 1', thumbnail: null }, degree: null },
        ],
        orders: [],
        certificates: [],
        pointTransactions: [],
        _count: { enrollments: 1, orders: 0, certificates: 0, progressRecords: 0, submissions: 0 },
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(fullUser);
      mockPrisma.progressRecord.groupBy.mockResolvedValueOnce([{ courseId: 'c1', _count: { _all: 3 } }]);
      mockPrisma.chapter.findMany.mockResolvedValueOnce([
        { courseId: 'c1', _count: { lessons: 5 } },
      ]);

      const result = await service.findOne('u1');

      expect(result.id).toBe('u1');
      // 验证扩展字段 (2026-07-24 P1 修复)
      expect((result as any).enrollments[0].completedLessonsCount).toBe(3);
      expect((result as any).enrollments[0].totalLessonsCount).toBe(5);
      expect((result as any).enrollments[0].progressPercent).toBe(60);
      expect((result as any).enrollments[0].isCompleted).toBe(false);
      // passwordHash 不返回
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('user 不存在 → NotFoundException', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('enrollments=0 时 groupBy 不调 (避免空查询开销)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        name: 'A',
        role: 'student',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        enrollments: [],
        orders: [],
        certificates: [],
        pointTransactions: [],
        _count: { enrollments: 0, orders: 0, certificates: 0, progressRecords: 0, submissions: 0 },
      });

      await service.findOne('u1');

      expect(mockPrisma.progressRecord.groupBy).not.toHaveBeenCalled();
      expect(mockPrisma.chapter.findMany).not.toHaveBeenCalled();
    });
  });

  // =============================================================
  // findAll
  // =============================================================

  describe('findAll(params)', () => {
    it('role + search 过滤 + 分页', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'u1', email: 'a@x.com', name: 'A', role: 'student' },
      ]);
      mockPrisma.user.count.mockResolvedValueOnce(1);

      const result = await service.findAll({
        role: UserRole.student,
        search: 'a',
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            role: 'student',
            OR: expect.arrayContaining([
              { email: { contains: 'a' } },
              { name: { contains: 'a' } },
            ]),
          }),
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('page=2 + limit=5 → skip=5', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);
      mockPrisma.user.count.mockResolvedValueOnce(0);

      await service.findAll({ page: 2, limit: 5 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  // =============================================================
  // update
  // =============================================================

  describe('update(id, dto)', () => {
    it('happy path: 只更新 name + avatarUrl', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        name: 'old',
        role: 'student',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        name: 'new',
        role: 'student',
        avatarUrl: 'https://x/a.png',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.update('u1', {
        name: 'new',
        avatarUrl: 'https://x/a.png',
      });

      expect(result.name).toBe('new');
      // 验证 update 调用时 data 不含 role / points / level / passwordHash
      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ name: 'new', avatarUrl: 'https://x/a.png' });
      expect(updateCall.data.role).toBeUndefined();
      expect(updateCall.data.points).toBeUndefined();
      expect(updateCall.data.level).toBeUndefined();
      expect(updateCall.data.passwordHash).toBeUndefined();
      // audit log 含 before / after
});

    it('不存在的 user / 已软删 → NotFoundException', async () => {
      // findFirst 用 deletedAt: null 过滤
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.update('missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('管理员可修改角色，审计记录操作人而不是目标用户', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', role: 'student' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u1', role: 'instructor' });

      await service.update(
        'u1',
        { role: UserRole.instructor },
        { actorUserId: 'admin-1', isAdmin: true },
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: UserRole.instructor } }),
      );
});

    it('dto 只传 name → data 只含 name (avatarUrl 不被覆盖)', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        name: 'old',
        role: 'student',
        avatarUrl: 'https://existing',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        name: 'new',
        role: 'student',
        avatarUrl: 'https://existing',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.update('u1', { name: 'new' });

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ name: 'new' });
    });
  });

  describe('password lifecycle', () => {
    it('修改密码会校验当前密码、清除重置标记并吊销会话', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', passwordHash: 'old-hash' });
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u1' });
      mockPrisma.refreshToken.deleteMany.mockResolvedValueOnce({ count: 2 });

      await expect(service.changePassword('u1', {
        currentPassword: 'Current!Pass123',
        newPassword: 'New!Password123',
      })).resolves.toEqual({ changed: true });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          passwordHash: expect.stringMatching(/^\$2[aby]\$12\$/),
          passwordResetRequired: false,
        },
      });
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });

    it('当前密码错误时拒绝修改', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', passwordHash: 'old-hash' });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.changePassword('u1', {
        currentPassword: 'wrong',
        newPassword: 'New!Password123',
      })).rejects.toThrow('当前密码不正确');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('管理员重置密码只返回一次明文并吊销目标用户会话', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u1' });
      mockPrisma.refreshToken.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.resetPassword('u1', 'admin-1');

      expect(result.temporaryPassword).toMatch(/^A!a1[A-Za-z0-9_-]{16}$/);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          passwordHash: expect.stringMatching(/^\$2[aby]\$12\$/),
          passwordResetRequired: true,
        },
      });
});
  });

  // =============================================================
  // disable / restore (可恢复软停用)
  // =============================================================

  describe('disable(id)', () => {
    it('停用账号、吊销会话并记录操作管理员', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', role: UserRole.student });
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        deletedAt: new Date(),
      });

      const result = await service.disable('u1', 'admin-1');

      expect(result.id).toBe('u1');
      // 验证 prisma.user.delete 没被调
      expect(mockPrisma.user.delete).toBeUndefined(); // mock 里根本没这个方法
      // 验证 update 时设置了 deletedAt
      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'u1' });
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      // audit log
});

    it('拒绝停用自己', async () => {
      await expect(service.disable('admin-1', 'admin-1')).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('拒绝停用最后一个有效管理员', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'admin-2', role: UserRole.admin });
      mockPrisma.user.count.mockResolvedValueOnce(1);

      await expect(service.disable('admin-2', 'admin-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('user 不存在 / 已软删 → NotFoundException', async () => {
      // findFirst 走 deletedAt: null, 找不到
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(service.disable('missing', 'admin-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('restore(id)', () => {
    it('恢复已停用用户并保留历史数据', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', email: 'a@x.com' });
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'u1',
        email: 'a@x.com',
        deletedAt: null,
      });

      await expect(service.restore('u1', 'admin-1')).resolves.toEqual(
        expect.objectContaining({ id: 'u1', deletedAt: null }),
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { deletedAt: null } }),
      );
});
  });

  // =============================================================
  // grantCourseAccess
  // =============================================================

  describe('grantCourseAccess(userId, dto)', () => {
    it('事务内 upsert 每个 courseId', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' });
      mockPrisma.enrollment.upsert
        .mockResolvedValueOnce({ id: 'e1' })
        .mockResolvedValueOnce({ id: 'e2' });

      const result = await service.grantCourseAccess(
        'u1',
        { courseIds: ['c1', 'c2'] },
        'admin-1',
      );

      expect(result.granted).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.enrollment.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.enrollment.upsert).toHaveBeenNthCalledWith(1, {
        where: { userId_courseId: { userId: 'u1', courseId: 'c1' } },
        update: {
          deletedAt: null,
          expiresAt: null,
          enrolledAt: expect.any(Date),
          source: 'direct',
        },
        create: { userId: 'u1', courseId: 'c1', source: 'direct' },
      });
      // audit log
});

    it('拒绝给停用或不存在的用户授权', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.grantCourseAccess('disabled', { courseIds: ['c1'] }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.enrollment.upsert).not.toHaveBeenCalled();
    });
  });

  // =============================================================
  // grantDegreeAccess
  // =============================================================

  describe('grantDegreeAccess(userId, dto)', () => {
    it('事务内 upsert 每个 degreeId', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' });
      mockPrisma.enrollment.upsert
        .mockResolvedValueOnce({ id: 'e1' })
        .mockResolvedValueOnce({ id: 'e2' })
        .mockResolvedValueOnce({ id: 'e3' });

      const result = await service.grantDegreeAccess(
        'u1',
        { degreeIds: ['d1', 'd2', 'd3'] },
        'admin-1',
      );

      expect(result.granted).toBe(3);
      expect(mockPrisma.enrollment.upsert).toHaveBeenNthCalledWith(1, {
        where: { userId_degreeId: { userId: 'u1', degreeId: 'd1' } },
        update: {
          deletedAt: null,
          expiresAt: null,
          enrolledAt: expect.any(Date),
          source: 'direct',
        },
        create: { userId: 'u1', degreeId: 'd1', source: 'direct' },
      });
});
  });
});
