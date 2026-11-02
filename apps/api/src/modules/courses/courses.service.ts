import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CourseSort,
  CreateCourseDto,
  UpdateCourseDto,
  LinkDegreesDto,
} from './courses.dto';
import { CourseStatus, CourseType, UserRole } from '@prisma/client';
import {
  CourseAccessPolicyService,
  PUBLIC_COURSE_WHERE,
} from '../../common/course-access/course-access-policy.service';

export interface RatingDistribution {
  avg: number;
  count: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

export interface CourseWithRating {
  id: string;
  title: string;
  // ... 课程全字段
  rating: RatingDistribution;
}

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessPolicyService,
  ) {}

  // 公共 sub-include: 讲师/导师关联 (前/后台详情/列表都用)
  // 前台用 publishedOnly 约束: 草稿讲师不进 public API
  private courseInstructorLinksInclude = (publishedOnly: boolean) => ({
    courseLinks: {
      where: publishedOnly ? { instructor: { publishedAt: { not: null } } } : undefined,
      orderBy: [{ role: 'asc' as const }, { orderIndex: 'asc' as const }],
      include: {
        instructor: {
          select: {
            id: true,
            slug: true,
            name: true,
            nameEn: true,
            title: true,
            headline: true,
            avatarUrl: true,
            company: true,
            publishedAt: true,
            expertiseLinks: {
              orderBy: { orderIndex: 'asc' as const },
              include: { expertise: { select: { id: true, key: true, label: true } } },
            },
          },
        },
      },
    },
  });

  // 公共 include, 默认 admin 视角 (含草稿讲师)
  // 公开访问点 (findAll + findOne 非 admin) 自行覆盖 courseLinks
  private courseIncludeBase = {
    chapters: {
      include: {
        lessons: {
          include: { resources: true },
          orderBy: { orderIndex: 'asc' as const },
        },
      },
      orderBy: { orderIndex: 'asc' as const },
    },
    // P0 修复(2026-07-24): 返回 course 所属的 degree, 让前端能展示
    degreeCourses: {
      include: {
        degree: {
          select: { id: true, title: true, status: true, costType: true },
        },
      },
      orderBy: { orderIndex: 'asc' as const },
    },
    // P1 修复(2026-07-24): 分类
    category: { select: { id: true, key: true, label: true } },
  };

  private getCourseInclude(publishedOnly: boolean) {
    return {
      ...this.courseIncludeBase,
      chapters: {
        ...this.courseIncludeBase.chapters,
        where: publishedOnly ? { deletedAt: null } : undefined,
        include: {
          lessons: {
            ...this.courseIncludeBase.chapters.include.lessons,
            where: publishedOnly
              ? { deletedAt: null, isHidden: false }
              : undefined,
            include: {
              resources: {
                where: publishedOnly ? { deletedAt: null } : undefined,
              },
            },
          },
        },
      },
      courseLinks: this.courseInstructorLinksInclude(publishedOnly).courseLinks,
    };
  }

  // 保留旧名 (admin 内部用 — 含草稿讲师)
  private get courseInclude() {
    return this.getCourseInclude(false);
  }

  async findAll(params: {
    status?: CourseStatus;
    courseType?: CourseType;
    search?: string;
    sort?: CourseSort;
    allowNonPublished?: boolean;
    instructorId?: string;
    instructorSlug?: string;
  }) {
    const where: any = {};
    // Public list must never expose draft/archived courses by omission.
    if (params.allowNonPublished) {
      if (params.status) where.status = params.status;
    } else {
      Object.assign(where, PUBLIC_COURSE_WHERE);
    }
    if (params.courseType) where.courseType = params.courseType;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search } },
        { description: { contains: params.search } },
        { instructor: { contains: params.search } },
        { courseLinks: { some: { instructor: { name: { contains: params.search } } } } },
      ];
    }
    // 讲师过滤: 通过 courseLinks 关联
    if (params.instructorId || params.instructorSlug) {
      where.courseLinks = {
        some: {
          instructor: params.instructorId
            ? { id: params.instructorId }
            : { slug: params.instructorSlug },
        },
      };
    }

    const courses = await this.prisma.course.findMany({
      where,
      include: {
        reviews: {
          where: { deletedAt: null },
          select: { rating: true },
        },
        _count: {
          select: {
            enrollments: { where: { deletedAt: null } },
          },
        },
        // 公开 API 仅返已发布讲师；admin 列表需要看到草稿讲师以便编辑。
        ...this.courseInstructorLinksInclude(!params.allowNonPublished),
      },
      orderBy: { createdAt: 'desc' },
      // P1-7 防御: 默认 50, max 100, 防 DoS (公开 list 拉全表 OOM)
      take: 100,
    });

    const shaped = courses.map(({ reviews, _count, ...course }) => {
      // 兼容迁移期旧数据与只返回课程基础字段的调用方。
      const courseLinks = course.courseLinks ?? [];
      const primary = courseLinks.find(
        (link) => link.role === 'instructor' && link.isPrimary,
      );
      const firstInstructor = courseLinks.find((link) => link.role === 'instructor');
      return {
        ...course,
        // 旧 instructor 列只作导入兼容，所有展示优先以关联表为权威数据源。
        instructor: primary?.instructor.name ?? firstInstructor?.instructor.name ?? course.instructor,
        rating:
          reviews.length === 0
            ? 0
            : Math.round(
                (reviews.reduce((sum, review) => sum + review.rating, 0) /
                  reviews.length) *
                  10,
              ) / 10,
        reviewCount: reviews.length,
        enrollmentCount: _count.enrollments,
      };
    });

    switch (params.sort) {
      case CourseSort.rating:
        return shaped.sort(
          (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
        );
      case CourseSort.popular:
        return shaped.sort(
          (a, b) =>
            b.enrollmentCount - a.enrollmentCount ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        );
      case CourseSort.newest:
      case CourseSort.recent:
      default:
        return shaped;
    }
  }

  /**
   * v1.9-alpha.2 (batch-7 A-05): 相似课程推荐。
   *
   * 不做向量检索; 按 plan §3.4, 同 category 加 1 分, tag 交集数 +1/个,
   * 取 score 最高的 N 条已发布公开课程, 排除自身。
   *
   * 实现策略 (Prisma 字符串 tags 不能 in-memory intersect, 但候选集够小):
   * 1) 读 source course 的 tags + categoryId (1 query)
   * 2) findMany 公开已发布、排除自身、限制 N*8 条候选 (1 query)
   * 3) JS 计算交集 + 排序 + slice top N
   *
   * 8x 上限避免一个热门课程带出 400 条同标签; 实际 N ≤ 4 时只取 32 候选, 完全够用。
   * 不返回完整章节 / 课时, 仅列表卡片所需字段 (与 findAll shaped 同形状)。
   */
  async findSimilarCourses(
    courseId: string,
    limit = 4,
  ): Promise<Array<{
    id: string;
    title: string;
    thumbnail: string;
    level: string;
    tags: string;
    category: { id: string; key: string; label: string } | null;
    ratingAvg: number;
    ratingCount: number;
    score: number;
  }>> {
    const safeLimit = Math.max(1, Math.min(limit, 12));
    const source = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { tags: true, categoryId: true },
    });
    if (!source) throw new NotFoundException('课程不存在');

    const sourceTags = new Set(
      (source.tags ?? '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    );

    // 候选 N*8 条上限
    const candidates = await this.prisma.course.findMany({
      where: {
        ...PUBLIC_COURSE_WHERE,
        id: { not: courseId },
      },
      include: {
        reviews: {
          where: { deletedAt: null },
          select: { rating: true },
        },
        category: { select: { id: true, key: true, label: true } },
      },
      take: safeLimit * 8,
    });

    const scored = candidates
      .map((c) => {
        const cTags = (c.tags ?? '')
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        const intersection = cTags.filter((t) => sourceTags.has(t)).length;
        const sameCategory =
          source.categoryId && c.categoryId === source.categoryId ? 1 : 0;
        const reviewCount = c.reviews.length;
        const ratingAvg =
          reviewCount > 0
            ? c.reviews.reduce((s, r) => s + r.rating, 0) / reviewCount
            : 0;
        // v1.9-alpha.2 (batch-7 A-05): 评分作为 tie-breaker (+0.1/分,
        // 上限 0.5, 不至于压过 tag 主导地位)
        const score = intersection * 2 + sameCategory + ratingAvg * 0.1;
        return {
          id: c.id,
          title: c.title,
          thumbnail: c.thumbnail,
          level: c.level,
          tags: c.tags,
          category: c.category,
          ratingAvg,
          ratingCount: reviewCount,
          score,
        };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);

    // 没有任何 tag/category 重叠 → 退化为评分最高的 N 条
    if (scored.length === 0 && candidates.length > 0) {
      return candidates
        .map((c) => ({
          id: c.id,
          title: c.title,
          thumbnail: c.thumbnail,
          level: c.level,
          tags: c.tags,
          category: c.category,
          ratingAvg:
            c.reviews.length > 0
              ? c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length
              : 0,
          ratingCount: c.reviews.length,
          score: 0,
        }))
        .sort(
          (a, b) =>
            b.ratingAvg - a.ratingAvg ||
            b.ratingCount - a.ratingCount ||
            a.title.localeCompare(b.title),
        )
        .slice(0, safeLimit);
    }

    return scored;
  }

  async findOne(
    id: string,
    access: { includeDraft?: boolean; userId?: string; isAdmin?: boolean } = {},
  ) {
    const publishedOnly = !access.isAdmin;
    const course = await this.prisma.course.findFirst({
      where: { id },
      include: this.getCourseInclude(publishedOnly),
    });
    if (!course) throw new NotFoundException('Course not found');
    const hasAccess = await this.courseAccess.hasFullContentAccess(course, {
      userId: access.userId,
      role: access.isAdmin ? UserRole.admin : undefined,
    });
    if (hasAccess) return course;
    return {
      ...course,
      chapters: course.chapters.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((lesson) => ({
          ...lesson,
          videoUrl: lesson.isPreview ? lesson.videoUrl : null,
          resources: lesson.resources.map((resource) => ({
            ...resource,
            url: resource.isLocked ? '' : resource.url,
          })),
        })),
      })),
    };
  }

  async create(dto: CreateCourseDto) {
    const {
      chapters,
      sourceVideoUrl,
      sourcePlatform,
      externalUrl,
      courseType,
      instructorId,
      instructor: legacyInstructor,
      ...courseData
    } = dto as CreateCourseDto & {
      sourceVideoUrl?: string;
      sourcePlatform?: string;
      externalUrl?: string;
      courseType?: CourseType;
    };

    const selectedInstructor = instructorId
      ? await this.prisma.instructor.findUnique({
          where: { id: instructorId },
          select: { id: true, name: true },
        })
      : null;
    if (instructorId && !selectedInstructor) {
      throw new BadRequestException('所选讲师不存在');
    }
    if (!selectedInstructor && !legacyInstructor?.trim()) {
      throw new BadRequestException('请从讲师库选择一位主讲讲师');
    }

    const course = await this.prisma.course.create({
      data: {
        ...courseData,
        instructor: selectedInstructor?.name ?? legacyInstructor!.trim(),
        ...(sourceVideoUrl ? { sourceVideoUrl } : {}),
        ...(sourcePlatform ? { sourcePlatform } : {}),
        ...(externalUrl ? { externalUrl } : {}),
        ...(courseType ? { courseType } : {}),
        status: courseData.status ?? CourseStatus.draft,
        courseLinks: selectedInstructor
          ? {
              create: {
                instructorId: selectedInstructor.id,
                role: 'instructor',
                isPrimary: true,
                orderIndex: 0,
              },
            }
          : undefined,
        chapters: chapters
          ? {
              create: chapters.map((chapter) => ({
                title: chapter.title,
                description: chapter.description,
                orderIndex: chapter.orderIndex,
                lessons: chapter.lessons
                  ? {
                      create: chapter.lessons.map((lesson) => ({
                        title: lesson.title,
                        description: lesson.description,
                        videoUrl: lesson.videoUrl,
                        videoDuration: lesson.videoDuration,
                        orderIndex: lesson.orderIndex,
                        isPreview: lesson.isPreview ?? false,
                        resources: lesson.resources
                          ? { create: lesson.resources }
                          : undefined,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: this.courseInclude,
    });


    return course;
  }

  async update(id: string, dto: UpdateCourseDto) {
    // chapters 字段:dedicated endpoints 处理,这里只更新 course 本身
    const {
      chapters: _chapters,
      instructorId,
      instructor: _legacyInstructor,
      ...courseData
    } = dto;

    if (instructorId) {
      const selectedInstructor = await this.prisma.instructor.findUnique({
        where: { id: instructorId },
        select: { id: true, name: true },
      });
      if (!selectedInstructor) throw new BadRequestException('所选讲师不存在');

      await this.prisma.$transaction(async (tx) => {
        await tx.course.update({
          where: { id },
          data: { ...courseData, instructor: selectedInstructor.name },
        });
        await tx.courseInstructorLink.updateMany({
          where: { courseId: id, role: 'instructor', isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.courseInstructorLink.upsert({
          where: {
            courseId_instructorId_role: {
              courseId: id,
              instructorId: selectedInstructor.id,
              role: 'instructor',
            },
          },
          create: {
            courseId: id,
            instructorId: selectedInstructor.id,
            role: 'instructor',
            isPrimary: true,
            orderIndex: 0,
          },
          update: { isPrimary: true },
        });
      });
    }
    const course = await this.prisma.course.update({
      where: { id },
      data: instructorId ? {} : courseData,
      include: this.courseInclude,
    });


    return course;
  }

  async delete(id: string) {
    // 硬删除会级联物理清除学员的 ProgressRecord/Review, 并把 Enrollment/Order
    // 置为 courseId=null 的幽灵记录(付费用户订单消失且无法退款)。有学员数据的
    // 课程只允许归档(status=archived), 不允许物理删除。
    const [enrollments, orders] = await Promise.all([
      this.prisma.enrollment.count({ where: { courseId: id } }),
      this.prisma.order.count({ where: { courseId: id } }),
    ]);
    if (enrollments > 0 || orders > 0) {
      throw new BadRequestException(
        '该课程已有报名或订单记录, 不能删除; 请改为归档(archived)',
      );
    }

    await this.prisma.course.delete({ where: { id } });


    return { message: 'Course deleted' };
  }

  /**
   * P0 修复(2026-07-24): 课程挂学位 — append 语义。
   * 把此 course 追加到每个指定 degree 的末尾(orderIndex = 现有 max + 1..N)。
   * 同一 (course, degree) 已存在则跳过(避免重复)。
   * 精确位置编辑请走 degree service.linkCourses。
   */
  async linkDegrees(courseId: string, dto: LinkDegreesDto) {
    // 校验 course 存在
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, ...PUBLIC_COURSE_WHERE },
      select: { id: true },
    });
    if (!course) {
      throw new BadRequestException('Degrees may only contain public published courses');
    }

    let appended = 0;
    let skipped = 0;
    for (const degreeId of dto.degreeIds) {
      // 已存在则跳过
      const existing = await this.prisma.degreeCourse.findUnique({
        where: { degreeId_courseId: { degreeId, courseId } },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      // 找该 degree 内现有最大 orderIndex
      const max = await this.prisma.degreeCourse.aggregate({
        where: { degreeId },
        _max: { orderIndex: true },
      });
      const orderIndex = (max._max.orderIndex ?? -1) + 1;
      await this.prisma.degreeCourse.create({
        data: { degreeId, courseId, orderIndex },
      });
      appended += 1;
    }


    return this.findOne(courseId, { includeDraft: true, isAdmin: true });
  }
}
