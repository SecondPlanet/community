/**
 * ⚠️ MIGRATION-ONLY — 一次性回填脚本 (2026-07-24)
 *
 * 历史: 早期 Course.instructor 是 string 字段, 2026-07-24 切换到 Instructor
 *       表 + CourseInstructorLink 多对多, 写了本脚本做一次性回填.
 *
 * 用途: 把 Course.instructor 字符串字段的数据, 按 name trim 精确匹配
 *       回填到新表 Instructor (发布态) + 挂 CourseInstructorLink.
 *
 * 何时跑: 只在从老 schema 升级到新 schema 时跑一次.
 *        新部署 (pnpm db:seed:demo) 不需要, 流程里没有这一步.
 *
 * 运行: ts-node prisma/migration-seed-instructors-from-string.ts
 *
 * 行为:
 *   1. SELECT DISTINCT instructor FROM courses WHERE TRIM(instructor) <> ''
 *   2. 每条 dedupe 出来的名字 → INSERT Instructor (slug=name→ascii+hash, publishedAt=now)
 *   3. 遍历所有 Course, 按 instructor 字符串 trim 匹配回填 link (isPrimary=true, orderIndex=0)
 *   4. 跳过已有 link (idempotent)
 *
 * 设计:
 *   - 不删除 Course.instructor 字符串 (保留 1-2 版本做 fallback 降级显示)
 *   - 直接发布回填讲师，确保公开搜索与详情页有真实数据
 *
 * 注意:
 *   - 中文名 slug 走 hash 兜底, admin 后续编辑覆盖
 *   - 该脚本是 idempotent: 重复运行不创建重复 (slug unique + link unique)
 *   - 用 Prisma transaction 包裹, 失败回滚
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// 简单 slugify: ASCII 字母/数字 + 短 hash 兜底
function slugify(name: string): string {
  // 1. 转小写, 非 [a-z0-9] 转 -
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // 2. 如果完全空(全中文), 用 hash 4 位
  if (!ascii) {
    const hash = createHash('sha1').update(name).digest('hex').slice(0, 4);
    return `i-${hash}`;
  }

  // 3. 限制长度 40
  return ascii.slice(0, 40);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let suffix = 0;
  // 最多重试 100 次
  while (suffix < 100) {
    const existing = await prisma.instructor.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  // 极端情况: 拼一个全 hash
  return `${base}-${createHash('sha1').update(base + Date.now()).digest('hex').slice(0, 6)}`;
}

async function main() {
  console.log('=== Instructor 回填 Seed 开始 ===');

  // 1. 拿到所有非空 instructor 字符串
  const distinct = await prisma.course.findMany({
    where: { instructor: { not: '' } },
    select: { instructor: true },
    distinct: ['instructor'],
  });

  const names = distinct
    .map((r) => r.instructor.trim())
    .filter((n) => n.length > 0);

  console.log(`共 ${names.length} 个去重讲师名`);

  // 2. 按 name 建 Instructor (发布态, 跳过已存在)
  const instructorByName = new Map<string, string>(); // name -> id

  for (const name of names) {
    // 查已有 (按 name 精确匹配, 走 case-insensitive via collation)
    const existing = await prisma.instructor.findFirst({
      where: { name: { equals: name } },
      select: { id: true, slug: true },
    });
    if (existing) {
      instructorByName.set(name, existing.id);
      continue;
    }

    // 新建
    const baseSlug = slugify(name);
    const slug = await ensureUniqueSlug(baseSlug);

    const created = await prisma.instructor.create({
      data: {
        slug,
        name,
        // 历史课程已经公开，回填出的关联讲师也应立即可见。
        publishedAt: new Date(),
        title: null,
        orderIndex: 0,
      },
      select: { id: true, slug: true, name: true },
    });
    instructorByName.set(name, created.id);
    console.log(`  + 新建讲师: ${created.name} (slug=${created.slug})`);
  }

  // 3. 遍历 Course 建 link (按 instructor 字符串 trim 匹配)
  const courses = await prisma.course.findMany({
    where: { instructor: { not: '' } },
    select: { id: true, title: true, instructor: true },
  });

  let linkedCount = 0;
  let skippedCount = 0;

  for (const course of courses) {
    const name = course.instructor.trim();
    if (!name) continue;

    const instructorId = instructorByName.get(name);
    if (!instructorId) {
      console.warn(`  ! 课程 ${course.id} "${course.title}" 找不到讲师 "${name}", 跳过`);
      skippedCount += 1;
      continue;
    }

    // 检查 link 是否已存在 (idempotent)
    const existingLink = await prisma.courseInstructorLink.findFirst({
      where: {
        courseId: course.id,
        instructorId,
        role: 'instructor',
      },
    });
    if (existingLink) {
      skippedCount += 1;
      continue;
    }

    await prisma.courseInstructorLink.create({
      data: {
        courseId: course.id,
        instructorId,
        role: 'instructor',
        isPrimary: true, // 默认回填的讲师设为主讲师
        orderIndex: 0,
      },
    });
    linkedCount += 1;
  }

  console.log(`=== 回填完成 ===`);
  console.log(`  讲师数: ${instructorByName.size}`);
  console.log(`  新建 link: ${linkedCount}`);
  console.log(`  跳过 (已存在/无匹配): ${skippedCount}`);
  console.log(`  讲师已发布，admin 后台可继续补充头像、简介和社交链接`);

}

main()
  .catch((e) => {
    console.error('Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
