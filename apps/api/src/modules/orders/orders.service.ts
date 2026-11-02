import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderType, OrderStatus, CostType, PaymentMethod, UserRole } from '@prisma/client';
import { CreateOrderDto } from './orders.dto';
import { NotificationService } from '../notification/notification.service';
import { ProgressService } from '../progress/progress.service';
import {
  CourseAccessPolicyService,
  PUBLIC_COURSE_WHERE,
} from '../../common/course-access/course-access-policy.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly progressService: ProgressService,
    private readonly courseAccess: CourseAccessPolicyService,
  ) {}

  /**
   * 我的订单(返回完整 course/degree 摘要 + items, P1-8 起加大字段)
   */
  async findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        course: {
          select: { id: true, title: true, thumbnail: true, level: true, costType: true, price: true },
        },
        degree: {
          select: { id: true, title: true, thumbnail: true, costType: true, price: true },
        },
      },
      // P1-7 防御: max 100, 防 DoS
      take: 100,
    });
  }

  /**
   * 单订单详情, 校验 ownership。
   */
  async findOrderById(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        course: {
          select: { id: true, title: true, thumbnail: true, level: true, costType: true, price: true },
        },
        degree: {
          select: { id: true, title: true, thumbnail: true, costType: true, price: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) {
      // 防止 ID 枚举, 返 404 而不是 403
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async createOrder(userId: string, dto: CreateOrderDto, role?: UserRole) {
    let amount = 0;
    let costType: CostType;

    if (dto.type === OrderType.course) {
      if (!dto.courseId) throw new BadRequestException('courseId required');
      const course = await this.prisma.course.findUnique({
        where: { id: dto.courseId },
      });
      if (!course) throw new NotFoundException('Course not found');
      this.courseAccess.assertCanEnroll(course, { userId, role });
      costType = course.costType;

      // 已注册就直接返回
      const existing = await this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: dto.courseId } },
      });
      if (this.isEnrollmentActive(existing)) throw new ConflictException('Already enrolled');

      if (costType === CostType.free || costType === CostType.charity) {
        // 免费/公益课程直接注册
        const enrollment = await this.prisma.enrollment.upsert({
          where: { userId_courseId: { userId, courseId: dto.courseId } },
          update: {
            deletedAt: null,
            expiresAt: null,
            enrolledAt: new Date(),
            source: 'direct',
          },
          create: { userId, courseId: dto.courseId, source: 'direct' },
        });
        return { enrolled: true, enrollment };
      }

      amount = Number(course.price);
    } else if (dto.type === OrderType.degree) {
      if (!dto.degreeId) throw new BadRequestException('degreeId required');
      const degree = await this.prisma.nanoDegree.findUnique({
        where: { id: dto.degreeId, status: 'published' },
      });
      if (!degree) throw new NotFoundException('Degree not found');
      await this.assertDegreeCoursesPublic(this.prisma, dto.degreeId);
      costType = degree.costType;

      const existing = await this.prisma.enrollment.findUnique({
        where: { userId_degreeId: { userId, degreeId: dto.degreeId } },
      });
      if (this.isEnrollmentActive(existing)) throw new ConflictException('Already enrolled');

      if (costType === CostType.free || costType === CostType.charity) {
        const enrollment = await this.prisma.enrollment.upsert({
          where: { userId_degreeId: { userId, degreeId: dto.degreeId } },
          update: {
            deletedAt: null,
            expiresAt: null,
            enrolledAt: new Date(),
            source: 'direct',
          },
          create: { userId, degreeId: dto.degreeId, source: 'direct' },
        });
        // 报名学位同步报名底下所有课程
        await this.enrollAllDegreeCourses(userId, dto.degreeId);
        await this.progressService.issueDegreeCertificateIfCompleted(userId, dto.degreeId);
        return { enrolled: true, enrollment };
      }

      amount = Number(degree.price);
    } else {
      throw new BadRequestException('Invalid order type');
    }

    // 复用未支付订单: 同一用户对同一内容只保留一条 pending 订单,
    // 否则关弹窗重开会再建一张, 两张都可支付导致重复扣款。
    // ponytail: 并发双击仍可能各建一张(先查后建无锁), 需 DB 层部分唯一索引兜底
    const reusable = await this.prisma.order.findFirst({
      where: {
        userId,
        type: dto.type,
        courseId: dto.courseId ?? null,
        degreeId: dto.degreeId ?? null,
        status: OrderStatus.pending,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        course: { select: { id: true, title: true, thumbnail: true } },
        degree: { select: { id: true, title: true, thumbnail: true } },
      },
    });
    if (reusable) return { enrolled: false, order: reusable };

    const order = await this.prisma.order.create({
      data: {
        userId,
        type: dto.type,
        courseId: dto.courseId,
        degreeId: dto.degreeId,
        amount,
        currency: 'CNY',
        paymentMethod: dto.paymentMethod ?? null,
        status: OrderStatus.pending,
      },
      include: {
        course: { select: { id: true, title: true, thumbnail: true } },
        degree: { select: { id: true, title: true, thumbnail: true } },
      },
    });


    return { enrolled: false, order };
  }

  /**
   * Mock 支付：直接标记 paid 并创建 enrollment。
   * 真实接入时改为异步回调。
   *
   * 支付只负责解锁报名。课程/学位证书必须由真实学习完成度触发，
   * 不能把“已付款”伪装成“已完成”。
   */
  async mockPay(
    userId: string,
    orderId: string,
    paymentMethod?: PaymentMethod,
  ) {
    // Security: lock the order row first to fail fast on auth/status checks
    // without entering a transaction. The real write below is conditional
    // and atomic (updateMany with status guard + transaction).
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new NotFoundException('Order not found');
    if (existing.userId !== userId) throw new BadRequestException('Not your order');
    if (existing.status === OrderStatus.paid) {
      throw new ConflictException('Order already paid');
    }
    if (existing.status === OrderStatus.expired || existing.status === OrderStatus.refunded) {
      throw new BadRequestException('Order is no longer payable');
    }

    const transactionId = `mock_${this.randomTransactionId()}`;

    const paidOrder = await this.prisma.$transaction(async (tx) => {
      // Atomic conditional update: only flip from pending → paid. Two
      // concurrent pay requests cannot both succeed.
      const updateResult = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.pending },
        data: {
          status: OrderStatus.paid,
          paidAt: new Date(),
          // Prisma 只允许真实支付渠道枚举；mock 体现在 transactionId，
          // 不能写入一个 schema 不接受的 "mock" paymentMethod。
          paymentMethod: paymentMethod ?? existing.paymentMethod ?? PaymentMethod.alipay,
          transactionId,
        },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('Order already processed');
      }

      if (existing.type === OrderType.course && existing.courseId) {
        await tx.enrollment.upsert({
          where: {
            userId_courseId: {
              userId,
              courseId: existing.courseId,
            },
          },
          update: {
            deletedAt: null,
            expiresAt: null,
            enrolledAt: new Date(),
            source: 'order',
          },
          create: { userId, courseId: existing.courseId, source: 'order' },
        });
      } else if (existing.type === OrderType.degree && existing.degreeId) {
        await this.assertDegreeCoursesPublic(tx, existing.degreeId);
        await tx.enrollment.upsert({
          where: {
            userId_degreeId: {
              userId,
              degreeId: existing.degreeId,
            },
          },
          update: {
            deletedAt: null,
            expiresAt: null,
            enrolledAt: new Date(),
            source: 'order',
          },
          create: { userId, degreeId: existing.degreeId, source: 'order' },
        });
        await this.enrollAllDegreeCoursesTx(tx, userId, existing.degreeId);
      }

      return tx.order.findUnique({ where: { id: orderId } });
    });

    await this.notificationService.create({
      userId,
      type: 'order',
      title: '支付成功',
      body: '订单已支付成功，相关课程内容现已解锁。',
      linkUrl: `/dashboard/orders/${orderId}`,
    });
    if (existing.type === OrderType.degree && existing.degreeId) {
      await this.progressService.issueDegreeCertificateIfCompleted(userId, existing.degreeId);
    }

    return paidOrder;
  }

  private randomTransactionId(): string {
    // Security: replace Date.now() in transaction IDs with a random component
    // so they cannot be guessed / replayed.
    const { randomBytes } = require('crypto') as typeof import('crypto');
    return randomBytes(8).toString('hex');
  }

  async cancel(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new BadRequestException('Not your order');
    if (order.status === OrderStatus.paid) {
      throw new BadRequestException('Paid order cannot be cancelled');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.expired },
    });
    return updated;
  }

  /**
   * 申请退款 (P1-8 升级): 落地 USER_MANUAL §12.4 退款规则
   *
   * 规则(分订单类型):
   *   课程订单:
   *     - 未开始(0 ProgressRecord)              → 全额退
   *     - 已开始 < 7 天 + 进度 < 20%            → 95% 退(扣 5% 手续费)
   *     - 其他(已学 / 超 7 天 / 进度 ≥ 20%)    → 不支持
   *   学位订单:
   *     - 所有关联课程都没开始                  → 全额退
   *     - 任一课程已开始                        → 不支持
   *
   * 计算进度:已完成 lesson 数 / 课程总 lesson 数
   *
   * 真实流程在 P1-6 Stripe webhook 接入后改用 async refund。
   */
  async refundOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.paid) {
      throw new BadRequestException('Only paid orders can be refunded');
    }

    // 1) 校验规则
    const check = await this.checkRefundEligibility(userId, order);
    if (!check.allowed) {
      throw new BadRequestException(check.reason);
    }

    // 2) 计算退款金额(可能扣 5% 手续费)
    const fullAmount = Number(order.amount);
    const refundAmount = check.feeRate ? fullAmount * (1 - check.feeRate) : fullAmount;

    // 3) 原子更新订单状态并撤销该订单授予的访问权。
    const updated = await this.prisma.$transaction(async (tx) => {
      // 原子状态守卫: 仅 paid 可转 refunded。并发第二次退款会在此 updateMany 命中 0 行
      // 而被拒, 避免一条已付订单被重复走完退款路径。
      const claim = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.paid },
        data: { status: OrderStatus.refunded },
      });
      if (claim.count === 0) {
        throw new BadRequestException('订单状态已变化, 无法再次退款');
      }
      const result = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const revokedAt = new Date();
      if (order.type === OrderType.course && order.courseId) {
        await tx.enrollment.updateMany({
          where: { userId, courseId: order.courseId, source: 'order', deletedAt: null },
          data: { deletedAt: revokedAt },
        });
      } else if (order.type === OrderType.degree && order.degreeId) {
        await tx.enrollment.updateMany({
          where: { userId, degreeId: order.degreeId, source: 'order', deletedAt: null },
          data: { deletedAt: revokedAt },
        });
        const links = await tx.degreeCourse.findMany({
          where: { degreeId: order.degreeId },
          select: { courseId: true },
        });
        await tx.enrollment.updateMany({
          where: {
            userId,
            courseId: { in: links.map((link) => link.courseId) },
            source: 'degree',
            deletedAt: null,
          },
          data: { deletedAt: revokedAt },
        });
      }
      return result;
    });
    await this.notificationService.create({
      userId,
      type: 'order',
      title: '退款申请已完成',
      body: `订单退款已处理，退款金额 ¥${refundAmount.toFixed(2)}。`,
      linkUrl: `/dashboard/orders/${orderId}`,
    });
    return { ...updated, refundAmount };
  }

  /**
   * 校验退款资格(纯函数,可在退款按钮 disable 时调用)
   * 返回:
   *   - { allowed: true, feeRate?: 0 | 0.05 }  允许退,feeRate = 0 全退 / 0.05 扣手续费
   *   - { allowed: false, reason: string }     不允许
   */
  private async checkRefundEligibility(
    userId: string,
    order: { type: OrderType; courseId: string | null; degreeId: string | null; paidAt: Date | null },
  ): Promise<{ allowed: true; feeRate?: number } | { allowed: false; reason: string }> {
    // 兜底:没 paidAt 当作"刚支付",从现在算
    const paidAt = order.paidAt ?? new Date();
    const daysSincePaid = (Date.now() - paidAt.getTime()) / (1000 * 60 * 60 * 24);

    if (order.type === OrderType.course) {
      if (!order.courseId) {
        return { allowed: false, reason: '订单缺少课程 ID' };
      }
      // 计算课程进度
      const [completed, total] = await Promise.all([
        this.prisma.progressRecord.count({
          where: {
            userId,
            courseId: order.courseId,
            status: 'completed',
          },
        }),
        this.prisma.lesson.count({
          where: { chapter: { courseId: order.courseId } },
        }),
      ]);

      // 规则 1: 未开始
      if (completed === 0) {
        return { allowed: true, feeRate: 0 };
      }
      // 规则 2: 7 天内 + 进度 < 20%
      const progress = total > 0 ? completed / total : 0;
      if (daysSincePaid < 7 && progress < 0.2) {
        return { allowed: true, feeRate: 0.05 };
      }
      // 规则 3: 其他
      if (daysSincePaid >= 7) {
        return { allowed: false, reason: '已超过 7 天退款窗口,无法退款' };
      }
      return { allowed: false, reason: `学习进度 ${(progress * 100).toFixed(0)}% ≥ 20%,无法退款` };
    }

    if (order.type === OrderType.degree) {
      if (!order.degreeId) {
        return { allowed: false, reason: '订单缺少学位 ID' };
      }
      // 规则 4: 所有关联课程都未开始
      const links = await this.prisma.degreeCourse.findMany({
        where: { degreeId: order.degreeId },
        select: { courseId: true },
      });
      const courseIds = links.map((l) => l.courseId);
      if (courseIds.length === 0) {
        return { allowed: true, feeRate: 0 }; // 没关联课程,容许退
      }
      const startedCount = await this.prisma.progressRecord.count({
        where: {
          userId,
          courseId: { in: courseIds },
          status: { in: ['in_progress', 'completed'] },
        },
      });
      if (startedCount === 0) {
        return { allowed: true, feeRate: 0 };
      }
      return {
        allowed: false,
        reason: '学位关联课程中已有学习记录,学位不支持退款',
      };
    }

    return { allowed: false, reason: '不支持的订单类型' };
  }

  private async enrollAllDegreeCourses(userId: string, degreeId: string) {
    const links = await this.prisma.degreeCourse.findMany({
      where: { degreeId, course: PUBLIC_COURSE_WHERE },
      select: { courseId: true },
    });
    for (const link of links) {
      await this.prisma.enrollment.upsert({
        where: {
          userId_courseId: { userId, courseId: link.courseId },
        },
        update: {
          deletedAt: null,
          expiresAt: null,
          enrolledAt: new Date(),
          source: 'degree',
        },
        create: { userId, courseId: link.courseId, source: 'degree' },
      });
    }
  }

  // Transaction-bound variant of enrollAllDegreeCourses for atomic pay flow.
  private async enrollAllDegreeCoursesTx(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    userId: string,
    degreeId: string,
  ) {
    const links = await tx.degreeCourse.findMany({
      where: { degreeId, course: PUBLIC_COURSE_WHERE },
      select: { courseId: true },
    });
    for (const link of links) {
      await tx.enrollment.upsert({
        where: {
          userId_courseId: { userId, courseId: link.courseId },
        },
        update: {
          deletedAt: null,
          expiresAt: null,
          enrolledAt: new Date(),
          source: 'degree',
        },
        create: { userId, courseId: link.courseId, source: 'degree' },
      });
    }
  }

  private async assertDegreeCoursesPublic(
    client: Pick<PrismaService, 'degreeCourse'>,
    degreeId: string,
  ) {
    const [total, publicCount] = await Promise.all([
      client.degreeCourse.count({ where: { degreeId } }),
      client.degreeCourse.count({
        where: { degreeId, course: PUBLIC_COURSE_WHERE },
      }),
    ]);
    if (total !== publicCount) {
      throw new BadRequestException('Degree contains unavailable courses');
    }
  }

  private isEnrollmentActive(
    enrollment: { deletedAt?: Date | null; expiresAt?: Date | null } | null,
  ) {
    return !!enrollment
      && enrollment.deletedAt == null
      && (enrollment.expiresAt == null || enrollment.expiresAt > new Date());
  }
}
