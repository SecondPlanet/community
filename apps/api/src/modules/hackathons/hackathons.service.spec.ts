import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HackathonsService } from './hackathons.service';
import { PrismaService } from '../prisma/prisma.service';
import { HackathonStatus, Prisma, ReviewStatus, SubmissionStatus } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { UploadsService } from '../uploads/uploads.service';

// Mock PrismaService. hackathons.service hits many tables; we lazy-add the
// ones we use as we go. For $transaction (createTeam), we mirror orders.spec:
// run the callback against the same mockPrisma so conditional paths can run.
const mockPrisma: any = {
  hackathon: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  hackathonRegistration: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  team: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  teamMember: {
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  submission: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  announcement: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};
mockPrisma.$transaction = jest.fn(async (cb: (tx: any) => any) => cb(mockPrisma));

const mockNotifications: any = { create: jest.fn() };
const mockUploads: any = {
  getRegistrationAttachmentUrl: jest.fn(),
  getSubmissionAttachmentUrl: jest.fn(),
  verifyPrivateAttachment: jest.fn(async (_scope: string, _h: string, userId: string, meta: any) => ({
    ...meta,
    uploadedBy: userId,
  })),
};

describe('HackathonsService', () => {
  let service: HackathonsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.hackathon.findUnique.mockReset();
    mockPrisma.hackathon.findMany.mockReset();
    mockPrisma.hackathon.create.mockReset();
    mockPrisma.hackathon.update.mockReset();
    mockPrisma.hackathon.delete.mockReset();
    mockPrisma.hackathonRegistration.findUnique.mockReset();
    mockPrisma.hackathonRegistration.findFirst.mockReset();
    mockPrisma.hackathonRegistration.findMany.mockReset();
    mockPrisma.hackathonRegistration.count.mockReset();
    mockPrisma.hackathonRegistration.create.mockReset();
    mockPrisma.hackathonRegistration.update.mockReset();
    mockPrisma.team.findUnique.mockReset();
    mockPrisma.team.findFirst.mockReset();
    mockPrisma.team.findMany.mockReset();
    mockPrisma.team.count.mockReset();
    mockPrisma.team.create.mockReset();
    mockPrisma.team.delete.mockReset();
    mockPrisma.teamMember.findFirst.mockReset();
    mockPrisma.teamMember.create.mockReset();
    mockPrisma.teamMember.delete.mockReset();
    mockPrisma.submission.findMany.mockReset();
    mockPrisma.submission.findFirst.mockReset();
    mockPrisma.submission.count.mockReset();
    mockPrisma.submission.create.mockReset();
    mockPrisma.submission.update.mockReset();
    mockPrisma.announcement.findMany.mockReset();
    mockPrisma.announcement.create.mockReset();
    mockNotifications.create.mockReset();
    mockNotifications.create.mockResolvedValue({ id: 'n1' });
    mockUploads.getRegistrationAttachmentUrl.mockReset();
    mockUploads.getSubmissionAttachmentUrl.mockReset();
    mockUploads.verifyPrivateAttachment.mockReset();
    mockUploads.verifyPrivateAttachment.mockImplementation(
      async (_scope: string, _h: string, userId: string, meta: any) => ({ ...meta, uploadedBy: userId }),
    );
  });

  async function buildService(): Promise<HackathonsService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HackathonsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: mockNotifications },
        { provide: UploadsService, useValue: mockUploads },
      ],
    }).compile();
    return module.get<HackathonsService>(HackathonsService);
  }

  describe('findAll', () => {
    it('应根据日期修正未及时推进的 upcoming/active 状态并正确筛选', async () => {
      service = await buildService();
      const now = Date.now();
      const base = {
        title: 'Hackathon',
        registrations: [],
      };
      mockPrisma.hackathon.findMany.mockResolvedValue([
        {
          ...base,
          id: 'future',
          status: HackathonStatus.active,
          startDate: new Date(now + 86_400_000),
          endDate: new Date(now + 172_800_000),
        },
        {
          ...base,
          id: 'running',
          status: HackathonStatus.upcoming,
          startDate: new Date(now - 86_400_000),
          endDate: new Date(now + 86_400_000),
        },
        {
          ...base,
          id: 'ended',
          status: HackathonStatus.active,
          startDate: new Date(now - 172_800_000),
          endDate: new Date(now - 86_400_000),
        },
      ]);

      const result = await service.findAll({ status: HackathonStatus.active });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'running', status: HackathonStatus.active });
      expect(mockPrisma.hackathon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // ============================================================
  // create
  // ============================================================
  describe('create', () => {
    it('应创建黑客松 + 默认 min/max team size + 默认 upcoming status', async () => {
      service = await buildService();
      mockPrisma.hackathon.create.mockResolvedValue({
        id: 'h1',
        title: 'AI Hack 2026',
        status: HackathonStatus.upcoming,
        minTeamSize: 1,
        maxTeamSize: 5,
      });

      const result = await service.create(
        {
          title: 'AI Hack 2026',
          description: 'desc',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-15T00:00:00.000Z',
        } as any,
        'organizer-1',
      );

      expect(result).toMatchObject({
        id: 'h1',
        title: 'AI Hack 2026',
        status: HackathonStatus.upcoming,
      });
      expect(mockPrisma.hackathon.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'AI Hack 2026',
            organizerId: 'organizer-1',
            minTeamSize: 1,
            maxTeamSize: 5,
            status: HackathonStatus.upcoming,
          }),
        }),
      );
      // 审计日志
});
  });

  // ============================================================
  // register — 状态机核心
  // ============================================================
  describe('register', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    it('首次报名应 create + 返 registration', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(null);
      mockPrisma.hackathonRegistration.create.mockResolvedValue({
        id: 'r1',
        hackathonId: 'h1',
        userId: 'u1',
        status: 'registered',
      });

      const result = await service.register('u1', 'h1');

      expect(result).toMatchObject({ id: 'r1', status: 'registered' });
      expect(mockPrisma.hackathonRegistration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hackathonId: 'h1',
          userId: 'u1',
          status: 'registered',
          reviewStatus: ReviewStatus.pending,
          answers: {},
        }),
      });
    });

    it('重复报名 (status=registered) 应幂等返现有记录, 不重复 create', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
      });
      const existing = { id: 'r-existing', status: 'registered' };
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(existing);

      const result = await service.register('u1', 'h1');

      expect(result).toEqual(existing);
      expect(mockPrisma.hackathonRegistration.create).not.toHaveBeenCalled();
      expect(mockPrisma.hackathonRegistration.update).not.toHaveBeenCalled();
    });

    it('已取消再报名应 update 回 registered; 内容未变时保留原审核结论', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        id: 'r-old',
        status: 'cancelled',
        answers: {},
        formSnapshot: [],
        reviewStatus: ReviewStatus.approved,
      });
      mockPrisma.hackathonRegistration.update.mockResolvedValue({
        id: 'r-old',
        status: 'registered',
      });

      const result = await service.register('u1', 'h1');

      expect(result).toMatchObject({ id: 'r-old', status: 'registered' });
      const updateArg = mockPrisma.hackathonRegistration.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('registered');
      expect(updateArg.data.reviewStatus).toBeUndefined();
      expect(updateArg.data.deletedAt).toBeNull();
    });

    it('内容变化的重报应重置审核状态为 pending', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
        registrationFields: [
          { id: 'f1', label: '介绍', type: 'text', required: true },
        ],
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        id: 'r-old',
        status: 'registered',
        answers: { f1: '旧答案' },
        formSnapshot: [{ id: 'f1', label: '介绍', type: 'text', required: true }],
        reviewStatus: ReviewStatus.approved,
      });
      mockPrisma.hackathonRegistration.update.mockResolvedValue({
        id: 'r-old',
        status: 'registered',
        reviewStatus: ReviewStatus.pending,
      });

      const result = await service.register('u1', 'h1', { f1: '新答案' });

      expect(result).toMatchObject({ reviewStatus: ReviewStatus.pending });
      expect(mockPrisma.hackathonRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewStatus: ReviewStatus.pending,
            reviewNote: null,
            reviewedAt: null,
            reviewedById: null,
          }),
        }),
      );
    });

    it('内容未变的并发重报不应覆盖审核结论 (返回原记录, 不触发 update)', async () => {
      service = await buildService();
      const answers = { f1: '同一份答案' };
      const snapshot = [{ id: 'f1', label: '介绍', type: 'text', required: true }];
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
        registrationFields: snapshot,
      });
      const existing = {
        id: 'r-reviewed',
        status: 'registered',
        answers,
        formSnapshot: snapshot,
        reviewStatus: ReviewStatus.approved,
      };
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(existing);

      const result = await service.register('u1', 'h1', answers);

      expect(result).toEqual(existing);
      expect(mockPrisma.hackathonRegistration.update).not.toHaveBeenCalled();
      expect(mockPrisma.hackathonRegistration.create).not.toHaveBeenCalled();
    });

    it('键序不同的相同答案应视为未变, 不重置审核', async () => {
      service = await buildService();
      const snapshot = [
        { id: 'f1', label: 'A', type: 'text', required: true },
        { id: 'f2', label: 'B', type: 'text', required: true },
      ];
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
        registrationFields: snapshot,
      });
      const existing = {
        id: 'r-ordered',
        status: 'registered',
        answers: { f1: '1', f2: '2' },
        formSnapshot: snapshot,
        reviewStatus: ReviewStatus.approved,
      };
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(existing);

      const result = await service.register('u1', 'h1', { f2: '2', f1: '1' });

      expect(result).toEqual(existing);
      expect(mockPrisma.hackathonRegistration.update).not.toHaveBeenCalled();
    });

    it('已盖章 uploadedBy 的历史答案与客户端未盖章答案视为等价, 且不触碰存储校验', async () => {
      service = await buildService();
      const snapshot = [{ id: 'f_cv', label: '简历', type: 'file', required: true }];
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
        registrationFields: snapshot,
      });
      const file = { key: 'hackathons/applications/files/h1/u1/x.pdf', name: 'x.pdf', size: 1, mimeType: 'application/pdf' };
      const existing = {
        id: 'r-stamped',
        status: 'registered',
        answers: { f_cv: { ...file, uploadedBy: 'u1' } },
        formSnapshot: snapshot,
        reviewStatus: ReviewStatus.approved,
      };
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(existing);
      mockUploads.verifyPrivateAttachment.mockImplementation(() => {
        throw new Error('storage unavailable');
      });

      const result = await service.register('u1', 'h1', { f_cv: file });

      expect(result).toEqual(existing);
      expect(mockPrisma.hackathonRegistration.update).not.toHaveBeenCalled();
    });

    it('并发首次报名撞 P2002 时返回已存在记录', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        registerDeadline: null,
      });
      mockPrisma.hackathonRegistration.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r-raced', status: 'registered' });
      mockPrisma.hackathonRegistration.create.mockRejectedValue(
        Object.assign(Object.create(Prisma.PrismaClientKnownRequestError.prototype), { code: 'P2002' }),
      );

      const result = await service.register('u1', 'h1');

      expect(result).toMatchObject({ id: 'r-raced' });
    });

    it('已取消的 hackathon 应抛 ForbiddenException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.cancelled,
        registerDeadline: null,
      });

      await expect(service.register('u1', 'h1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.hackathonRegistration.create).not.toHaveBeenCalled();
    });

    it('registerDeadline 已过应抛 ForbiddenException (报名已截止)', async () => {
      service = await buildService();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.active,
        registerDeadline: pastDate,
      });

      await expect(service.register('u1', 'h1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.hackathonRegistration.create).not.toHaveBeenCalled();
    });

    it('registerDeadline 未到应放行 (active 状态可报)', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.active,
        registerDeadline: futureDate,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(null);
      mockPrisma.hackathonRegistration.create.mockResolvedValue({ id: 'r1' });

      await expect(service.register('u1', 'h1')).resolves.toMatchObject({ id: 'r1' });
    });

    it('hackathon 不存在应抛 NotFoundException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue(null);

      await expect(service.register('u1', 'h-bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================
  // cancelRegistration
  // ============================================================
  describe('cancelRegistration', () => {
    it('已报名应成功取消 (status: registered → cancelled)', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'registered',
      });
      mockPrisma.hackathonRegistration.update.mockResolvedValue({
        id: 'r1',
        status: 'cancelled',
      });

      const result = await service.cancelRegistration('u1', 'h1');

      expect(result).toMatchObject({ status: 'cancelled' });
      expect(mockPrisma.hackathonRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'cancelled' },
        }),
      );
    });

    it('未报名应抛 BadRequestException (尚未报名)', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(null);

      await expect(service.cancelRegistration('u1', 'h1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('已 cancelled 状态再取消应抛 BadRequestException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'cancelled',
      });

      await expect(service.cancelRegistration('u1', 'h1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============================================================
  // reviewRegistration
  // ============================================================
  describe('reviewRegistration', () => {
    it('更新审核状态/备注并写审计 + 通知', async () => {
      service = await buildService();
      mockPrisma.hackathonRegistration.findFirst.mockResolvedValue({
        id: 'r1',
        hackathonId: 'h1',
        userId: 'u1',
      });
      mockPrisma.hackathonRegistration.update.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        reviewStatus: ReviewStatus.rejected,
      });
      mockPrisma.hackathon.findUnique.mockResolvedValue({ title: 'T' });

      const result = await service.reviewRegistration('h1', 'r1', {
        reviewStatus: ReviewStatus.rejected,
        reviewNote: '名额已满',
      } as any, 'admin-1');

      expect(result).toMatchObject({ reviewStatus: ReviewStatus.rejected });
      expect(mockPrisma.hackathonRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewStatus: ReviewStatus.rejected,
            reviewNote: '名额已满',
            reviewedById: 'admin-1',
          }),
        }),
      );
expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', type: 'hackathon' }),
      );
    });

    it('不带备注审核时应清空旧备注, 避免旧备注挂在新结论上', async () => {
      service = await buildService();
      mockPrisma.hackathonRegistration.findFirst.mockResolvedValue({
        id: 'r1',
        hackathonId: 'h1',
        userId: 'u1',
      });
      mockPrisma.hackathonRegistration.update.mockResolvedValue({ id: 'r1' });
      mockPrisma.hackathon.findUnique.mockResolvedValue({ title: 'T' });

      await service.reviewRegistration('h1', 'r1', {
        reviewStatus: ReviewStatus.approved,
      } as any, 'admin-1');

      const updateArg = mockPrisma.hackathonRegistration.update.mock.calls[0][0];
      expect(updateArg.data.reviewNote).toBeNull();
    });

    it('跨活动 registrationId 应抛 NotFoundException', async () => {
      service = await buildService();
      mockPrisma.hackathonRegistration.findFirst.mockResolvedValue(null);

      await expect(
        service.reviewRegistration('h1', 'r-other', {
          reviewStatus: ReviewStatus.approved,
        } as any, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // createTeam
  // ============================================================
  describe('createTeam', () => {
    it('应创建队伍 + captain teamMember (走 $transaction)', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'registered',
        reviewStatus: ReviewStatus.approved,
      });
      mockPrisma.team.findFirst.mockResolvedValue(null); // 无重名
      mockPrisma.teamMember.findFirst.mockResolvedValue(null); // 未加入其他队
      const team = { id: 't1', hackathonId: 'h1', name: 'Alpha', captainId: 'u1' };
      mockPrisma.team.create.mockResolvedValue(team);
      mockPrisma.teamMember.create.mockResolvedValue({
        teamId: 't1',
        userId: 'u1',
        role: 'captain',
      });
      mockPrisma.team.findUnique.mockResolvedValue({
        ...team,
        members: [{ teamId: 't1', userId: 'u1', role: 'captain' }],
      });

      const result = await service.createTeam('u1', 'h1', {
        name: 'Alpha',
        slogan: 'go',
      });

      expect(result).toMatchObject({ id: 't1', name: 'Alpha' });
      // $transaction 必须被调用
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // tx.team.create + tx.teamMember.create 都在 callback 里跑
      expect(mockPrisma.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hackathonId: 'h1',
            name: 'Alpha',
            captainId: 'u1',
          }),
        }),
      );
      expect(mockPrisma.teamMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            teamId: 't1',
            userId: 'u1',
            role: 'captain',
          }),
        }),
      );
    });

    it('未报名该 hackathon 应抛 ForbiddenException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue(null);

      await expect(
        service.createTeam('u1', 'h1', { name: 'Alpha' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('同 hackathon 已有同名队伍应抛 BadRequestException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        status: 'registered',
        reviewStatus: ReviewStatus.approved,
      });
      mockPrisma.team.findFirst.mockResolvedValue({ id: 't-other' });

      await expect(
        service.createTeam('u1', 'h1', { name: 'Alpha' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // joinTeam — 团队满员
  // ============================================================
  describe('joinTeam', () => {
    it('应成功加入队伍 (未满员)', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        maxTeamSize: 5,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        status: 'registered',
        reviewStatus: ReviewStatus.approved,
      });
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 't1',
        hackathonId: 'h1',
        hackathon: { maxTeamSize: 5 },
        members: [
          { id: 'm1', userId: 'captain' },
          { id: 'm2', userId: 'other' },
        ],
      });
      mockPrisma.teamMember.findFirst.mockResolvedValue(null);
      mockPrisma.teamMember.create.mockResolvedValue({
        teamId: 't1',
        userId: 'u1',
        role: 'member',
      });

      const result = await service.joinTeam('u1', 'h1', 't1');

      expect(result).toMatchObject({ teamId: 't1', userId: 'u1', role: 'member' });
    });

    it('队伍满员 (members.length >= maxTeamSize) 应抛 ForbiddenException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
        maxTeamSize: 2,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        status: 'registered',
        reviewStatus: ReviewStatus.approved,
      });
      // 队里 2 人 + hackathon maxTeamSize=2 → 满
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 't1',
        hackathonId: 'h1',
        hackathon: { maxTeamSize: 2 },
        members: [{ id: 'm1' }, { id: 'm2' }],
      });
      mockPrisma.teamMember.findFirst.mockResolvedValue(null);

      await expect(service.joinTeam('u1', 'h1', 't1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.teamMember.create).not.toHaveBeenCalled();
    });

    it('已加入其他队伍应抛 BadRequestException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        status: 'registered',
        reviewStatus: ReviewStatus.approved,
      });
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 't1',
        hackathonId: 'h1',
        hackathon: { maxTeamSize: 5 },
        members: [],
      });
      mockPrisma.teamMember.findFirst.mockResolvedValue({ id: 'm-existing' });

      await expect(service.joinTeam('u1', 'h1', 't1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('team 不属于该 hackathon 应抛 NotFoundException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.upcoming,
      });
      mockPrisma.hackathonRegistration.findUnique.mockResolvedValue({
        status: 'registered',
        reviewStatus: ReviewStatus.approved,
      });
      mockPrisma.team.findUnique.mockResolvedValue({
        id: 't1',
        hackathonId: 'h-OTHER', // 跨 hackathon
        hackathon: { maxTeamSize: 5 },
        members: [],
      });

      await expect(service.joinTeam('u1', 'h1', 't1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================================
  // judgeSubmission
  // ============================================================
  describe('judgeSubmission', () => {
    it('应更新 score / feedback / status', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.judging,
      });
      mockPrisma.submission.findFirst.mockResolvedValue({
        id: 's1',
        hackathonId: 'h1',
        status: SubmissionStatus.submitted,
      });
      mockPrisma.submission.update.mockResolvedValue({
        id: 's1',
        score: 88,
        feedback: 'good',
        status: SubmissionStatus.under_review,
      });

      const result = await service.judgeSubmission('h1', 's1', {
        score: 88,
        feedback: 'good',
      });

      expect(result).toMatchObject({ score: 88, status: SubmissionStatus.under_review });
      expect(mockPrisma.submission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: expect.objectContaining({
            score: 88,
            feedback: 'good',
            status: SubmissionStatus.under_review,
          }),
        }),
      );
    });

    it('submission 不存在应抛 NotFoundException', async () => {
      service = await buildService();
      mockPrisma.hackathon.findUnique.mockResolvedValue({
        id: 'h1',
        status: HackathonStatus.judging,
      });
      mockPrisma.submission.findFirst.mockResolvedValue(null);

      await expect(
        service.judgeSubmission('h1', 's-bad', { score: 50 }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.submission.update).not.toHaveBeenCalled();
    });
  });
});
