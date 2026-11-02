import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInstructorDto,
  UpdateInstructorDto,
  QueryInstructorDto,
  LinkCourseDto,
  SyncCourseLinksDto,
  CreateExpertiseDto,
  UpdateExpertiseDto,
  ReorderInstructorsDto,
} from './instructors.dto';
import { CourseInstructorRole, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PUBLIC_COURSE_WHERE } from '../../common/course-access/course-access-policy.service';

@Injectable()
export class InstructorsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =============================================================
  // 公共 include (前台 / 后台都用)
  // =============================================================

  private instructorListInclude = {
    expertiseLinks: {
      include: { expertise: true },
      orderBy: { orderIndex: 'asc' as const },
    },
    _count: {
      select: { courseLinks: true },
    },
  };

  private instructorDetailInclude = {
    expertiseLinks: {
      include: { expertise: true },
      orderBy: { orderIndex: 'asc' as const },
    },
    courseLinks: {
      include: {
        course: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            level: true,
            duration: true,
            costType: true,
            status: true,
            instructor: true, // 保留字符串 fallback
          },
        },
      },
      orderBy: [{ role: 'asc' as const }, { orderIndex: 'asc' as const }],
    },
  };

  // =============================================================
  // Slug 生成
  // =============================================================

  /**
   * ASCII slugify: 字母/数字保留, 其他转 -, 去首尾 -, 限长 40
   * 中文名 → hash 4 位兜底, 形如 i-a3f2
   */
  private slugify(name: string): string {
    const ascii = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!ascii) {
      return `i-${createHash('sha1').update(name).digest('hex').slice(0, 4)}`;
    }
    return ascii.slice(0, 40);
  }

  /**
   * 保证 slug 唯一: 冲突追加 -N, 100 次内必成功, 极端情况 sha1 兜底
   */
  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base;
    let suffix = 0;
    while (suffix < 100) {
      const existing = await this.prisma.instructor.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return `${base}-${createHash('sha1').update(base + Date.now()).digest('hex').slice(0, 6)}`;
  }

  // =============================================================
  // 列表
  // =============================================================

  async findAll(params: QueryInstructorDto, options: { publishedOnly?: boolean } = {}) {
    const { search, expertiseIds, published, sort, page, limit } = params;
    const where: Prisma.InstructorWhereInput = {};

    // 前台强制 published=true; 后台不传 = 看所有
    if (options.publishedOnly) {
      where.publishedAt = { not: null };
    } else if (published !== undefined) {
      where.publishedAt = published ? { not: null } : null;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameEn: { contains: search } },
        { title: { contains: search } },
        { headline: { contains: search } },
      ];
    }

    if (expertiseIds && expertiseIds.length > 0) {
      where.expertiseLinks = {
        some: { expertiseId: { in: expertiseIds } },
      };
    }

    let orderBy: Prisma.InstructorOrderByWithRelationInput = { orderIndex: 'asc' };
    if (sort === 'name') orderBy = { name: 'asc' };
    else if (sort === 'recent') orderBy = { createdAt: 'desc' };

    const take = Math.min(limit ?? 24, 100);
    const skip = ((page ?? 1) - 1) * take;
    const listInclude = options.publishedOnly
      ? {
          ...this.instructorListInclude,
          _count: {
            select: {
              courseLinks: { where: { course: { is: PUBLIC_COURSE_WHERE } } },
            },
          },
        }
      : this.instructorListInclude;

    const [items, total] = await Promise.all([
      this.prisma.instructor.findMany({
        where,
        include: listInclude,
        orderBy,
        take,
        skip,
      }),
      this.prisma.instructor.count({ where }),
    ]);

    return {
      items,
      total,
      page: page ?? 1,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  // =============================================================
  // 详情 (按 slug, 前台)
  // =============================================================

  async findBySlug(slug: string, options: { publishedOnly?: boolean } = {}) {
    const where: Prisma.InstructorWhereInput = { slug };
    if (options.publishedOnly) where.publishedAt = { not: null };
    const detailInclude = options.publishedOnly
      ? {
          ...this.instructorDetailInclude,
          courseLinks: {
            ...this.instructorDetailInclude.courseLinks,
            where: { course: { is: PUBLIC_COURSE_WHERE } },
          },
        }
      : this.instructorDetailInclude;
    const instructor = await this.prisma.instructor.findFirst({
      where,
      include: detailInclude,
    });
    if (!instructor) throw new NotFoundException('Instructor not found');
    return instructor;
  }

  // =============================================================
  // 详情 (按 id, admin / 内部用)
  // =============================================================

  async findById(id: string) {
    const instructor = await this.prisma.instructor.findUnique({
      where: { id },
      include: this.instructorDetailInclude,
    });
    if (!instructor) throw new NotFoundException('Instructor not found');
    return instructor;
  }

  // =============================================================
  // 创建
  // =============================================================

  async create(dto: CreateInstructorDto) {
    const { published, expertiseIds, ...rest } = dto;

    // slug 自动生成 (如果没指定)
    let slug = rest.slug;
    if (!slug) {
      slug = await this.ensureUniqueSlug(this.slugify(rest.name));
    } else {
      // 验证指定 slug 唯一
      const existing = await this.prisma.instructor.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existing) throw new ConflictException(`Slug "${slug}" 已被占用`);
    }

    const instructor = await this.prisma.instructor.create({
      data: {
        ...rest,
        slug,
        publishedAt: published ? new Date() : null,
        expertiseLinks: expertiseIds
          ? {
              create: expertiseIds.map((expertiseId, orderIndex) => ({
                expertiseId,
                orderIndex,
              })),
            }
          : undefined,
      },
      include: this.instructorDetailInclude,
    });


    return instructor;
  }

  // =============================================================
  // 更新
  // =============================================================

  async update(id: string, dto: UpdateInstructorDto) {
    const existing = await this.prisma.instructor.findUnique({
      where: { id },
      select: { id: true, slug: true, publishedAt: true },
    });
    if (!existing) throw new NotFoundException('Instructor not found');

    const { published, expertiseIds, slug, ...rest } = dto;

    // slug 变更时验证唯一
    let nextSlug = existing.slug;
    if (slug && slug !== existing.slug) {
      nextSlug = await this.ensureUniqueSlug(slug, id);
    }

    // 专长重置 (整组覆盖)
    let expertiseOps: Prisma.InstructorUpdateInput['expertiseLinks'] = undefined;
    if (expertiseIds !== undefined) {
      expertiseOps = {
        deleteMany: {},
        create: expertiseIds.map((expertiseId, orderIndex) => ({
          expertiseId,
          orderIndex,
        })),
      };
    }

    const updateData: Prisma.InstructorUpdateInput = {
      ...rest,
      ...(slug && slug !== existing.slug ? { slug: nextSlug } : {}),
      ...(published !== undefined
        ? { publishedAt: published ? new Date() : null }
        : {}),
      ...(expertiseOps ? { expertiseLinks: expertiseOps } : {}),
    };

    const updated = await this.prisma.instructor.update({
      where: { id },
      data: updateData,
      include: this.instructorDetailInclude,
    });


    return updated;
  }

  // =============================================================
  // 软删 (置草稿 + 解除所有课程 link)
  // =============================================================

  /**
   * 软删语义: publishedAt = null (前台 404, 课程卡 fallback)
   * 同时解除该讲师的所有 courseLink (避免历史课程显示悬空)
   * 真正物理删除只走 Prisma 维护脚本, 业务端不开放
   */
  async softDelete(id: string) {
    const existing = await this.prisma.instructor.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Instructor not found');

    const [, updated] = await this.prisma.$transaction([
      this.prisma.courseInstructorLink.deleteMany({
        where: { instructorId: id },
      }),
      this.prisma.instructor.update({
        where: { id },
        data: { publishedAt: null },
        include: this.instructorDetailInclude,
      }),
    ]);


    return updated;
  }

  // =============================================================
  // 课程挂载
  // =============================================================

  /**
   * 把一个讲师/导师挂到课程
   * - 同 (courseId, instructorId, role) 已存在则覆盖 isPrimary / orderIndex
   * - role=instructor 允许 isPrimary=true; role=mentor 强制 isPrimary=false
   * - 同 (courseId, role=instructor) 已存在 isPrimary=true 时, 后者覆盖前者 (单主讲师约束)
   */
  async linkToCourse(courseId: string, dto: LinkCourseDto) {
    // 校验课程存在
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    // 校验讲师存在
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: dto.instructorId },
      select: { id: true, name: true },
    });
    if (!instructor) throw new NotFoundException('Instructor not found');

    const isPrimary = dto.role === CourseInstructorRole.mentor ? false : !!dto.isPrimary;

    // 启用事务: 如果新 link 是主讲师, 先把同 course 同 role 的旧主讲师取消
    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.courseInstructorLink.updateMany({
          where: {
            courseId,
            role: dto.role,
            isPrimary: true,
            NOT: { instructorId: dto.instructorId },
          },
          data: { isPrimary: false },
        });
      }

      // upsert (idempotent)
      const link = await tx.courseInstructorLink.upsert({
        where: {
          courseId_instructorId_role: {
            courseId,
            instructorId: dto.instructorId,
            role: dto.role,
          },
        },
        create: {
          courseId,
          instructorId: dto.instructorId,
          role: dto.role,
          isPrimary,
          orderIndex: dto.orderIndex ?? 0,
        },
        update: {
          isPrimary,
          orderIndex: dto.orderIndex ?? 0,
        },
      });

      // courses.instructor 仅作历史兼容列；主讲关联变更时自动同步，
      // 禁止后台存在两个互相矛盾的讲师数据源。
      if (isPrimary) {
        await tx.course.update({
          where: { id: courseId },
          data: { instructor: instructor.name },
        });
      }


      return link;
    });
  }

  /**
   * 解除讲师-课程 link
   */
  async unlinkFromCourse(courseId: string, linkId: string) {
    const link = await this.prisma.courseInstructorLink.findUnique({
      where: { id: linkId },
      select: { id: true, courseId: true, role: true, isPrimary: true },
    });
    if (!link || link.courseId !== courseId) {
      throw new NotFoundException('Link not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.courseInstructorLink.delete({ where: { id: linkId } });
      if (link.role === CourseInstructorRole.instructor && link.isPrimary) {
        const replacement = await tx.courseInstructorLink.findFirst({
          where: { courseId, role: CourseInstructorRole.instructor },
          orderBy: { orderIndex: 'asc' },
          include: { instructor: { select: { name: true } } },
        });
        if (replacement) {
          await tx.courseInstructorLink.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
          await tx.course.update({
            where: { id: courseId },
            data: { instructor: replacement.instructor.name },
          });
        }
      }
    });
    return { deleted: true, id: linkId };
  }

  /**
   * 整组同步课程的讲师/导师挂载 (admin 编辑课程时一次提交)
   * 策略: diff - 先删后建, 用事务保证原子性
   * 注: 简单可靠, link 数小 (单课程 < 5 个) 性能可接受
   */
  async syncCourseLinks(courseId: string, dto: SyncCourseLinksDto) {
    // 校验课程
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    // 校验所有 instructorId 存在
    const ids = Array.from(new Set(dto.links.map((l) => l.instructorId)));
    if (ids.length > 0) {
      const found = await this.prisma.instructor.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        const foundIds = new Set(found.map((f) => f.id));
        const missing = ids.filter((id) => !foundIds.has(id));
        throw new BadRequestException(`讲师不存在: ${missing.join(', ')}`);
      }
    }

    // 主讲师约束: 同 role 最多 1 个 isPrimary
    const primaryCounts = new Map<string, number>();
    for (const l of dto.links) {
      if (l.isPrimary && l.role === CourseInstructorRole.instructor) {
        const k = l.role;
        primaryCounts.set(k, (primaryCounts.get(k) ?? 0) + 1);
      }
    }
    for (const [role, count] of primaryCounts) {
      if (count > 1) {
        throw new BadRequestException(`同 role=${role} 只能有 1 个主讲师, 当前 ${count} 个`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. 删全部旧 link
      await tx.courseInstructorLink.deleteMany({ where: { courseId } });

      // 2. 建新 link
      const created = await Promise.all(
        dto.links.map((l) =>
          tx.courseInstructorLink.create({
            data: {
              courseId,
              instructorId: l.instructorId,
              role: l.role,
              isPrimary: l.role === CourseInstructorRole.mentor ? false : !!l.isPrimary,
              orderIndex: l.orderIndex ?? 0,
            },
          }),
        ),
      );

      const primaryInput = dto.links.find(
        (l) => l.role === CourseInstructorRole.instructor && l.isPrimary,
      ) ?? dto.links.find((l) => l.role === CourseInstructorRole.instructor);
      if (primaryInput) {
        const primaryInstructor = await tx.instructor.findUnique({
          where: { id: primaryInput.instructorId },
          select: { name: true },
        });
        if (primaryInstructor) {
          await tx.course.update({
            where: { id: courseId },
            data: { instructor: primaryInstructor.name },
          });
        }
      }


      return { courseId, links: created };
    });
  }

  // =============================================================
  // 课程下挂载 - 列表
  // =============================================================

  /**
   * 列出某课程的所有讲师/导师 link
   * 内部 prisma 查, 包含讲师/导师 profile 摘要
   */
  async listCourseLinks(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    const links = await this.prisma.courseInstructorLink.findMany({
      where: { courseId },
      include: {
        instructor: {
          select: {
            id: true,
            slug: true,
            name: true,
            nameEn: true,
            title: true,
            avatarUrl: true,
            company: true,
            publishedAt: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { orderIndex: 'asc' }],
    });
    return links;
  }

  // =============================================================
  // 排序
  // =============================================================

  async reorder(dto: ReorderInstructorsDto) {
    // 校验: 所有 ID 存在
    const found = await this.prisma.instructor.findMany({
      where: { id: { in: dto.orderedIds } },
      select: { id: true },
    });
    if (found.length !== dto.orderedIds.length) {
      throw new BadRequestException('部分讲师 ID 不存在');
    }

    // 事务内更新 orderIndex
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.instructor.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    );


    return { reordered: dto.orderedIds.length };
  }

  // =============================================================
  // 统计
  // =============================================================

  /**
   * 讲师统计: 名下课程数 / 总报名人次 / 总完读率 / 平均评分
   * 性能: 4 个聚合 query, 单讲师实时算, 列表页不调用 (会爆)
   */
  async getStats(id: string) {
    const instructor = await this.prisma.instructor.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!instructor) throw new NotFoundException('Instructor not found');

    const courseIds = await this.prisma.courseInstructorLink.findMany({
      where: { instructorId: id },
      select: { courseId: true },
    });
    const ids = courseIds.map((c) => c.courseId);

    if (ids.length === 0) {
      return {
        instructorId: id,
        name: instructor.name,
        courseCount: 0,
        studentCount: 0,
        completionRate: 0,
        averageRating: 0,
        reviewCount: 0,
      };
    }

    // 1. 名下课程数
    const courseCount = ids.length;

    // 2. 总报名人次 (distinct user, 多个课程不去重 — 每个课程独立学习)
    const studentCount = await this.prisma.enrollment.count({
      where: { courseId: { in: ids } },
    });

    // 3. 完读率: 进度 = 100% 的 enrollment / 总 enrollment
    const totalEnrollments = studentCount;
    const completedEnrollments = await this.prisma.progressRecord.count({
      where: {
        courseId: { in: ids },
        status: 'completed',
      },
    });
    const completionRate = totalEnrollments > 0 ? completedEnrollments / totalEnrollments : 0;

    // 4. 平均评分
    const ratingAgg = await this.prisma.review.aggregate({
      where: { courseId: { in: ids } },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return {
      instructorId: id,
      name: instructor.name,
      courseCount,
      studentCount,
      completionRate: Math.round(completionRate * 100) / 100,
      averageRating: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : 0,
      reviewCount: ratingAgg._count._all,
    };
  }

  // =============================================================
  // 专长管理
  // =============================================================

  async findAllExpertises() {
    return this.prisma.instructorExpertise.findMany({
      orderBy: [{ isActive: 'desc' }, { orderIndex: 'asc' }],
    });
  }

  async createExpertise(dto: CreateExpertiseDto) {
    const existing = await this.prisma.instructorExpertise.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`专长 key "${dto.key}" 已存在`);

    const created = await this.prisma.instructorExpertise.create({
      data: {
        key: dto.key,
        label: dto.label,
        labelEn: dto.labelEn,
        isActive: dto.isActive ?? true,
        orderIndex: dto.orderIndex ?? 0,
      },
    });


    return created;
  }

  async updateExpertise(id: string, dto: UpdateExpertiseDto) {
    const existing = await this.prisma.instructorExpertise.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Expertise not found');

    const updated = await this.prisma.instructorExpertise.update({
      where: { id },
      data: dto,
    });


    return updated;
  }

  async deleteExpertise(id: string) {
    const existing = await this.prisma.instructorExpertise.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Expertise not found');

    // 关联 link 走 cascade, 自动删
    await this.prisma.instructorExpertise.delete({ where: { id } });
    return { deleted: true, id };
  }
}
