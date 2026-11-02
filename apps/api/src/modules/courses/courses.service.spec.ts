import { CourseSort } from './courses.dto';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';
import { NotFoundException } from '@nestjs/common';

describe('CoursesService list metrics and sorting', () => {
  const prisma = {
    course: { findMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    enrollment: { findFirst: jest.fn(), count: jest.fn() },
    order: { count: jest.fn() },
  };
  const service = new CoursesService(
    prisma as unknown as PrismaService,
    new CourseAccessPolicyService(prisma as unknown as PrismaService),
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns real review/enrollment metrics and sorts by rating', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 'c1',
        createdAt: new Date('2026-01-01'),
        reviews: [{ rating: 3 }],
        _count: { enrollments: 10 },
      },
      {
        id: 'c2',
        createdAt: new Date('2026-01-02'),
        reviews: [{ rating: 5 }, { rating: 4 }],
        _count: { enrollments: 2 },
      },
    ]);

    const result = await service.findAll({ sort: CourseSort.rating });

    expect(result.map((course) => course.id)).toEqual(['c2', 'c1']);
    expect(result[0]).toEqual(
      expect.objectContaining({
        rating: 4.5,
        reviewCount: 2,
        enrollmentCount: 2,
      }),
    );
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'published', visibility: 'public' },
      }),
    );
  });

  it('sorts popularity by active enrollment count', async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: 'c1',
        createdAt: new Date('2026-01-02'),
        reviews: [],
        _count: { enrollments: 1 },
      },
      {
        id: 'c2',
        createdAt: new Date('2026-01-01'),
        reviews: [],
        _count: { enrollments: 9 },
      },
    ]);

    const result = await service.findAll({ sort: CourseSort.popular });
    expect(result.map((course) => course.id)).toEqual(['c2', 'c1']);
  });

  it('does not load chapter content for course listings', async () => {
    prisma.course.findMany.mockResolvedValue([]);
    await service.findAll({});
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.not.objectContaining({ chapters: expect.anything() }),
      }),
    );
  });

  it('redacts locked paid-course content without an active enrollment', async () => {
    prisma.course.findFirst.mockResolvedValue({
      id: 'paid-course',
      costType: 'paid',
      status: 'published',
      visibility: 'public',
      origin: 'platform',
      ownerUserId: null,
      chapters: [{
        id: 'chapter-1',
        lessons: [
          { id: 'lesson-1', isPreview: false, videoUrl: 'https://cdn.example/paid.mp4', resources: [{ id: 'r1', isLocked: true, url: 'https://cdn.example/paid.pdf' }] },
          { id: 'lesson-2', isPreview: true, videoUrl: 'https://cdn.example/preview.mp4', resources: [] },
        ],
      }],
    });
    prisma.enrollment.findFirst.mockResolvedValue(null);

    const result = await service.findOne('paid-course', { userId: 'user-1' });

    expect(result.chapters[0].lessons[0].videoUrl).toBeNull();
    expect(result.chapters[0].lessons[0].resources[0].url).toBe('');
    expect(result.chapters[0].lessons[1].videoUrl).toBe('https://cdn.example/preview.mp4');
  });

  it('returns full paid-course content for an active enrollment', async () => {
    const course = {
      id: 'paid-course',
      costType: 'paid',
      status: 'published',
      visibility: 'public',
      origin: 'platform',
      ownerUserId: null,
      chapters: [{ id: 'chapter-1', lessons: [{ id: 'lesson-1', isPreview: false, videoUrl: 'https://cdn.example/paid.mp4', resources: [] }] }],
    };
    prisma.course.findFirst.mockResolvedValue(course);
    prisma.enrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });

    await expect(service.findOne('paid-course', { userId: 'user-1' })).resolves.toBe(course);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1', courseId: 'paid-course', deletedAt: null }),
    }));
  });

  it('allows only owner/admin to view private personal course details', async () => {
    const course = {
      id: 'personal-course',
      costType: 'free',
      status: 'draft',
      visibility: 'private',
      origin: 'ai_personal',
      ownerUserId: 'owner',
      chapters: [],
    };
    prisma.course.findFirst.mockResolvedValue(course);

    await expect(
      service.findOne('personal-course', { userId: 'owner' }),
    ).resolves.toBe(course);
    await expect(
      service.findOne('personal-course', { userId: 'user-b' }),
    ).rejects.toThrow('Course not found');
    await expect(service.findOne('personal-course')).rejects.toThrow(
      'Course not found',
    );
    await expect(
      service.findOne('personal-course', { userId: 'admin', isAdmin: true }),
    ).resolves.toBe(course);
  });
});

describe('CoursesService delete guard', () => {
  const prisma = {
    course: { delete: jest.fn() },
    enrollment: { count: jest.fn() },
    order: { count: jest.fn() },
  };
  const service = new CoursesService(
    prisma as unknown as PrismaService,
    new CourseAccessPolicyService(prisma as unknown as PrismaService),
  );

  beforeEach(() => jest.clearAllMocks());

  it('refuses to hard-delete a course with enrollments or orders', async () => {
    prisma.enrollment.count.mockResolvedValue(3);
    prisma.order.count.mockResolvedValue(0);

    await expect(service.delete('c1')).rejects.toThrow('不能删除');
    expect(prisma.course.delete).not.toHaveBeenCalled();
  });

  it('hard-deletes a course with no learner data', async () => {
    prisma.enrollment.count.mockResolvedValue(0);
    prisma.order.count.mockResolvedValue(0);
    prisma.course.delete.mockResolvedValue({ id: 'c1' });

    await expect(service.delete('c1')).resolves.toEqual({ message: 'Course deleted' });
    expect(prisma.course.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});

// v1.9-alpha.2 (batch-7 A-05): 相似课程推荐
describe('CoursesService.findSimilarCourses (batch-7 A-05)', () => {
  const prisma: any = {
    course: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const service = new CoursesService(
    prisma as unknown as PrismaService,
    new CourseAccessPolicyService(prisma as unknown as PrismaService),
  );
  beforeEach(() => jest.clearAllMocks());

  it('源课程不存在 → NotFoundException', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    await expect(service.findSimilarCourses('bad')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('排除自身, 只返回 published + public 候选', async () => {
    prisma.course.findUnique.mockResolvedValue({ tags: 'rag,llm', categoryId: 'cat-1' });
    prisma.course.findMany.mockResolvedValue([
      {
        id: 'c-A',
        title: 'A',
        thumbnail: 't',
        level: 'beginner',
        tags: 'rag,llm,agent',
        category: { id: 'cat-1', key: 'ai', label: 'AI' },
        reviews: [{ rating: 5 }, { rating: 4 }],
      },
      {
        id: 'c-B',
        title: 'B',
        thumbnail: 't',
        level: 'beginner',
        tags: 'other,stuff',
        category: { id: 'cat-2', key: 'design', label: 'Design' },
        reviews: [],
      },
    ]);
    const result = await service.findSimilarCourses('source', 4);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'source' } }),
      }),
    );
    // A: 2 tag 交集 + 同 category + 评分 4.5 → score = 2*2 + 1 + 0.45 = 5.45
    // B: 0 交集 + 异 category → score 0 (被过滤)
    expect(result.map((r) => r.id)).toEqual(['c-A']);
  });

  it('无 tag/category 交集时退化为评分排序', async () => {
    prisma.course.findUnique.mockResolvedValue({ tags: '', categoryId: null });
    prisma.course.findMany.mockResolvedValue([
      {
        id: 'c-A',
        title: 'A',
        thumbnail: 't',
        level: 'beginner',
        tags: '',
        category: null,
        reviews: [{ rating: 3 }],
      },
      {
        id: 'c-B',
        title: 'B',
        thumbnail: 't',
        level: 'beginner',
        tags: '',
        category: null,
        reviews: [{ rating: 5 }, { rating: 5 }],
      },
    ]);
    const result = await service.findSimilarCourses('source', 4);
    expect(result[0].id).toBe('c-B');
    expect(result[0].ratingAvg).toBe(5);
    // 退化分支仍走相同打分公式: 0 tags + 0 category + 5 * 0.1 = 0.5
    expect(result[0].score).toBeCloseTo(0.5, 5);
  });

  it('limit 参数被 clamp 在 [1, 12]', async () => {
    prisma.course.findUnique.mockResolvedValue({ tags: '', categoryId: null });
    prisma.course.findMany.mockResolvedValue([]);
    await service.findSimilarCourses('source', 999); // clamp to 12
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 96 }), // 12 * 8
    );
    await service.findSimilarCourses('source', 0); // clamp to 1
    expect(prisma.course.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 8 }), // 1 * 8
    );
  });
});
