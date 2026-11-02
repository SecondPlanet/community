import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ProgressService } from '../progress/progress.service';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';
import { OrderType, OrderStatus, CostType } from '@prisma/client';

// Mock PrismaService
const mockPrisma: any = {
  course: {
    findUnique: jest.fn(),
  },
  nanoDegree: {
    findUnique: jest.fn(),
  },
  enrollment: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  degreeCourse: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  progressRecord: {
    count: jest.fn(),
  },
  lesson: {
    count: jest.fn(),
  },
};
// $transaction receives a callback; run it against the same mockPrisma so
// conditional updateMany / upsert flows can be exercised.
mockPrisma.$transaction = jest.fn(async (cb: (tx: any) => any) => cb(mockPrisma));

const mockNotificationService = {
  create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
};
const mockProgressService = {
  issueDegreeCertificateIfCompleted: jest.fn().mockResolvedValue(null),
};
const mockCourseAccess = {
  assertCanEnroll: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset all mock implementations AND once-queues so tests don't leak state.
    mockPrisma.order.findUnique.mockReset();
    mockPrisma.order.create.mockReset();
    mockPrisma.order.update.mockReset();
    mockPrisma.order.updateMany.mockReset();
    mockPrisma.order.findMany.mockReset();
    mockPrisma.course.findUnique.mockReset();
    mockPrisma.nanoDegree.findUnique.mockReset();
    mockPrisma.enrollment.findUnique.mockReset();
    mockPrisma.enrollment.create.mockReset();
    mockPrisma.enrollment.upsert.mockReset();
    mockPrisma.enrollment.updateMany.mockReset();
    mockPrisma.degreeCourse.findMany.mockReset();
    mockPrisma.degreeCourse.count.mockReset().mockResolvedValue(0);
    mockPrisma.progressRecord.count.mockReset();
    mockPrisma.lesson.count.mockReset();
    mockNotificationService.create.mockClear();
    mockProgressService.issueDegreeCertificateIfCompleted.mockClear();
    mockProgressService.issueDegreeCertificateIfCompleted.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ProgressService, useValue: mockProgressService },
        { provide: CourseAccessPolicyService, useValue: mockCourseAccess },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('createOrder — free course (auto-enroll)', () => {
    it('should auto-enroll for free course', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.free,
        price: 0,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'e1', userId: 'u1', courseId: 'c1' });

      const result = await service.createOrder('u1', {
        type: OrderType.course,
        courseId: 'c1',
      });

      expect(result.enrolled).toBe(true);
      expect(mockCourseAccess.assertCanEnroll).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1', costType: CostType.free }),
        { userId: 'u1', role: undefined },
      );
      expect(mockPrisma.enrollment.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId_courseId: { userId: 'u1', courseId: 'c1' } },
        create: expect.objectContaining({ userId: 'u1', courseId: 'c1', source: 'direct' }),
      }));
    });

    it('should auto-enroll for charity course (same as free)', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.charity,
        price: 99,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'e1', userId: 'u1', courseId: 'c1' });

      const result = await service.createOrder('u1', {
        type: OrderType.course,
        courseId: 'c1',
      });

      expect(result.enrolled).toBe(true);
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if already enrolled', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.free,
        price: 0,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue({ id: 'e1' });

      await expect(
        service.createOrder('u1', { type: OrderType.course, courseId: 'c1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reactivate a soft-deleted free enrollment', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.free,
        price: 0,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 'e1',
        deletedAt: new Date(),
        expiresAt: null,
      });
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'e1', deletedAt: null });

      await expect(service.createOrder('u1', {
        type: OrderType.course,
        courseId: 'c1',
      })).resolves.toMatchObject({ enrolled: true });
      expect(mockPrisma.enrollment.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ deletedAt: null, expiresAt: null, source: 'direct' }),
      }));
    });

    it('should throw NotFoundException if course not found', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrder('u1', { type: OrderType.course, courseId: 'invalid' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if courseId missing for course order', async () => {
      await expect(
        service.createOrder('u1', { type: OrderType.course }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createOrder — free degree', () => {
    it('evaluates coursework completed before degree enrollment', async () => {
      mockPrisma.nanoDegree.findUnique.mockResolvedValue({
        id: 'd1',
        costType: CostType.free,
        price: 0,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'degree-enrollment' });
      mockPrisma.degreeCourse.findMany.mockResolvedValue([]);

      await expect(
        service.createOrder('u1', { type: OrderType.degree, degreeId: 'd1' }),
      ).resolves.toMatchObject({ enrolled: true });
      expect(mockProgressService.issueDegreeCertificateIfCompleted).toHaveBeenCalledWith(
        'u1',
        'd1',
      );
    });
  });

  describe('createOrder — paid course (create order)', () => {
    it('should create pending order for paid course', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.paid,
        price: 199,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      mockPrisma.order.create.mockResolvedValue({ id: 'o1', amount: 199, status: OrderStatus.pending });

      const result = await service.createOrder('u1', {
        type: OrderType.course,
        courseId: 'c1',
      });

      expect(result.enrolled).toBe(false);
      expect(result.order).toMatchObject({ id: 'o1', amount: 199, status: OrderStatus.pending });
    });

    it('should reuse existing pending order instead of creating a duplicate', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        costType: CostType.paid,
        price: 199,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      mockPrisma.order.findFirst.mockResolvedValue({ id: 'o0', amount: 199, status: OrderStatus.pending });

      const result = await service.createOrder('u1', {
        type: OrderType.course,
        courseId: 'c1',
      });

      expect(result.order).toMatchObject({ id: 'o0' });
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('mockPay', () => {
    it('should mark order as paid and create enrollment', async () => {
      mockPrisma.order.findUnique
        .mockResolvedValueOnce({
          id: 'o1',
          userId: 'u1',
          type: OrderType.course,
          courseId: 'c1',
          status: OrderStatus.pending,
          paymentMethod: null,
        })
        .mockResolvedValueOnce({
          id: 'o1',
          status: OrderStatus.paid,
        });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });

      const result = await service.mockPay('u1', 'o1', 'alipay');

      expect(result!.status).toBe(OrderStatus.paid);
      expect(mockPrisma.enrollment.upsert).toHaveBeenCalled();
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: 'order',
          title: '支付成功',
        }),
      );
    });

    it('should enroll a paid degree and evaluate already-completed coursework', async () => {
      mockPrisma.order.findUnique
        .mockResolvedValueOnce({
          id: 'o1',
          userId: 'u1',
          type: OrderType.degree,
          degreeId: 'd1',
          status: OrderStatus.pending,
          paymentMethod: null,
        })
        .mockResolvedValueOnce({
          id: 'o1',
          userId: 'u1',
          type: OrderType.degree,
          degreeId: 'd1',
          status: OrderStatus.paid,
        });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });
      mockPrisma.degreeCourse.findMany.mockResolvedValue([]);
      const result = await service.mockPay('u1', 'o1', 'alipay');

      expect(result).toMatchObject({ type: OrderType.degree, status: OrderStatus.paid });
      expect(mockPrisma.enrollment.upsert).toHaveBeenCalled();
      expect(mockProgressService.issueDegreeCertificateIfCompleted).toHaveBeenCalledWith(
        'u1',
        'd1',
      );
    });

    it('should throw NotFoundException if order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.mockPay('u1', 'invalid')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if not owner', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'other-user', status: OrderStatus.pending });

      await expect(service.mockPay('u1', 'o1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if already paid', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.paid,
      });

      await expect(service.mockPay('u1', 'o1')).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel', () => {
    it('should cancel pending order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.pending,
      });
      mockPrisma.order.update.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.expired,
      });

      const result = await service.cancel('u1', 'o1');
      expect(result.status).toBe(OrderStatus.expired);
    });

    it('should throw BadRequestException for paid order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        status: OrderStatus.paid,
      });

      await expect(service.cancel('u1', 'o1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('refundOrder', () => {
    it('should refund a paid order (未开始 → 全额退)', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        type: OrderType.course,
        courseId: 'c1',
        degreeId: null,
        amount: 199,
        paidAt: new Date(),
        status: OrderStatus.paid,
      });
      // 0 进度 = 未开始 → 全额退
      mockPrisma.progressRecord.count.mockResolvedValueOnce(0); // completed
      mockPrisma.lesson.count.mockResolvedValueOnce(10); // total
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.findUniqueOrThrow.mockResolvedValue({ id: 'o1', status: OrderStatus.refunded });

      const result = await service.refundOrder('u1', 'o1');
      expect(result.status).toBe(OrderStatus.refunded);
      expect(mockPrisma.enrollment.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', courseId: 'c1', source: 'order', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: 'order',
          title: '退款申请已完成',
        }),
      );
    });

    it('should throw BadRequestException for non-paid order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        type: OrderType.course,
        courseId: 'c1',
        amount: 199,
        paidAt: new Date(),
        status: OrderStatus.pending,
      });

      await expect(service.refundOrder('u1', 'o1')).rejects.toThrow(BadRequestException);
    });

    it('应拒绝进度 ≥ 20% 的退款', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        type: OrderType.course,
        courseId: 'c1',
        amount: 199,
        paidAt: new Date(),
        status: OrderStatus.paid,
      });
      // 3 / 10 = 30% 进度
      mockPrisma.progressRecord.count.mockResolvedValueOnce(3);
      mockPrisma.lesson.count.mockResolvedValueOnce(10);

      await expect(service.refundOrder('u1', 'o1')).rejects.toThrow(/进度 30% ≥ 20%/);
    });

    it('应拒绝超过 7 天的退款', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        type: OrderType.course,
        courseId: 'c1',
        amount: 199,
        paidAt: tenDaysAgo,
        status: OrderStatus.paid,
      });
      // 1 进度 = 已开始但 < 20%
      mockPrisma.progressRecord.count.mockResolvedValueOnce(1);
      mockPrisma.lesson.count.mockResolvedValueOnce(10);

      await expect(service.refundOrder('u1', 'o1')).rejects.toThrow(/超过 7 天/);
    });

    it('7 天内 + 进度 < 20% → 95% 退(扣 5% 手续费)', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        type: OrderType.course,
        courseId: 'c1',
        amount: 200,
        paidAt: new Date(),
        status: OrderStatus.paid,
      });
      mockPrisma.progressRecord.count.mockResolvedValueOnce(1);
      mockPrisma.lesson.count.mockResolvedValueOnce(10);
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.findUniqueOrThrow.mockResolvedValue({ id: 'o1', status: OrderStatus.refunded });

      const result = await service.refundOrder('u1', 'o1');
      expect(result.status).toBe(OrderStatus.refunded);
      // 200 * 0.95 = 190
      expect((result as any).refundAmount).toBe(190);
    });

    it('学位订单 — 所有课程未开始 → 全额退', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        type: OrderType.degree,
        courseId: null,
        degreeId: 'd1',
        amount: 999,
        paidAt: new Date(),
        status: OrderStatus.paid,
      });
      mockPrisma.degreeCourse.findMany.mockResolvedValue([{ courseId: 'c1' }, { courseId: 'c2' }]);
      mockPrisma.progressRecord.count.mockResolvedValueOnce(0); // 0 课程已开始
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.findUniqueOrThrow.mockResolvedValue({ id: 'o1', status: OrderStatus.refunded });

      const result = await service.refundOrder('u1', 'o1');
      expect(result.status).toBe(OrderStatus.refunded);
    });

    it('学位订单 — 任一课程已开始 → 拒绝', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'u1',
        type: OrderType.degree,
        courseId: null,
        degreeId: 'd1',
        amount: 999,
        paidAt: new Date(),
        status: OrderStatus.paid,
      });
      mockPrisma.degreeCourse.findMany.mockResolvedValueOnce([{ courseId: 'c1' }, { courseId: 'c2' }]);
      mockPrisma.progressRecord.count.mockResolvedValueOnce(1); // 有 1 课已开始

      await expect(service.refundOrder('u1', 'o1')).rejects.toThrow(/学位不支持退款/);
    });
  });

  describe('findOrderById', () => {
    it('should return order with full course/degree include', async () => {
      const fullOrder = {
        id: 'o1',
        userId: 'u1',
        type: OrderType.course,
        courseId: 'c1',
        status: OrderStatus.paid,
        course: { id: 'c1', title: 'C1', thumbnail: null, level: 'Beginner', costType: 'paid', price: 199 },
      };
      mockPrisma.order.findUnique.mockResolvedValue(fullOrder);

      const result = await service.findOrderById('u1', 'o1');
      expect(result).toMatchObject({ id: 'o1', userId: 'u1' });
    });

    it('should throw NotFoundException if not owner (anti-enumeration)', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'o1', userId: 'other' });
      await expect(service.findOrderById('u1', 'o1')).rejects.toThrow(NotFoundException);
    });
  });
});
