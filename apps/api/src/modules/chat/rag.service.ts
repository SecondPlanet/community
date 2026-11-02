import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { tokenize } from './rag.util';
import { PUBLIC_COURSE_WHERE } from '../../common/course-access/course-access-policy.service';

export type SourceType = 'course' | 'degree' | 'hackathon' | 'site' | 'lesson';

export interface RagSource {
  type: SourceType;
  id: string;
  title: string;
  url: string;
}

export interface RagHit {
  type: SourceType;
  id: string;
  title: string;
  description: string;
  url: string;
  hitCount: number;
}

/**
 * RAG 检索: 跨 Course / NanoDegree / Hackathon / SiteSetting 做关键词匹配.
 * 不引入 vector DB, 纯 Prisma `contains` (MySQL 8 默认 collation 是 case-insensitive).
 *
 * 入参: 用户原始问题
 * 出参: 去重排序后的 top N 条命中, 供 chat.service 拼 context block.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly webBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.webBase = this.config.get<string>('WEB_BASE_URL') ?? '';
  }

  async retrieve(
    query: string,
    topN = 8,
    // v1.9-alpha.2 (C-01): 课程会话带 lessonId/courseId 上下文, RAG 检索
    // 优先匹配该课时的 content, 再退到全站课程/学位/黑客松/站内设置。
    scope?: { lessonId?: string | null; courseId?: string | null },
  ): Promise<RagHit[]> {
    const tokens = tokenize(query);

    // v1.9-alpha.2 (C-01 Claude acceptance): 空 token(例: 学生问 "讲?" / 单字)
    // 时仍要跑 searchLessonScope — pinned lesson 不依赖 token 匹配, 它的内容是
    // 学生正在学的课时, prompt rule3 让 LLM 优先用 context[1]。原版早退会让
    // 课程会话空 token 时 LLM 看到"(无相关 context)", pinned lesson 丢失。
    const results = await Promise.allSettled([
      tokens.length > 0 ? this.searchCourses(tokens) : Promise.resolve([] as RagHit[]),
      tokens.length > 0 ? this.searchDegrees(tokens) : Promise.resolve([] as RagHit[]),
      tokens.length > 0 ? this.searchHackathons(tokens) : Promise.resolve([] as RagHit[]),
      tokens.length > 0 ? this.searchBrand(tokens) : Promise.resolve([] as RagHit[]),
      // searchLessonScope 内部对空 tokens 自带保护(siblings 需要 token, pinned 不需要)
      scope?.lessonId ? this.searchLessonScope(tokens, scope) : Promise.resolve([] as RagHit[]),
    ]);
    const courses = results[0].status === 'fulfilled' ? results[0].value : [];
    const degrees = results[1].status === 'fulfilled' ? results[1].value : [];
    const hackathons = results[2].status === 'fulfilled' ? results[2].value : [];
    const brandHits = results[3].status === 'fulfilled' ? results[3].value : [];
    const scopedHits = results[4].status === 'fulfilled' ? results[4].value : [];

    // 任何 source 失败要 log, 排查时知道是哪个表挂了
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const labels = ['courses', 'degrees', 'hackathons', 'brand', 'lessonScope'];
        this.logger.error(
          `RAG source[${i}] (${labels[i]}) failed`,
          (results[i] as PromiseRejectedResult).reason,
        );
      }
    }

    // 2) 全局结果按 hitCount 降序, 同分按 title 字典序稳定排
    const merged: RagHit[] = [...courses, ...degrees, ...hackathons, ...brandHits];
    merged.sort((a, b) => {
      if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
      return a.title.localeCompare(b.title);
    });

    // 3) 全局去重 (同 type+id)
    const seen = new Set<string>();
    const globalOut: RagHit[] = [];
    for (const h of merged) {
      const key = `${h.type}:${h.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      globalOut.push(h);
      if (globalOut.length >= topN) break;
    }

    // v1.9-alpha.2 (C-01): 课时上下文命中排在最前(scopedHits 已由
    // searchLessonScope 内部排序: pinned lesson 在前, 兄弟课时按 hitCount 降序),
    // 再补全站结果到 topN 上限。无 scope 时 scopedHits = [], 行为完全等同于
    // 旧版本(只是多了个空数组 push)。
    const out: RagHit[] = [];
    for (const h of scopedHits) {
      const key = `${h.type}:${h.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h);
      if (out.length >= topN) break;
    }
    for (const h of globalOut) {
      if (out.length >= topN) break;
      out.push(h);
    }
    return out;
  }

  /**
   * v1.9-alpha.2 (C-01): 课时上下文检索。
   * 1) 当前课时永远置顶(零 token 匹配也带上), snippet 用 LessonContent.summary
   *    优先, 退到 Lesson.description。
   * 2) 同课程下其他课时按 title/description token 匹配排序, 最多 10 条。
   * 失败(lesson 已删 / 课程未发布 / DB 抛错)由 retrieve() 顶层 allSettled 兜底,
   * 这里只负责安全地返回降级结果。
   */
  private async searchLessonScope(tokens: string[], scope: { lessonId?: string | null; courseId?: string | null }): Promise<RagHit[]> {
    if (!scope.lessonId) return [];
    const lesson = await this.prisma.lesson.findFirst({
      // v1.9-alpha.2 (batch-5a P3-#2): 跳过隐藏课时, 防止 isHidden 课时的
      // summary/description 进入 RAG 上下文。同 batch-4 安全收尾。
      where: { id: scope.lessonId, deletedAt: null, isHidden: false },
      select: {
        id: true,
        title: true,
        description: true,
        chapter: { select: { courseId: true } },
        content: { select: { summary: true } },
      },
    });
    if (!lesson) return [];
    // v1.9-alpha.2 (batch-5a P3-b + Claude acceptance S3/m2): Lesson.chapter 是
    // required 关系, chapter.courseId 永远存在; 不留 fallback, 防止类型放宽后
    // Prisma 静默丢掉 chapter 过滤。
    const courseId = lesson.chapter.courseId;
    const snippet = lesson.content?.summary ?? lesson.description ?? '';
    const lessonUrl = `${this.webBase}/dashboard/learning/${courseId}/lessons/${lesson.id}`;
    // v1.9-alpha.2 (C-01 Claude acceptance): hitCount 用 Number.MAX_SAFE_INTEGER
    // 是防御性写法 — merge 顺序已把 pinned 锁在 index 0, 这里数值不会被比较。
    // 保留高值是为了与 hitCount: 0 / 1 / 2 等普通命中区分, 万一未来有人在
    // scopedHits 之外用 hitCount 排序, pinned 仍然优先。
    const pinned: RagHit = {
      type: 'lesson' as const,
      id: lesson.id,
      title: lesson.title,
      description: snippet,
      url: lessonUrl,
      hitCount: Number.MAX_SAFE_INTEGER,
    };

    // 兄弟课时: 同课程下其他课时按 token 命中排序(不含 pinned 自身)。
    const siblingWhere = this.buildOrWhere(['title', 'description'], tokens);
    const siblings = siblingWhere
      ? await this.prisma.lesson.findMany({
          where: {
            ...siblingWhere,
            id: { not: lesson.id },
            // v1.9-alpha.2 (batch-5a P3-#2): 兄弟课时同样过滤 isHidden/deleted。
            isHidden: false,
            deletedAt: null,
            // v1.9-alpha.2 (batch-5a Claude acceptance S3): courseId 由上方
            // lesson.chapter.courseId 提供, 必填。无需三元。
            chapter: { courseId },
          },
          select: { id: true, title: true, description: true },
          take: 10,
        })
      : [];
    const siblingHits: RagHit[] = siblings
      .map((r) => {
        const hitCount = tokens.reduce(
          (acc, t) => acc + this.countHit({ title: r.title, description: r.description ?? '' }, t),
          0,
        );
        return {
          type: 'lesson' as const,
          id: r.id,
          title: r.title,
          description: r.description ?? '',
          // v1.9-alpha.2 (batch-5a P3-b): sibling URL 与 pinned 一致模板;
          // courseId 来自上方 lesson.chapter.courseId(必填)。
          url: `${this.webBase}/dashboard/learning/${courseId}/lessons/${r.id}`,
          hitCount,
        };
      })
      .filter((r) => r.hitCount > 0)
      .sort((a, b) => b.hitCount - a.hitCount);
    return [pinned, ...siblingHits];
  }

  /**
   * 单 token 命中计数: title > description > tags. 用于排序.
   */
  private countHit(hit: { title: string; description: string; tags?: string }, token: string): number {
    const t = token.toLowerCase();
    let n = 0;
    if (hit.title.toLowerCase().includes(t)) n += 3;
    if (hit.description.toLowerCase().includes(t)) n += 1;
    if (hit.tags && hit.tags.toLowerCase().includes(t)) n += 2;
    return n;
  }

  private async searchCourses(tokens: string[]): Promise<RagHit[]> {
    const where = this.buildOrWhere(['title', 'description', 'tags'], tokens);
    if (!where) return [];
    const rows = await this.prisma.course.findMany({
      where: { ...where, ...PUBLIC_COURSE_WHERE },
      select: { id: true, title: true, description: true, tags: true },
      take: 20,
    });
    return rows
      .map((r) => {
        const hitCount = tokens.reduce((acc, t) => acc + this.countHit(r, t), 0);
        return {
          type: 'course' as const,
          id: r.id,
          title: r.title,
          description: r.description,
          url: `${this.webBase}/courses/${r.id}`,
          hitCount,
        };
      })
      .filter((r) => r.hitCount > 0);
  }

  private async searchDegrees(tokens: string[]): Promise<RagHit[]> {
    const where = this.buildOrWhere(['title', 'description', 'learningPoints'], tokens);
    if (!where) return [];
    const rows = await this.prisma.nanoDegree.findMany({
      where: { ...where, status: 'published' },
      select: { id: true, title: true, description: true, learningPoints: true },
      take: 20,
    });
    return rows
      .map((r) => {
        const hitCount = tokens.reduce((acc, t) => acc + this.countHit({ ...r, tags: r.learningPoints }, t), 0);
        return {
          type: 'degree' as const,
          id: r.id,
          title: r.title,
          description: r.description,
          url: `${this.webBase}/degrees/${r.id}`,
          hitCount,
        };
      })
      .filter((r) => r.hitCount > 0);
  }

  private async searchHackathons(tokens: string[]): Promise<RagHit[]> {
    const where = this.buildOrWhere(['title', 'description', 'prizes'], tokens);
    if (!where) return [];
    const rows = await this.prisma.hackathon.findMany({
      // P0 (verifier audit 2026-07-24): HackathonStatus 是 upcoming/active/judging/finished/cancelled
      // 排除 cancelled (无意义) + finished (历史结束, 不再面向新用户)
      where: { ...where, status: { in: ['upcoming', 'active', 'judging'] } },
      select: { id: true, title: true, description: true, prizes: true },
      take: 20,
    });
    return rows
      .map((r) => {
        const hitCount = tokens.reduce((acc, t) => acc + this.countHit({ ...r, tags: r.prizes ?? '' }, t), 0);
        return {
          type: 'hackathon' as const,
          id: r.id,
          title: r.title,
          description: r.description,
          url: `${this.webBase}/hackathons/${r.id}`,
          hitCount,
        };
      })
      .filter((r) => r.hitCount > 0);
  }

  private async searchBrand(tokens: string[]): Promise<RagHit[]> {
    // SiteSetting + PageSetting 都是 key-value 配置, 拼成 brand/site context,
    // 只在 query 提到品牌 / 页面内容 (站点名 / 联系 / 关于 / 条款) 时才有效命中.
    //
    // P0 (verifier audit 2026-07-24): 之前只查 siteSetting, PageSetting 整张表漏;
    // 修复: 并发拉两表, 合并 hit, 跨 (type, key) 去重.
    const [siteSettings, pageSettings] = await Promise.all([
      this.prisma.siteSetting.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.pageSetting.findMany(),
    ]);

    const hits: RagHit[] = [];

    for (const k of siteSettings) {
      const valueStr = this.jsonToString(k.value);
      const text = `${k.key}: ${valueStr}`;
      const hitCount = tokens.reduce(
        (acc, t) => acc + (text.toLowerCase().includes(t.toLowerCase()) ? 1 : 0),
        0,
      );
      if (hitCount > 0) {
        hits.push({
          type: 'site' as const,
          id: k.key,
          title: k.key,
          description: valueStr.slice(0, 200),
          url: `${this.webBase}/`,
          hitCount,
        });
      }
    }

    for (const p of pageSettings) {
      const valueStr = this.jsonToString(p.value);
      const descStr = p.description ?? '';
      const text = `${p.page}.${p.key}: ${valueStr} ${descStr}`.trim();
      const hitCount = tokens.reduce(
        (acc, t) => acc + (text.toLowerCase().includes(t.toLowerCase()) ? 1 : 0),
        0,
      );
      if (hitCount > 0) {
        hits.push({
          type: 'site' as const,
          // 复合主键: page.key 唯一标识一条 PageSetting
          id: `${p.page}.${p.key}`,
          title: `${p.page} · ${p.key}`,
          description: valueStr.slice(0, 200),
          // PageSetting 按 page 归属, 落到首页 (跟 SiteSetting 一致)
          url: `${this.webBase}/`,
          hitCount,
        });
      }
    }

    return hits;
  }

  private jsonToString(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  private buildOrWhere(
    fields: string[],
    tokens: string[],
  ): Record<string, unknown> | null {
    const ors: Record<string, unknown>[] = [];
    for (const f of fields) {
      for (const t of tokens) {
        ors.push({ [f]: { contains: t } });
      }
    }
    return ors.length > 0 ? { OR: ors } : null;
  }
}
