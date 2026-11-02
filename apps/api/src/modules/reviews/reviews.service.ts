/**
 * reviews.service.ts — P1-3 评价业务逻辑
 *
 * 三个公开行为:
 *   - findByCourse(courseId, page, limit):分页拉评价(含 user 名字+头像)
 *     排序:helpful DESC, createdAt DESC
 *   - create(userId, courseId, dto):登录用户给课程写评价
 *     - 1-5 范围(DTO 已验)
 *     - 一用户一课程一条(数据库 unique 约束兜底)
 *     - 必须先报名(Enrollment 存在)防止刷评价
 *     - 写 audit log
 *   - markHelpful(reviewId):登录用户给评价点 helpful
 *     - append-only counter(不验是否重复)
 *     - 不能给自己点
 *
 * 一个统计接口:
 *   - getDistribution(courseId):返回 { total, avg, counts[1..5] }
 *     给 courses.service 在 include 时直接拼到课程 detail
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './reviews.dto';
import { UserRole } from '@prisma/client';
import {
  CourseAccessPolicyService,
  PUBLIC_COURSE_WHERE,
} from '../../common/course-access/course-access-policy.service';

export interface ReviewWithUser {
  id: string;
  userId: string;
  courseId: string;
  rating: number;
  content: string;
  helpful: number;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface RatingDistribution {
  total: number;
  avg: number;
  counts: { 1: number; 2: number; 3: number; 4: number; 5: number };
  percentages: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessPolicyService,
  ) {}

  /**
   * P1-3 admin 软删评价
   * 方案:设置 deletedAt 并把正文替换为占位文本。
   * 作者和评分继续保留用于审计，但公开列表与评分分布不再计入。
   */
  async adminRemove(reviewId: string) {
    const existing = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!existing) throw new NotFoundException('Review not found');
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        content: '[已删除]',
        deletedAt: new Date(),
      },
    });
    return { ok: true, id: updated.id };
  }

  /**
   * 拉课程评价列表,分页 + 含 user
   * 排序:helpful DESC, createdAt DESC
   */
  async findByCourse(
    courseId: string,
    page: number,
    limit: number,
  ): Promise<{ items: ReviewWithUser[]; total: number; page: number; limit: number }> {
    // 先确认课程存在(避免对不存在的 id 返空列表误报成功)
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, visibility: true },
    });
    if (!course || course.status !== PUBLIC_COURSE_WHERE.status || course.visibility !== PUBLIC_COURSE_WHERE.visibility) {
      throw new NotFoundException('Course not found');
    }

    const skip = (page - 1) * limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { courseId, deletedAt: null },
        orderBy: [{ helpful: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.review.count({ where: { courseId, deletedAt: null } }),
    ]);

    return {
      items: items as unknown as ReviewWithUser[],
      total,
      page,
      limit,
    };
  }

  /**
   * 写一条评价
   * - 必须先报名(防刷)
   * - 1-5(DTO 已验)
   * - 一用户一课程一条(数据库 unique 约束)
   */
  async create(userId: string, courseId: string, dto: CreateReviewDto, role?: UserRole) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        status: true,
        visibility: true,
        origin: true,
        ownerUserId: true,
        costType: true,
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    await this.courseAccess.assertCanLearn(course, { userId, role });

    // 报名校验:已注册 / 学位中 / 已购买订单 = 任一即可
    // 公开课 / 免费课 / 慈善课:enrollment 直接放过
    // 已退款/已退课(软删)或过期的报名不具备评价资格
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        courseId,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new BadRequestException('请先报名课程后再评价');
    }

    // 一用户一课程一条(数据库 unique 兜底 + 业务层友好报错)
    const existing = await this.prisma.review.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      throw new ConflictException('你已评价过该课程');
    }

    const review = await this.prisma.review.create({
      data: {
        userId,
        courseId,
        rating: dto.rating,
        content: dto.content,
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });


    return review;
  }

  /**
   * 评价点赞
   * - 不能给自己点
   * - append-only counter(不维护谁点过)
   */
  async markHelpful(userId: string, reviewId: string, role?: UserRole) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        userId: true,
        courseId: true,
        deletedAt: true,
        course: {
          select: {
            id: true,
            status: true,
            visibility: true,
            origin: true,
            ownerUserId: true,
            costType: true,
          },
        },
      },
    });
    if (!review || review.deletedAt) throw new NotFoundException('Review not found');
    this.courseAccess.assertCanView(review.course, { userId, role });
    if (review.userId === userId) {
      throw new BadRequestException('不能给自己的评价点赞');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.reviewHelpful.createMany({
        data: [{ userId, reviewId }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        throw new ConflictException('你已标记过这条评价');
      }
      return tx.review.update({
        where: { id: reviewId },
        data: { helpful: { increment: 1 } },
        select: { id: true, helpful: true },
      });
    });


    return updated;
  }

  /**
   * 管理员全量评价列表(分页)
   * 用于 AdminReviewsPage — 显示所有用户评价,支持按课程/评分/状态过滤
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    courseId?: string;
    rating?: number;
    onlyDeleted?: boolean;
  }): Promise<{
    items: ReviewWithUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const where: {
      courseId?: string;
      rating?: number;
      deletedAt?: Date | null | { not: null };
    } = {};
    if (params.courseId) where.courseId = params.courseId;
    if (params.rating) where.rating = params.rating;
    if (params.onlyDeleted) {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items: items as unknown as ReviewWithUser[],
      total,
      page,
      limit,
    };
  }

  /**
   * 课程评分分布(给 courses.service 在 getOne 里 include)
   * 返回:total, avg, counts(1-5 整数), percentages(0-100 整数)
   */
  async getDistribution(courseId: string): Promise<RatingDistribution> {
    const grouped = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { courseId, deletedAt: null },
      _count: { _all: true },
    });

    const counts: { 1: number; 2: number; 3: number; 4: number; 5: number } = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let total = 0;
    let sum = 0;
    for (const g of grouped) {
      const c = g._count._all;
      counts[g.rating as 1 | 2 | 3 | 4 | 5] = c;
      total += c;
      sum += g.rating * c;
    }

    const avg = total === 0 ? 0 : Math.round((sum / total) * 10) / 10;
    const percentages: { 1: number; 2: number; 3: number; 4: number; 5: number } = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    if (total > 0) {
      for (const k of [1, 2, 3, 4, 5] as const) {
        percentages[k] = Math.round((counts[k] / total) * 100);
      }
    }

    return { total, avg, counts, percentages };
  }
}
