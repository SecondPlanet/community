/**
 * SitemapController — 动态生成 sitemap.xml (SEO)
 *
 * - GET /sitemap.xml
 *   列出所有 published course / published degree / 公开 hackathon
 *   + 静态页面 (home / courses / degrees / hackathons / enterprise / search)
 *
 * 不走 JwtAuthGuard. robots.txt 已声明 sitemap 位置.
 * 频率: 1 次/小时由 Google 爬虫触发, 不需要 cache (Prisma 查询 < 100ms)
 */
import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_COURSE_WHERE } from '../../common/course-access/course-access-policy.service';

@ApiExcludeController()
@Controller()
export class SitemapController {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly BASE_URL = (
    process.env.SITE_URL ||
    process.env.PUBLIC_URL ||
    'http://localhost'
  ).replace(/\/$/, '');

  @Get('sitemap.xml')
  async sitemap(@Res() res: Response) {
    const base = SitemapController.BASE_URL;

    const [courses, degrees, hackathons] = await Promise.all([
      this.prisma.course.findMany({
        where: PUBLIC_COURSE_WHERE,
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1000,
      }),
      this.prisma.nanoDegree.findMany({
        where: { status: 'published' },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      this.prisma.hackathon.findMany({
        where: { status: { in: ['upcoming', 'active', 'judging', 'finished'] } },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    ]);

    const staticPages = [
      { loc: '/', priority: 1.0, changefreq: 'daily' },
      { loc: '/courses', priority: 0.9, changefreq: 'daily' },
      { loc: '/degrees', priority: 0.9, changefreq: 'daily' },
      { loc: '/hackathons', priority: 0.9, changefreq: 'daily' },
      { loc: '/enterprise', priority: 0.8, changefreq: 'weekly' },
      { loc: '/search', priority: 0.5, changefreq: 'monthly' },
    ];

    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const urls: string[] = [];

    // 静态页
    for (const p of staticPages) {
      urls.push(
        `  <url><loc>${escape(base + p.loc)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`,
      );
    }

    // 课程
    for (const c of courses) {
      urls.push(
        `  <url><loc>${escape(`${base}/courses/${c.id}`)}</loc><lastmod>${c.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      );
    }

    // 学位
    for (const d of degrees) {
      urls.push(
        `  <url><loc>${escape(`${base}/degrees/${d.id}`)}</loc><lastmod>${d.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      );
    }

    // 黑客松
    for (const h of hackathons) {
      urls.push(
        `  <url><loc>${escape(`${base}/hackathons/${h.id}`)}</loc><lastmod>${h.updatedAt.toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`,
      );
    }

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.join('\n') +
      `\n</urlset>\n`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1h cache
    res.send(xml);
  }
}
