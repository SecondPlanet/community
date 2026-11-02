/**
 * RagService — v1.9-alpha.2 (C-01) lesson-scope RAG 检索测试
 *
 * 锁定:
 *  - 当前课时在零 token 匹配时也置顶;
 *  - 兄弟课时按 token 命中排序, 排在全站结果之前;
 *  - 无 scope 时行为完全等同旧版本;
 *  - 课时查询失败时全站检索仍返回(allSettled 兜底)。
 */
import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('RagService lesson-scope (C-01)', () => {
  let service: RagService;
  let prisma: any;
  const WEB = 'https://example.test';

  beforeEach(async () => {
    prisma = {
      course: { findMany: jest.fn().mockResolvedValue([]) },
      nanoDegree: { findMany: jest.fn().mockResolvedValue([]) },
      hackathon: { findMany: jest.fn().mockResolvedValue([]) },
      siteSetting: { findMany: jest.fn().mockResolvedValue([]) },
      pageSetting: { findMany: jest.fn().mockResolvedValue([]) },
      lesson: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => (key === 'WEB_BASE_URL' ? WEB : undefined)) } },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
  });

  it('lesson-scope: 当前课时零 token 匹配也置顶 (pinned first)', async () => {
    prisma.lesson.findFirst.mockResolvedValue({
      id: 'L1',
      title: '完全无关的课时',
      description: '与 query 没有共同词',
      chapter: { courseId: 'C1' },
      content: { summary: '本节介绍冷启动流程' },
    });
    prisma.lesson.findMany.mockResolvedValue([]);
    // 全站课程有一个真实命中
    prisma.course.findMany.mockResolvedValue([
      { id: 'C2', title: 'RAG 实战课', description: 'query 命中此处', tags: '' },
    ]);

    const hits = await service.retrieve('RAG 完全无关的课时', 8, { lessonId: 'L1', courseId: 'C1' });

    expect(hits[0]).toMatchObject({ type: 'lesson', id: 'L1' });
    expect(hits[0].description).toBe('本节介绍冷启动流程');
    expect(hits.some((h) => h.type === 'course' && h.id === 'C2')).toBe(true);
  });

  it('lesson-scope: 兄弟课时按 hitCount 排在全站命中之前', async () => {
    prisma.lesson.findFirst.mockResolvedValue({
      id: 'L1',
      title: 'pinned',
      description: 'pinned-desc',
      chapter: { courseId: 'C1' },
      content: { summary: null },
    });
    // 兄弟命中: title 含 "rag" +3, description 含 "rag" +1 = 4
    prisma.lesson.findMany.mockResolvedValue([
      { id: 'L2', title: 'RAG 兄弟课时 A', description: '介绍 rag 流程' },
      { id: 'L3', title: '普通兄弟', description: '不命中' },
    ]);
    // 全站课程命中: title "rag" +3
    prisma.course.findMany.mockResolvedValue([
      { id: 'C2', title: 'RAG 全站课程', description: 'x', tags: '' },
    ]);

    const hits = await service.retrieve('rag', 8, { lessonId: 'L1', courseId: 'C1' });

    // pinned lesson 排首
    expect(hits[0].type).toBe('lesson');
    expect(hits[0].id).toBe('L1');
    // 第二个是兄弟 L2 (hitCount=4), 而不是全站 C2 (hitCount=3)
    expect(hits[1]).toMatchObject({ type: 'lesson', id: 'L2' });
    // 全站 C2 排在兄弟之后
    const courseIdx = hits.findIndex((h) => h.type === 'course');
    const sibIdx = hits.findIndex((h) => h.type === 'lesson' && h.id === 'L2');
    expect(sibIdx).toBeLessThan(courseIdx);
  });

  it('lesson-scope: scope.lessonId 未传时不调用 lesson 查询, 行为等同旧版', async () => {
    prisma.course.findMany.mockResolvedValue([
      { id: 'C1', title: 'rag 实战', description: 'desc', tags: 'a' },
    ]);

    const hits = await service.retrieve('rag', 8, { courseId: 'C-IGNORED' });

    expect(prisma.lesson.findFirst).not.toHaveBeenCalled();
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'course', id: 'C1' });
  });

  it('lesson-scope: lesson 查询失败时全站检索仍正常返回 (allSettled 兜底)', async () => {
    prisma.lesson.findFirst.mockRejectedValue(new Error('db dead'));
    prisma.course.findMany.mockResolvedValue([
      { id: 'C1', title: 'rag 实战', description: 'desc', tags: '' },
    ]);

    const hits = await service.retrieve('rag', 8, { lessonId: 'L1', courseId: 'C1' });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'course', id: 'C1' });
  });

  // v1.9-alpha.2 (C-01 Claude acceptance): 空 token(例 "讲?") 不能让 pinned lesson 丢失
  it('lesson-scope: 空 token (单字) 仍返回 pinned lesson', async () => {
    prisma.lesson.findFirst.mockResolvedValue({
      id: 'L1',
      title: '本节介绍冷启动',
      description: 'desc',
      chapter: { courseId: 'C1' },
      content: { summary: '冷启动流程' },
    });
    prisma.lesson.findMany.mockResolvedValue([]);

    const hits = await service.retrieve('讲', 8, { lessonId: 'L1', courseId: 'C1' });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'lesson', id: 'L1' });
  });

  // v1.9-alpha.2 (batch-5a P3-#2): pinned lookup 与 sibling 都过滤 isHidden/deletedAt
  it('pinned 查询带 isHidden=false + deletedAt=null', async () => {
    prisma.lesson.findFirst.mockResolvedValue(null);
    await service.retrieve('rag', 8, { lessonId: 'L-HIDDEN', courseId: 'C1' });
    expect(prisma.lesson.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isHidden: false, deletedAt: null }),
      }),
    );
  });

  it('兄弟课时查询带 isHidden=false + deletedAt=null + 同课程过滤', async () => {
    prisma.lesson.findFirst.mockResolvedValue({
      id: 'L1',
      title: 'pinned',
      description: 'd',
      chapter: { courseId: 'C1' },
      content: { summary: null },
    });
    prisma.lesson.findMany.mockResolvedValue([]);
    await service.retrieve('rag', 8, { lessonId: 'L1', courseId: 'C1' });
    expect(prisma.lesson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'L1' },
          isHidden: false,
          deletedAt: null,
          chapter: { courseId: 'C1' },
        }),
      }),
    );
  });
});
