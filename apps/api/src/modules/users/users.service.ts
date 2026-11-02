import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserDto,
  UpdateUserDto,
  GrantCourseAccessDto,
  GrantDegreeAccessDto,
  ChangePasswordDto,
} from './users.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    avatarUrl: true,
    passwordResetRequired: true,
    points: true,
    level: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  };

  async findAll(params: {
    role?: UserRole;
    search?: string;
    page: number;
    limit: number;
    status?: 'active' | 'disabled' | 'all';
  }) {
    const where: any = {};
    if (params.status !== 'all') {
      where.deletedAt = params.status === 'disabled' ? { not: null } : null;
    }
    if (params.role) where.role = params.role;
    if (params.search) {
      where.OR = [
        { email: { contains: params.search } },
        { name: { contains: params.search } },
      ];
    }

    const skip = (params.page - 1) * params.limit;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.userSelect,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page: params.page, limit: params.limit };
  }

  async findOne(id: string) {
    // P1-3 扩展:admin 详情抽屉需要 6 section — 一次查全减少 N+1
    // 注意:passwordHash 不返回(已在 userSelect 排除)
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.userSelect,
        enrollments: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                thumbnail: true,
              },
            },
            degree: { select: { id: true, title: true } },
          },
          orderBy: { enrolledAt: 'desc' },
          take: 20, // 最近 20 笔报名
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20, // 最近 20 笔订单
        },
        certificates: {
          orderBy: { issuedAt: 'desc' },
          take: 20, // 最近 20 张证书
        },
        pointTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20, // 最近 20 笔积分流水
        },
        _count: {
          select: {
            enrollments: true,
            orders: true,
            certificates: true,
            progressRecords: true,
            submissions: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // P1 修复(2026-07-24): 给每个 enrollment 加 completedLessonsCount + progressPercent
    // 一次 groupBy 算完, 避免 N+1
    const enrollments = (user as any).enrollments ?? [];
    const courseIds = enrollments
      .map((e: any) => e.course?.id)
      .filter(Boolean) as string[];
    if (courseIds.length > 0) {
      // 已修课时数
      const completed = await this.prisma.progressRecord.groupBy({
        by: ['courseId'],
        where: { userId: id, status: 'completed', courseId: { in: courseIds } },
        _count: { _all: true },
      });
      const completedMap = new Map(
        completed.map((c) => [c.courseId, c._count._all ?? 0]),
      );
      // 总课时数 (lesson 间接挂在 chapter 下, 聚合 chapter.lessons)
      const chapters = await this.prisma.chapter.findMany({
        where: { courseId: { in: courseIds }, deletedAt: null },
        select: {
          courseId: true,
          _count: { select: { lessons: { where: { deletedAt: null } } } },
        },
      });
      const totalMap = new Map<string, number>();
      for (const ch of chapters) {
        totalMap.set(ch.courseId, (totalMap.get(ch.courseId) ?? 0) + (ch._count.lessons ?? 0));
      }
      for (const e of enrollments) {
        const total = e.course?.id ? totalMap.get(e.course.id) ?? 0 : 0;
        const done = e.course?.id ? completedMap.get(e.course.id) ?? 0 : 0;
        e.completedLessonsCount = done;
        e.totalLessonsCount = total;
        e.isCompleted = total > 0 && done >= total;
        e.progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;
      }
    }

    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
      },
      select: this.userSelect,
    });


    return user;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    options: { actorUserId?: string; isAdmin?: boolean } = {},
  ) {
    // 不允许通过 PATCH /users/:id 改 role / points / level / passwordHash, 这些字段是 admin 专用
    // 业务上, 普通用户改自己只能改 name / avatarUrl
    const safe: Partial<UpdateUserDto> = {};
    if (dto.name !== undefined) safe.name = dto.name;
    if (dto.avatarUrl !== undefined) safe.avatarUrl = dto.avatarUrl;
    if (options.isAdmin && dto.role !== undefined) safe.role = dto.role;

    // 软删用户不能改: 先 findFirst 查 (UserWhereUniqueInput 不支持 deletedAt)
    const before = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.userSelect,
    });
    if (!before) throw new NotFoundException('User not found or deleted');

    const updated = await this.prisma.user.update({
      where: { id },
      data: safe,
      select: this.userSelect,
    });


    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('当前密码不正确');
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordResetRequired: false },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return { changed: true };
  }

  async resetPassword(userId: string, actorUserId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Returned exactly once to the administrator; only the bcrypt hash is stored.
    const temporaryPassword = `A!a1${randomBytes(12).toString('base64url')}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordResetRequired: true },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return { temporaryPassword, passwordResetRequired: true };
  }

  async disable(id: string, actorUserId: string) {
    if (id === actorUserId) {
      throw new ForbiddenException('不能停用当前登录账号');
    }
    // 软停用: 改 deletedAt, 物理删除会触发 17 个外键 cascade 断数据
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found or already disabled');
    if (user.role === UserRole.admin) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: UserRole.admin, deletedAt: null },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException('不能停用最后一个管理员账号');
      }
    }

    const deleted = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, email: true, deletedAt: true },
    });

    // A soft-deleted account must not keep a valid long-lived session.
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });


    return deleted;
  }

  async restore(id: string, actorUserId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found or already active');

    const restored = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      select: this.userSelect,
    });
    return restored;
  }

  async grantCourseAccess(userId: string, dto: GrantCourseAccessDto, actorUserId = userId) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const enrollments = await this.prisma.$transaction(
      dto.courseIds.map((courseId) =>
        this.prisma.enrollment.upsert({
          where: { userId_courseId: { userId, courseId } },
          update: {
            deletedAt: null,
            expiresAt: null,
            enrolledAt: new Date(),
            source: 'direct',
          },
          create: { userId, courseId, source: 'direct' },
        }),
      ),
    );


    return { granted: enrollments.length };
  }

  async grantDegreeAccess(userId: string, dto: GrantDegreeAccessDto, actorUserId = userId) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const enrollments = await this.prisma.$transaction(
      dto.degreeIds.map((degreeId) =>
        this.prisma.enrollment.upsert({
          where: { userId_degreeId: { userId, degreeId } },
          update: {
            deletedAt: null,
            expiresAt: null,
            enrolledAt: new Date(),
            source: 'direct',
          },
          create: { userId, degreeId, source: 'direct' },
        }),
      ),
    );


    return { granted: enrollments.length };
  }
}
