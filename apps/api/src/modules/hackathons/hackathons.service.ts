import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, RegistrationMode, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { UploadsService } from '../uploads/uploads.service';
import { UPLOAD_SCOPES } from '../uploads/uploads.config';
import {
  CreateHackathonDto,
  UpdateHackathonDto,
  CreateTeamDto,
  CreateSubmissionDto,
  UpdateSubmissionDto,
  CreateAnnouncementDto,
  JudgeSubmissionDto,
  HackathonFormFieldDto,
  UploadedFileMetaDto,
  ListRegistrationsDto,
  ReviewRegistrationDto,
} from './hackathons.dto';
import { HackathonStatus, SubmissionStatus } from '@prisma/client';

@Injectable()
export class HackathonsService {
  private readonly logger = new Logger(HackathonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly uploads: UploadsService,
  ) {}

  private baseSelect = {
    id: true,
    title: true,
    description: true,
    bannerUrl: true,
    status: true,
    startDate: true,
    endDate: true,
    registerDeadline: true,
    submissionDeadline: true,
    minTeamSize: true,
    maxTeamSize: true,
    location: true,
    rules: true,
    submissionRequirements: true,
    prizes: true,
    registrationUrl: true,
    registrationLabel: true,
    registrationMode: true,
    registrationFields: true,
    organizerId: true,
    createdAt: true,
    updatedAt: true,
  };

  private organizerSelect = {
    id: true,
    name: true,
    avatarUrl: true,
  };

  private userSelect = {
    id: true,
    name: true,
    avatarUrl: true,
  };

  private validateSchedule(input: {
    startDate: string | Date;
    endDate: string | Date;
    registerDeadline?: string | Date | null;
    submissionDeadline?: string | Date | null;
    minTeamSize: number;
    maxTeamSize: number;
  }) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (start >= end) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }
    if (input.minTeamSize > input.maxTeamSize) {
      throw new BadRequestException('最小团队人数不能大于最大团队人数');
    }
    if (input.registerDeadline) {
      const deadline = new Date(input.registerDeadline);
      if (deadline > start) {
        throw new BadRequestException('报名截止时间不能晚于活动开始时间');
      }
    }
    if (input.submissionDeadline) {
      const deadline = new Date(input.submissionDeadline);
      if (deadline < start || deadline > end) {
        throw new BadRequestException('作品提交截止时间必须位于活动开始与结束时间之间');
      }
    }
  }

  /**
   * Keep public status consistent with the event dates even when an organizer
   * has not manually advanced an event. Judging/finished/cancelled remain
   * editorial states and are never inferred backwards from dates.
   */
  private effectiveStatus(hackathon: {
    status: HackathonStatus;
    startDate: Date;
    endDate: Date;
  }, now = new Date()): HackathonStatus {
    if (
      hackathon.status === HackathonStatus.cancelled ||
      hackathon.status === HackathonStatus.finished ||
      hackathon.status === HackathonStatus.judging
    ) {
      return hackathon.status;
    }

    if (now < hackathon.startDate) return HackathonStatus.upcoming;
    if (now <= hackathon.endDate) return HackathonStatus.active;
    return HackathonStatus.judging;
  }

  async findAll(params: {
    status?: HackathonStatus;
    search?: string;
    userId?: string;
  }) {
    const where: any = {};
    if (params.search) {
      where.OR = [
        { title: { contains: params.search } },
        { description: { contains: params.search } },
        { location: { contains: params.search } },
      ];
    }

    const hackathons = await this.prisma.hackathon.findMany({
      where,
      select: {
        ...this.baseSelect,
        organizer: { select: this.organizerSelect },
        _count: {
          select: {
            registrations: { where: { status: 'registered' } },
            teams: true,
          },
        },
        registrations: params.userId
          ? {
              where: { userId: params.userId },
              take: 1,
            }
          : undefined,
      },
      orderBy: { startDate: 'desc' },
      // P1-7 防御: 默认 50, max 100, 防 DoS (admin 后台 list 拉全表 OOM)
      take: 100,
    });

    const now = new Date();
    return hackathons
      .map((h) => ({
        ...h,
        status: this.effectiveStatus(h, now),
        myRegistration: h.registrations?.[0] ?? null,
        registrations: undefined,
      }))
      .filter((h) => !params.status || h.status === params.status);
  }

  async findOne(id: string, userId?: string) {
    const hackathon = await this.prisma.hackathon.findUnique({
      where: { id },
      select: {
        ...this.baseSelect,
        organizer: { select: this.organizerSelect },
        judges: true,
        _count: {
          select: {
            registrations: { where: { status: 'registered' } },
            teams: true,
            submissions: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!hackathon) throw new NotFoundException('Hackathon not found');

    let myRegistration = null;
    if (userId) {
      myRegistration = await this.prisma.hackathonRegistration.findUnique({
        where: { hackathonId_userId: { hackathonId: id, userId } },
      });
    }

    return {
      ...hackathon,
      status: this.effectiveStatus(hackathon),
      myRegistration,
    };
  }

  async create(dto: CreateHackathonDto, organizerId: string) {
    this.validateFormFields(dto.registrationFields);
    this.validateSchedule({
      ...dto,
      minTeamSize: dto.minTeamSize ?? 1,
      maxTeamSize: dto.maxTeamSize ?? 5,
    });
    const hackathon = await this.prisma.hackathon.create({
      data: {
        ...dto,
        registrationFields: dto.registrationFields as unknown as Prisma.InputJsonValue,
        organizerId,
        minTeamSize: dto.minTeamSize ?? 1,
        maxTeamSize: dto.maxTeamSize ?? 5,
        status: dto.status ?? HackathonStatus.upcoming,
      },
      select: {
        ...this.baseSelect,
        organizer: { select: this.organizerSelect },
      },
    });


    return hackathon;
  }

  async update(id: string, dto: UpdateHackathonDto) {
    this.validateFormFields(dto.registrationFields);
    const current = await this.ensureExists(id);
    this.validateSchedule({
      startDate: dto.startDate ?? current.startDate,
      endDate: dto.endDate ?? current.endDate,
      registerDeadline: dto.registerDeadline ?? current.registerDeadline,
      submissionDeadline: dto.submissionDeadline ?? current.submissionDeadline,
      minTeamSize: dto.minTeamSize ?? current.minTeamSize,
      maxTeamSize: dto.maxTeamSize ?? current.maxTeamSize,
    });
    const hackathon = await this.prisma.hackathon.update({
      where: { id },
      data: {
        ...dto,
        registrationFields: dto.registrationFields as unknown as Prisma.InputJsonValue,
      },
      select: {
        ...this.baseSelect,
        organizer: { select: this.organizerSelect },
      },
    });


    return hackathon;
  }

  async delete(id: string) {
    await this.ensureExists(id);
    const [registrations, teams, submissions] = await Promise.all([
      this.prisma.hackathonRegistration.count({ where: { hackathonId: id } }),
      this.prisma.team.count({ where: { hackathonId: id } }),
      this.prisma.submission.count({ where: { hackathonId: id } }),
    ]);
    if (registrations + teams + submissions > 0) {
      throw new BadRequestException('已有报名、队伍或作品的黑客松不能删除');
    }
    await this.prisma.hackathon.delete({ where: { id } });


    return { message: 'Hackathon deleted' };
  }

  async register(userId: string, hackathonId: string, answers: Record<string, unknown> = {}) {
    const hackathon = await this.ensureExists(hackathonId);

    if (hackathon.registrationMode === RegistrationMode.external) {
      throw new ForbiddenException('该黑客松使用外部报名');
    }
    if (hackathon.status === HackathonStatus.cancelled) {
      throw new ForbiddenException('该黑客松已取消');
    }

    if (
      hackathon.registerDeadline &&
      new Date(hackathon.registerDeadline) < new Date()
    ) {
      throw new ForbiddenException('报名已截止');
    }

    const fields = (hackathon.registrationFields ?? []) as unknown as HackathonFormFieldDto[];
    this.validateAnswers(fields, answers, { hackathonId, userId });
    const snapshot = fields as unknown as Prisma.InputJsonValue;
    const existing = await this.prisma.hackathonRegistration.findUnique({
      where: { hackathonId_userId: { hackathonId, userId } },
    });

    // 内容比较对键序和 uploadedBy 盖章不敏感; 未变重试直接返回, 不触碰对象存储。
    const changed =
      !existing ||
      this.stableStringify(existing.answers ?? {}) !== this.stableStringify(answers) ||
      this.stableStringify(existing.formSnapshot ?? []) !== this.stableStringify(fields);

    // 幂等: 内容未变直接返回, 避免并发双击/重试覆盖管理员的审核结果,
    // 也不因对象存储故障阻断纯幂等重试。
    if (existing && existing.status !== 'cancelled' && !changed) {
      return existing;
    }

    await this.verifyAnswerFiles(fields, answers, hackathonId, userId);

    // 内容变化才重置审核状态; 仅取消后重报(内容未变)保留原审核结论。
    const data = {
      status: 'registered' as const,
      answers: answers as Prisma.InputJsonValue,
      formSnapshot: snapshot,
      ...(changed
        ? { reviewStatus: ReviewStatus.pending, reviewNote: null, reviewedAt: null, reviewedById: null }
        : {}),
      deletedAt: null,
    };
    if (existing) {
      return this.prisma.hackathonRegistration.update({
        where: { hackathonId_userId: { hackathonId, userId } },
        data,
      });
    }

    try {
      return await this.prisma.hackathonRegistration.create({
        data: { hackathonId, userId, ...data },
      });
    } catch (error) {
      // 并发首次报名撞唯一键: 返回已存在记录而不是 500。
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.hackathonRegistration.findUnique({
          where: { hackathonId_userId: { hackathonId, userId } },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  async cancelRegistration(userId: string, hackathonId: string) {
    await this.ensureExists(hackathonId);

    const existing = await this.prisma.hackathonRegistration.findUnique({
      where: { hackathonId_userId: { hackathonId, userId } },
    });

    if (!existing || existing.status === 'cancelled') {
      throw new BadRequestException('尚未报名该黑客松');
    }

    return this.prisma.hackathonRegistration.update({
      where: { hackathonId_userId: { hackathonId, userId } },
      data: { status: 'cancelled' },
    });
  }

  async getMyRegistration(userId: string, hackathonId: string) {
    await this.ensureExists(hackathonId);
    return this.prisma.hackathonRegistration.findUnique({
      where: { hackathonId_userId: { hackathonId, userId } },
    });
  }

  async listRegistrations(hackathonId: string, query: ListRegistrationsDto) {
    await this.ensureExists(hackathonId);
    const page = query.page ?? 1;
    const limit = Math.min(100, query.limit ?? 20);
    const where: Prisma.HackathonRegistrationWhereInput = {
      hackathonId,
      reviewStatus: query.status,
      ...(query.search
        ? {
            OR: [
              { user: { name: { contains: query.search } } },
              { user: { email: { contains: query.search } } },
              // 报名昵称等自定义答案存在 answers JSON 里, 一并搜索(Round5 B12: 搜「QA验收学员」miss)
              { answers: { string_contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.hackathonRegistration.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { registeredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.hackathonRegistration.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async reviewRegistration(
    hackathonId: string,
    registrationId: string,
    dto: ReviewRegistrationDto,
    reviewerId: string,
  ) {
    const existing = await this.prisma.hackathonRegistration.findFirst({
      where: { id: registrationId, hackathonId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!existing) throw new NotFoundException('Registration not found');

    // 状态机保护: 已通过/已拒绝是终态, 不允许静默覆盖(防止误点「拒绝」拉掉已通过学员); 需显式 force
    if (!dto.force && existing.reviewStatus !== dto.reviewStatus) {
      if (existing.reviewStatus === 'approved' || existing.reviewStatus === 'rejected') {
        throw new ConflictException(
          `该报名当前为「${existing.reviewStatus === 'approved' ? '已通过' : '已拒绝'}」, 如需变更请使用强制改态并二次确认`,
        );
      }
    }

    const registration = await this.prisma.hackathonRegistration.update({
      where: { id: registrationId },
      data: {
        reviewStatus: dto.reviewStatus,
        // 显式清空: undefined 会被 Prisma 跳过, 旧备注会挂在新结论上展示给学员。
        reviewNote: dto.reviewNote ?? null,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    try {
      const hackathon = await this.prisma.hackathon.findUnique({
        where: { id: hackathonId },
        select: { title: true },
      });
      await this.notifications.create({
        userId: registration.userId,
        type: 'hackathon',
        title: `黑客松报名审核：${dto.reviewStatus}`,
        body: `${hackathon?.title ?? '黑客松'}${dto.reviewNote ? `：${dto.reviewNote}` : ''}`,
        linkUrl: `/hackathons/${hackathonId}`,
      });
    } catch (error) {
      this.logger.error(
        `报名审核通知发送失败: ${registrationId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    return registration;
  }

  async getAnnouncements(hackathonId: string) {
    await this.ensureExists(hackathonId);
    return this.prisma.announcement.findMany({
      where: { hackathonId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAnnouncement(
    hackathonId: string,
    dto: CreateAnnouncementDto,
    userId: string,
  ) {
    await this.ensureExists(hackathonId);
    const announcement = await this.prisma.announcement.create({
      data: {
        hackathonId,
        title: dto.title,
        content: dto.content,
        isPinned: dto.isPinned ?? false,
      },
    });


    return announcement;
  }

  async getTeams(hackathonId: string) {
    await this.ensureExists(hackathonId);
    return this.prisma.team.findMany({
      where: { hackathonId },
      include: {
        members: {
          include: { user: { select: this.userSelect } },
        },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTeam(
    userId: string,
    hackathonId: string,
    dto: CreateTeamDto,
  ) {
    await this.ensureExists(hackathonId);
    await this.ensureApproved(userId, hackathonId);

    // 名查 + 成员检查放进同一事务, 避免并发创建同名队伍 / 同一用户同时当两组队长。
    // Serializable: findFirst→create 之间存在幻读窗口, 隔离级别兜底防超员/重名。
    return this.prisma.$transaction(
      async (tx) => {
      const existingTeam = await tx.team.findFirst({
        where: { hackathonId, name: dto.name },
      });
      if (existingTeam) {
        throw new BadRequestException('该黑客松下已存在同名队伍');
      }

      const existingMembership = await tx.teamMember.findFirst({
        where: { userId, team: { hackathonId } },
      });
      if (existingMembership) {
        throw new BadRequestException('你已经加入了一个队伍');
      }

      const team = await tx.team.create({
        data: {
          hackathonId,
          name: dto.name,
          slogan: dto.slogan,
          captainId: userId,
        },
      });
      await tx.teamMember.create({
        data: { teamId: team.id, userId, role: 'captain' },
      });
      return tx.team.findUnique({
        where: { id: team.id },
        include: {
          members: { include: { user: { select: this.userSelect } } },
        },
      });
    },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async joinTeam(userId: string, hackathonId: string, teamId: string) {
    const hackathon = await this.ensureExists(hackathonId);
    await this.ensureApproved(userId, hackathonId);

    // Serializable: 事务内成员资格/容量重查与写入之间存在竞态窗口,
    // 靠隔离级别兜底防并发超员。
    return this.prisma.$transaction(
      async (tx) => {
      const team = await tx.team.findUnique({
        where: { id: teamId },
        include: { members: true, hackathon: { select: { maxTeamSize: true } } },
      });
      if (!team || team.hackathonId !== hackathonId) {
        throw new NotFoundException('Team not found');
      }

      // 事务内重查成员资格与容量, 防止同一用户并发加入两支队伍 / 超员
      const existingMembership = await tx.teamMember.findFirst({
        where: { userId, team: { hackathonId } },
      });
      if (existingMembership) {
        throw new BadRequestException('你已经加入了一个队伍');
      }
      if (team.members.length >= (team.hackathon?.maxTeamSize ?? hackathon.maxTeamSize)) {
        throw new ForbiddenException('队伍已满');
      }

      return tx.teamMember.create({
        data: { teamId, userId, role: 'member' },
        include: { user: { select: this.userSelect }, team: true },
      });
    },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async leaveTeam(userId: string, hackathonId: string, teamId: string) {
    await this.ensureExists(hackathonId);

    const membership = await this.prisma.teamMember.findFirst({
      where: { userId, teamId, team: { hackathonId } },
      include: { team: true },
    });

    if (!membership) {
      throw new BadRequestException('你不是该队伍成员');
    }

    if (membership.role === 'captain') {
      // 队长退出则解散队伍
      await this.prisma.team.delete({ where: { id: teamId } });
      return { message: 'Team disbanded' };
    }

    await this.prisma.teamMember.delete({ where: { id: membership.id } });
    return { message: 'Left team' };
  }

  async getMySubmissions(userId: string, hackathonId: string) {
    await this.ensureExists(hackathonId);
    return this.prisma.submission.findMany({
      where: {
        hackathonId,
        deletedAt: null,
        OR: [{ userId }, { team: { members: { some: { userId } } } }],
      },
      include: {
        team: { select: { id: true, name: true } },
        user: { select: this.userSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSubmission(
    userId: string,
    hackathonId: string,
    dto: CreateSubmissionDto,
  ) {
    await this.ensureSubmissionOpen(hackathonId);
    await this.ensureApproved(userId, hackathonId);

    let teamId: string | undefined = dto.teamId;
    if (teamId) {
      const membership = await this.prisma.teamMember.findFirst({
        where: { userId, teamId, team: { hackathonId } },
      });
      if (!membership) {
        throw new ForbiddenException('你不是该队伍成员');
      }
    }

    const isSubmitted = dto.status === SubmissionStatus.submitted;
    if (isSubmitted) this.validateSubmissionPayload(dto);
    const verifiedAttachments = await this.verifyAttachments(dto.attachments, hackathonId, userId);

    return this.prisma.submission.create({
      data: {
        hackathonId,
        userId: teamId ? undefined : userId,
        teamId,
        title: dto.title,
        description: dto.description,
        demoUrl: dto.demoUrl,
        repoUrl: dto.repoUrl,
        videoUrl: dto.videoUrl,
        attachments: (verifiedAttachments ?? []) as unknown as Prisma.InputJsonValue,
        status: dto.status ?? SubmissionStatus.draft,
        submittedAt: isSubmitted ? new Date() : undefined,
      },
      include: {
        team: { select: { id: true, name: true } },
        user: { select: this.userSelect },
      },
    });
  }

  async updateSubmission(
    userId: string,
    hackathonId: string,
    submissionId: string,
    dto: UpdateSubmissionDto,
  ) {
    await this.ensureSubmissionOpen(hackathonId);

    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        hackathonId,
        deletedAt: null,
        OR: [{ userId }, { team: { members: { some: { userId } } } }],
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const isNowSubmitted = (dto.status ?? submission.status) === SubmissionStatus.submitted;
    const wasSubmitted = submission.status === SubmissionStatus.submitted;
    const merged = {
      title: dto.title ?? submission.title,
      description: dto.description ?? submission.description,
      demoUrl: dto.demoUrl ?? submission.demoUrl,
      repoUrl: dto.repoUrl ?? submission.repoUrl,
      videoUrl: dto.videoUrl ?? submission.videoUrl,
      attachments: dto.attachments ?? (submission.attachments as unknown as UploadedFileMetaDto[] | null) ?? [],
      status: dto.status ?? submission.status,
    };
    if (isNowSubmitted) this.validateSubmissionPayload(merged);
    if (dto.attachments) {
      const verified = await this.verifyAttachments(dto.attachments, hackathonId, userId);
      merged.attachments = verified ?? [];
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        ...merged,
        attachments: merged.attachments as unknown as Prisma.InputJsonValue,
        submittedAt: isNowSubmitted && !wasSubmitted ? new Date() : submission.submittedAt,
      },
      include: {
        team: { select: { id: true, name: true } },
        user: { select: this.userSelect },
      },
    });
  }

  async getAllSubmissions(hackathonId: string) {
    await this.ensureExists(hackathonId);
    return this.prisma.submission.findMany({
      where: { hackathonId, deletedAt: null },
      include: {
        team: { select: { id: true, name: true } },
        user: { select: this.userSelect },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async judgeSubmission(
    hackathonId: string,
    submissionId: string,
    dto: JudgeSubmissionDto,
    judgeUserId?: string,
  ) {
    await this.ensureExists(hackathonId);
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, hackathonId, deletedAt: null },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const judged = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        score: dto.score,
        feedback: dto.feedback,
        status: dto.status ?? SubmissionStatus.under_review,
      },
      include: {
        team: { select: { id: true, name: true } },
        user: { select: this.userSelect },
      },
    });
    return judged;
  }

  async getRegistrationAttachmentUrl(
    user: { userId: string; role: string },
    hackathonId: string,
    registrationId: string,
    fieldId: string,
  ) {
    const registration = await this.prisma.hackathonRegistration.findFirst({
      where: { id: registrationId, hackathonId },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    if (user.role !== 'admin' && registration.userId !== user.userId) {
      throw new ForbiddenException('无权下载该附件');
    }
    const downloadUrl = await this.uploads.getRegistrationAttachmentUrl(user, registration, fieldId);
    return { downloadUrl };
  }

  async getSubmissionAttachmentUrl(
    user: { userId: string; role: string },
    hackathonId: string,
    submissionId: string,
    index: number,
  ) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        hackathonId,
        deletedAt: null,
        ...(user.role === 'admin'
          ? {}
          : { OR: [{ userId: user.userId }, { team: { members: { some: { userId: user.userId } } } }] }),
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    const downloadUrl = await this.uploads.getSubmissionAttachmentUrl(user, submission, index);
    return { downloadUrl };
  }

  private validateFormFields(fields?: HackathonFormFieldDto[]) {
    if (!fields) return;
    if (new Set(fields.map((field) => field.id)).size !== fields.length) {
      throw new BadRequestException('报名表字段 id 不能重复');
    }
    for (const field of fields) {
      if (!field.id.trim() || !field.label.trim()) {
        throw new BadRequestException('报名表字段 id 和 label 不能为空');
      }
      if ((field.type === 'select' || field.type === 'multiselect') && !field.options?.length) {
        throw new BadRequestException(`${field.label} 必须配置选项`);
      }
    }
  }

  /** 键序无关 + 忽略 uploadedBy 盖章的结构化比较, 用于报名幂等判断。 */
  private stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const { uploadedBy: _ignored, ...rest } = v as Record<string, unknown>;
        return Object.fromEntries(
          Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)),
        );
      }
      return v;
    }) ?? 'null';
  }

  private validateAnswers(
    fields: HackathonFormFieldDto[],
    answers: Record<string, unknown>,
    owner: { hackathonId: string; userId: string },
  ) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      throw new BadRequestException('answers 必须是对象');
    }
    const fieldIds = new Set(fields.map((field) => field.id));
    if (Object.keys(answers).some((key) => !fieldIds.has(key))) {
      throw new BadRequestException('answers 包含未定义字段');
    }

    for (const field of fields) {
      const value = answers[field.id];
      const missing = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (missing) {
        if (field.required) throw new BadRequestException(`${field.label} 为必填项`);
        continue;
      }

      switch (field.type) {
        case 'text':
        case 'textarea': {
          if (typeof value !== 'string') throw new BadRequestException(`${field.label} 必须是文本`);
          this.validateLength(value, field.maxLength ?? 10000, field.label);
          break;
        }
        case 'select':
          if (typeof value !== 'string' || !field.options?.includes(value)) {
            throw new BadRequestException(`${field.label} 选项无效`);
          }
          break;
        case 'multiselect':
          if (
            !Array.isArray(value) ||
            value.length > (field.options?.length ?? 0) ||
            new Set(value).size !== value.length ||
            value.some((item) => typeof item !== 'string' || !field.options?.includes(item))
          ) {
            throw new BadRequestException(`${field.label} 选项无效`);
          }
          break;
        case 'number':
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new BadRequestException(`${field.label} 必须是有效数字`);
          }
          break;
        case 'url':
          if (typeof value !== 'string') throw new BadRequestException(`${field.label} 必须是 URL`);
          this.validateLength(value, field.maxLength ?? 2048, field.label);
          this.validateHttpUrl(value, field.label);
          break;
        case 'file':
          this.validateFileMeta(value, field.label, {
            ...owner,
            scope: 'hackathon-application-file',
          });
          break;
      }
    }
  }

  private validateLength(value: string, maxLength: number, label: string) {
    if (value.length > maxLength) {
      throw new BadRequestException(`${label} 不能超过 ${maxLength} 个字符`);
    }
  }

  private validateHttpUrl(value: string, label: string) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    } catch {
      throw new BadRequestException(`${label} 必须是安全的 http/https URL`);
    }
  }

  private validateFileMeta(
    value: unknown,
    label: string,
    owner?: { hackathonId: string; userId: string; scope: 'hackathon-application-file' | 'submission-attachment' },
  ): asserts value is UploadedFileMetaDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${label} 文件元数据无效`);
    }
    const file = value as Record<string, unknown>;
    if (
      typeof file.key !== 'string' || !file.key.trim() || file.key.length > 1024 ||
      typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 ||
      typeof file.mimeType !== 'string' || !file.mimeType.trim() || file.mimeType.length > 255 ||
      typeof file.size !== 'number' || !Number.isSafeInteger(file.size) ||
      file.size <= 0 || file.size > 100 * 1024 * 1024
    ) {
      throw new BadRequestException(`${label} 文件元数据无效`);
    }
    if (
      file.key.startsWith('/') || file.key.includes('\\') || /[?#\u0000-\u001f]/.test(file.key) ||
      file.key.split('/').includes('..')
    ) {
      throw new BadRequestException(`${label} 文件 key 无效`);
    }
    if (owner) {
      const scope = UPLOAD_SCOPES[owner.scope];
      if (
        !file.key.startsWith(`${scope.keyPrefix}/${owner.hackathonId}/${owner.userId}/`) ||
        file.size > scope.maxSizeMB * 1024 * 1024 ||
        !scope.allowedMime.includes(file.mimeType as any)
      ) {
        throw new BadRequestException(`${label} 文件归属或类型无效`);
      }
    }
  }

  /** 校验附件元数据 shape + 归属, 再与对象存储中的真实对象核对并盖 uploadedBy 章。 */
  private async verifyAttachments(
    attachments: UploadedFileMetaDto[] | undefined,
    hackathonId: string,
    userId: string,
  ) {
    if (!attachments) return undefined;
    if (attachments.length > 10) throw new BadRequestException('附件不能超过 10 个');
    for (const [index, file] of attachments.entries()) {
      this.validateFileMeta(file, `附件 ${index + 1}`, {
        hackathonId,
        userId,
        scope: 'submission-attachment',
      });
    }
    if (new Set(attachments.map((file) => file.key)).size !== attachments.length) {
      throw new BadRequestException('附件 key 不能重复');
    }
    return Promise.all(
      attachments.map((file) =>
        this.uploads.verifyPrivateAttachment('submission-attachment', hackathonId, userId, file),
      ),
    );
  }

  /** 报名表 file 题答案: shape 校验 + 对象存储核对 + 盖 uploadedBy 章 (写回 answers)。 */
  private async verifyAnswerFiles(
    fields: HackathonFormFieldDto[],
    answers: Record<string, unknown>,
    hackathonId: string,
    userId: string,
  ) {
    for (const field of fields) {
      if (field.type !== 'file') continue;
      const value = answers[field.id];
      if (value === undefined || value === null || value === '') continue;
      answers[field.id] = await this.uploads.verifyPrivateAttachment(
        'hackathon-application-file',
        hackathonId,
        userId,
        value as UploadedFileMetaDto,
      );
    }
  }

  private validateSubmissionPayload(payload: {
    title: string;
    description: string;
    demoUrl?: string | null;
    repoUrl?: string | null;
    videoUrl?: string | null;
    attachments?: UploadedFileMetaDto[];
  }) {
    if (!payload.title?.trim() || !payload.description?.trim()) {
      throw new BadRequestException('提交作品前必须填写标题和描述');
    }
    this.validateLength(payload.title, 200, '作品标题');
    this.validateLength(payload.description, 20000, '作品描述');
    for (const [label, value] of [
      ['Demo 链接', payload.demoUrl],
      ['代码仓库链接', payload.repoUrl],
      ['视频链接', payload.videoUrl],
    ] as const) {
      if (value) {
        this.validateLength(value, 1000, label);
        this.validateHttpUrl(value, label);
      }
    }
    if (!payload.attachments) return;
    if (payload.attachments.length > 10) throw new BadRequestException('附件不能超过 10 个');
    payload.attachments.forEach((file, index) => this.validateFileMeta(file, `附件 ${index + 1}`));
  }

  private async ensureExists(id: string) {
    const hackathon = await this.prisma.hackathon.findUnique({ where: { id } });
    if (!hackathon) throw new NotFoundException('Hackathon not found');
    return hackathon;
  }

  private async ensureSubmissionOpen(id: string) {
    const hackathon = await this.ensureExists(id);
    const now = new Date();
    if (hackathon.status === HackathonStatus.cancelled) {
      throw new BadRequestException('该黑客松已取消');
    }
    if (now < hackathon.startDate) {
      throw new BadRequestException('提交尚未开始');
    }
    if (now > hackathon.endDate) {
      throw new BadRequestException('提交已截止');
    }
    if (hackathon.submissionDeadline && now > hackathon.submissionDeadline) {
      throw new BadRequestException('提交已截止');
    }
    return hackathon;
  }

  private async ensureApproved(userId: string, hackathonId: string) {
    const registration = await this.prisma.hackathonRegistration.findUnique({
      where: { hackathonId_userId: { hackathonId, userId } },
    });
    if (
      !registration ||
      registration.status === 'cancelled' ||
      registration.reviewStatus !== ReviewStatus.approved
    ) {
      throw new ForbiddenException('报名审核通过后才能参赛');
    }
  }

  // ==================== P1 修复(2026-07-24): Judges ====================

  async listJudges(hackathonId: string) {
    return this.prisma.judge.findMany({
      where: { hackathonId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async addJudge(hackathonId: string, body: {
    name: string;
    title?: string;
    avatarUrl?: string;
    bio?: string;
    orderIndex?: number;
    role?: 'judge' | 'advisor' | 'host';
  }) {
    if (!body.name?.trim()) {
      throw new BadRequestException('judge.name 不能为空');
    }
    return this.prisma.judge.create({
      data: {
        hackathonId,
        name: body.name.trim(),
        title: body.title,
        avatarUrl: body.avatarUrl,
        bio: body.bio,
        orderIndex: body.orderIndex ?? 0,
        role: body.role ?? 'judge',
      },
    });
  }

  async updateJudge(hackathonId: string, judgeId: string, body: any) {
    // 归属校验: judgeId 必须属于该 hackathon, 防止跨黑客松 IDOR (纵深防御)
    const judge = await this.prisma.judge.findFirst({ where: { id: judgeId, hackathonId } });
    if (!judge) throw new NotFoundException('Judge not found');
    return this.prisma.judge.update({
      where: { id: judgeId },
      data: body,
    });
  }

  async removeJudge(hackathonId: string, judgeId: string) {
    const judge = await this.prisma.judge.findFirst({ where: { id: judgeId, hackathonId } });
    if (!judge) throw new NotFoundException('Judge not found');
    await this.prisma.judge.delete({ where: { id: judgeId } });
    return { message: 'Judge deleted' };
  }

  // ==================== P1 修复(2026-07-24): Sponsors ====================

  async listSponsors(hackathonId: string) {
    return this.prisma.sponsor.findMany({
      where: { hackathonId },
      orderBy: [{ tier: 'asc' }, { orderIndex: 'asc' }],
    });
  }

  async addSponsor(hackathonId: string, body: {
    name: string;
    logoUrl?: string;
    websiteUrl?: string;
    tier?: 'platinum' | 'gold' | 'silver' | 'bronze';
    orderIndex?: number;
  }) {
    if (!body.name?.trim()) {
      throw new BadRequestException('sponsor.name 不能为空');
    }
    return this.prisma.sponsor.create({
      data: {
        hackathonId,
        name: body.name.trim(),
        logoUrl: body.logoUrl,
        websiteUrl: body.websiteUrl,
        tier: body.tier ?? 'silver',
        orderIndex: body.orderIndex ?? 0,
      },
    });
  }

  async updateSponsor(hackathonId: string, sponsorId: string, body: any) {
    // 归属校验: sponsorId 必须属于该 hackathon
    const sponsor = await this.prisma.sponsor.findFirst({ where: { id: sponsorId, hackathonId } });
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    return this.prisma.sponsor.update({
      where: { id: sponsorId },
      data: body,
    });
  }

  async removeSponsor(hackathonId: string, sponsorId: string) {
    const sponsor = await this.prisma.sponsor.findFirst({ where: { id: sponsorId, hackathonId } });
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    await this.prisma.sponsor.delete({ where: { id: sponsorId } });
    return { message: 'Sponsor deleted' };
  }
}
