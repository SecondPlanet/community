/**
 * InstructorsService 单测 (2026-07-24)
 *
 * 覆盖:
 *   - slug 生成 (ASCII / hash 兜底 / 唯一性)
 *   - 软删 (publishedAt 清空 + 解链)
 *   - 课程挂载 (主讲师唯一性约束)
 *   - 整组同步 (diff 覆盖)
 *
 * 风格: jest mock prisma + 业务断言 (参考 resources.controller.spec.ts)
 */
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CourseInstructorRole } from '@prisma/client';
import { InstructorsService } from './instructors.service';

// 内部 prisma 桩 — 只需要用到的子集
const mockPrisma: any = {
  instructor: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  courseInstructorLink: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  instructorExpertise: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  course: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  // 事务 stub: 调用回调 fn(tx) 透传; 数组模式: 透传到 Promise.all
  $transaction: jest.fn((arg: any) => {
    if (typeof arg === 'function') {
      // async (tx) => Promise 模式
      return arg(mockPrisma);
    }
    // 数组模式: 调用每个 promise, 用 mockPrisma 作为执行器
    return Promise.all(arg.map((p: any) => p));
  }),
};

describe('InstructorsService', () => {
  let service: InstructorsService;

  beforeEach(() => {
    // 用 mockReset 清掉: calls + results + instances + once queue + implementation
    // 这样每个 it 都有干净的 mock, 不会受前一个测试的 mockResolvedValueOnce 干扰
    Object.values(mockPrisma).forEach((model: any) => {
      if (typeof model === 'object' && model !== null) {
        Object.values(model).forEach((fn: any) => {
          if (typeof fn?.mockReset === 'function') fn.mockReset();
        });
      }
    });
    mockPrisma.$transaction.mockReset();
    mockPrisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(mockPrisma);
      return Promise.all(arg.map((p: any) => p));
    });
    service = new InstructorsService(
      mockPrisma as unknown as any,
    );
  });

  // =============================================================
  // slugify / ensureUniqueSlug (走 create 路径间接测)
  // =============================================================

  describe('slug 生成 (通过 create 路径)', () => {
    it('中文 name → 自动生成 hash slug (i-xxxx 形式)', async () => {
      mockPrisma.instructor.findUnique.mockResolvedValueOnce(null); // slug 唯一
      mockPrisma.instructor.create.mockResolvedValueOnce({
        id: 'i1',
        slug: 'i-abc1',
        name: '张明',
      });

      await service.create({
        name: '张明',
        // 不传 slug
        // 不传 expertiseIds, 所以 prisma.instructor.create 不会调 expertiseLinks
      });

      expect(mockPrisma.instructor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: expect.stringMatching(/^i-[a-f0-9]{4}$/),
            name: '张明',
          }),
        }),
      );
    });

    it('英文 name → slug 转小写 + 空格转 -', async () => {
      mockPrisma.instructor.findUnique.mockResolvedValueOnce(null);
      mockPrisma.instructor.create.mockResolvedValueOnce({ id: 'i1' });

      await service.create({ name: 'John Smith 2' });

      expect(mockPrisma.instructor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'john-smith-2',
          }),
        }),
      );
    });

    it('admin 显式指定 slug → 校验唯一, 冲突抛 ConflictException', async () => {
      mockPrisma.instructor.findUnique.mockResolvedValueOnce({ id: 'other' });

      await expect(
        service.create({ name: '张三', slug: 'taken-slug' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =============================================================
  // softDelete
  // =============================================================

  describe('softDelete', () => {
    it('讲师存在 → 解除所有 link + 置草稿', async () => {
      mockPrisma.instructor.findUnique.mockResolvedValueOnce({ id: 'i1', name: '张明' });
      // $transaction 数组模式
      mockPrisma.courseInstructorLink.deleteMany.mockResolvedValueOnce({ count: 3 });
      mockPrisma.instructor.update.mockResolvedValueOnce({
        id: 'i1',
        publishedAt: null,
      });

      await service.softDelete('i1');

      expect(mockPrisma.courseInstructorLink.deleteMany).toHaveBeenCalledWith({
        where: { instructorId: 'i1' },
      });
      expect(mockPrisma.instructor.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { publishedAt: null },
        include: expect.anything(),
      });
});

    it('讲师不存在 → NotFoundException', async () => {
      mockPrisma.instructor.findUnique.mockResolvedValueOnce(null);
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =============================================================
  // linkToCourse
  // =============================================================

  describe('linkToCourse', () => {
    it('role=mentor → isPrimary 强制 false', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      mockPrisma.instructor.findUnique.mockResolvedValueOnce({ id: 'i1' });
      mockPrisma.courseInstructorLink.updateMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.courseInstructorLink.upsert.mockResolvedValueOnce({ id: 'l1' });

      await service.linkToCourse('c1', {
        instructorId: 'i1',
        role: CourseInstructorRole.mentor,
        isPrimary: true, // 试图设主, 应该被强制 false
      });

      expect(mockPrisma.courseInstructorLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isPrimary: false }),
        }),
      );
    });

    it('role=instructor + isPrimary=true → 把同 course 同 role 旧主讲师取消', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      mockPrisma.instructor.findUnique.mockResolvedValueOnce({ id: 'i1', name: '张明' });
      mockPrisma.courseInstructorLink.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.courseInstructorLink.upsert.mockResolvedValueOnce({ id: 'l1' });

      await service.linkToCourse('c1', {
        instructorId: 'i1',
        role: CourseInstructorRole.instructor,
        isPrimary: true,
      });

      expect(mockPrisma.courseInstructorLink.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            courseId: 'c1',
            role: 'instructor',
            isPrimary: true,
            NOT: { instructorId: 'i1' },
          }),
          data: { isPrimary: false },
        }),
      );
      expect(mockPrisma.course.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { instructor: '张明' },
      });
    });

    it('课程不存在 → NotFoundException', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.linkToCourse('missing', {
          instructorId: 'i1',
          role: CourseInstructorRole.instructor,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('讲师不存在 → NotFoundException', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      mockPrisma.instructor.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.linkToCourse('c1', {
          instructorId: 'missing',
          role: CourseInstructorRole.instructor,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =============================================================
  // syncCourseLinks
  // =============================================================

  describe('syncCourseLinks', () => {
    it('提交 2 个 link (1 instructor + 1 mentor) → 删旧建新', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      mockPrisma.instructor.findMany.mockResolvedValueOnce([
        { id: 'i1' },
        { id: 'i2' },
      ]);
      mockPrisma.courseInstructorLink.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.courseInstructorLink.create
        .mockResolvedValueOnce({ id: 'l1', role: 'instructor' })
        .mockResolvedValueOnce({ id: 'l2', role: 'mentor' });

      await service.syncCourseLinks('c1', {
        links: [
          { instructorId: 'i1', role: CourseInstructorRole.instructor, isPrimary: true },
          { instructorId: 'i2', role: CourseInstructorRole.mentor },
        ],
      });

      expect(mockPrisma.courseInstructorLink.deleteMany).toHaveBeenCalledWith({
        where: { courseId: 'c1' },
      });
      expect(mockPrisma.courseInstructorLink.create).toHaveBeenCalledTimes(2);
    });

    it('mentor link 强制 isPrimary=false (即使提交 isPrimary=true)', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      mockPrisma.instructor.findMany.mockResolvedValueOnce([{ id: 'i1' }]);
      mockPrisma.courseInstructorLink.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.courseInstructorLink.create.mockResolvedValueOnce({ id: 'l1' });

      await service.syncCourseLinks('c1', {
        links: [
          { instructorId: 'i1', role: CourseInstructorRole.mentor, isPrimary: true },
        ],
      });

      expect(mockPrisma.courseInstructorLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPrimary: false }),
        }),
      );
    });

    it('多个主讲师 (同 role instructor) → 抛 BadRequestException', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      mockPrisma.instructor.findMany.mockResolvedValueOnce([{ id: 'i1' }, { id: 'i2' }]);

      await expect(
        service.syncCourseLinks('c1', {
          links: [
            { instructorId: 'i1', role: CourseInstructorRole.instructor, isPrimary: true },
            { instructorId: 'i2', role: CourseInstructorRole.instructor, isPrimary: true },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('部分 instructorId 不存在 → 抛 BadRequestException', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      // 只找到 i1, i2 不存在
      mockPrisma.instructor.findMany.mockResolvedValueOnce([{ id: 'i1' }]);

      await expect(
        service.syncCourseLinks('c1', {
          links: [
            { instructorId: 'i1', role: CourseInstructorRole.instructor },
            { instructorId: 'i2', role: CourseInstructorRole.mentor },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('空数组 → 清空所有 link', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      mockPrisma.instructor.findMany.mockResolvedValueOnce([]);
      mockPrisma.courseInstructorLink.deleteMany.mockResolvedValueOnce({ count: 5 });

      const result = await service.syncCourseLinks('c1', { links: [] });

      expect(mockPrisma.courseInstructorLink.deleteMany).toHaveBeenCalled();
      expect(result.links).toEqual([]);
    });
  });

  // =============================================================
  // reorder
  // =============================================================

  describe('reorder', () => {
    it('提交 3 个 ID → 事务内按位置赋值 orderIndex', async () => {
      // mockReset 已清掉 implementation; 设新的
      mockPrisma.instructor.findMany.mockImplementation(() =>
        Promise.resolve([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      );
      mockPrisma.instructor.update.mockImplementation(() =>
        Promise.resolve({ id: 'x', orderIndex: 0 }),
      );

      const result = await service.reorder({ orderedIds: ['a', 'b', 'c'] });

      expect(result.reordered).toBe(3);
      expect(mockPrisma.instructor.update).toHaveBeenCalledTimes(3);
      expect(mockPrisma.instructor.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'a' },
        data: { orderIndex: 0 },
      });
      expect(mockPrisma.instructor.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'c' },
        data: { orderIndex: 2 },
      });
    });

    it('部分 ID 缺失 → BadRequestException', async () => {
      mockPrisma.instructor.findMany.mockResolvedValueOnce([{ id: 'a' }]);

      await expect(
        service.reorder({ orderedIds: ['a', 'missing'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =============================================================
  // findAllExpertises / createExpertise / updateExpertise / deleteExpertise
  // (2026-08-04 补: 覆盖 admin 专长管理 UI 调用链)
  // =============================================================

  describe('Expertise CRUD', () => {
    it('findAllExpertises → 返回按 isActive desc + orderIndex asc 排序', async () => {
      const rows = [
        { id: 'e1', isActive: true, orderIndex: 0 },
        { id: 'e2', isActive: true, orderIndex: 1 },
      ];
      mockPrisma.instructorExpertise.findMany.mockResolvedValueOnce(rows);

      const result = await service.findAllExpertises();

      expect(result).toEqual(rows);
      expect(mockPrisma.instructorExpertise.findMany).toHaveBeenCalledWith({
        orderBy: [{ isActive: 'desc' }, { orderIndex: 'asc' }],
      });
    });

    it('createExpertise → 新 key → 成功', async () => {
      mockPrisma.instructorExpertise.findUnique.mockResolvedValueOnce(null);
      const created = {
        id: 'e1',
        key: 'devops',
        label: 'DevOps',
        isActive: true,
        orderIndex: 0,
      };
      mockPrisma.instructorExpertise.create.mockResolvedValueOnce(created);

      const result = await service.createExpertise({
        key: 'devops',
        label: 'DevOps',
        isActive: true,
        orderIndex: 0,
      });

      expect(result).toEqual(created);
});

    it('createExpertise → key 重复 → ConflictException', async () => {
      mockPrisma.instructorExpertise.findUnique.mockResolvedValueOnce({ id: 'e1' });

      await expect(
        service.createExpertise({ key: 'devops', label: 'DevOps' }),
      ).rejects.toThrow(ConflictException);
    });

    it('updateExpertise → id 不存在 → NotFoundException', async () => {
      mockPrisma.instructorExpertise.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateExpertise('missing', { label: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updateExpertise → 存在 → 更新 + 写 audit', async () => {
      mockPrisma.instructorExpertise.findUnique.mockResolvedValueOnce({ id: 'e1' });
      const updated = { id: 'e1', label: 'New', isActive: false };
      mockPrisma.instructorExpertise.update.mockResolvedValueOnce(updated);

      const result = await service.updateExpertise('e1', { label: 'New', isActive: false });

      expect(result).toEqual(updated);
    });

    it('deleteExpertise → 不存在 → NotFoundException', async () => {
      mockPrisma.instructorExpertise.findUnique.mockResolvedValueOnce(null);

      await expect(service.deleteExpertise('missing')).rejects.toThrow(NotFoundException);
    });

    it('deleteExpertise → 存在 → cascade 删除 + 写 audit', async () => {
      mockPrisma.instructorExpertise.findUnique.mockResolvedValueOnce({ id: 'e1' });
      mockPrisma.instructorExpertise.delete.mockResolvedValueOnce({ id: 'e1' });

      const result = await service.deleteExpertise('e1');

      expect(result).toEqual({ deleted: true, id: 'e1' });
      expect(mockPrisma.instructorExpertise.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    });
  });

  // =============================================================
  // findAll / findBySlug / findById (基础查询 + publishedOnly 行为)
  // =============================================================

  describe('findAll', () => {
    it('前台 publishedOnly → where 强制 publishedAt not null', async () => {
      mockPrisma.instructor.findMany.mockResolvedValueOnce([]);
      mockPrisma.instructor.count.mockResolvedValueOnce(0);

      await service.findAll({ page: 1, limit: 10 }, { publishedOnly: true });

      expect(mockPrisma.instructor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ publishedAt: { not: null } }),
        }),
      );
    });

    it('按 expertiseIds 过滤 → where 含 expertiseLinks.some', async () => {
      mockPrisma.instructor.findMany.mockResolvedValueOnce([]);
      mockPrisma.instructor.count.mockResolvedValueOnce(0);

      await service.findAll(
        { expertiseIds: ['e1', 'e2'] } as any,
        { publishedOnly: true },
      );

      expect(mockPrisma.instructor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expertiseLinks: { some: { expertiseId: { in: ['e1', 'e2'] } } },
          }),
        }),
      );
    });
  });

  describe('listCourseLinks', () => {
    it('课程不存在 → NotFoundException', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce(null);

      await expect(service.listCourseLinks('c1')).rejects.toThrow(NotFoundException);
    });

    it('课程存在 → 返 link 列表 (按 role + orderIndex asc)', async () => {
      mockPrisma.course.findUnique.mockResolvedValueOnce({ id: 'c1' });
      const links = [
        { id: 'l1', role: 'instructor', isPrimary: true, orderIndex: 0, instructor: { id: 'i1', name: 'Sky' } },
        { id: 'l2', role: 'mentor', isPrimary: false, orderIndex: 0, instructor: { id: 'i2', name: 'Alice' } },
      ];
      mockPrisma.courseInstructorLink.findMany.mockResolvedValueOnce(links);

      const result = await service.listCourseLinks('c1');

      expect(result).toEqual(links);
      expect(mockPrisma.courseInstructorLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { courseId: 'c1' },
          orderBy: [{ role: 'asc' }, { orderIndex: 'asc' }],
        }),
      );
    });
  });
});
