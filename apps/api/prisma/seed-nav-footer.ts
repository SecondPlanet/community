/**
 * seed-nav-footer.ts (2026-08-04)
 *
 * 把"讲师"加入 top-nav 和 footer 学习列
 * (idempotent: 重复跑不会重复插入)
 *
 * 运行:
 *   pnpm db:seed:nav-footer                  (单跑)
 *   pnpm db:seed:demo                       (走 master 流程)
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface FooterLinkEntry {
  label: string;
  path: string;
  orderIndex?: number;
}

async function main() {
  console.log('=== 导航/Footer 增强 ===');

  // 1. Top-nav: 在"课程"后面插入"讲师"
  const existingInstructorNav = await prisma.topNavItem.findFirst({ where: { path: '/instructors' } });
  if (existingInstructorNav) {
    console.log('  · 讲师 nav 已存在, 跳过');
  } else {
    const courses = await prisma.topNavItem.findFirst({ where: { path: '/courses' } });
    const orderStart = courses?.orderIndex ?? 0;
    await prisma.topNavItem.updateMany({
      where: { orderIndex: { gt: orderStart } },
      data: { orderIndex: { increment: 1 } },
    });
    await prisma.topNavItem.create({
      data: {
        label: '讲师',
        path: '/instructors',
        icon: 'Users',
        isActive: true,
        orderIndex: orderStart + 1,
      },
    });
    console.log('  ✓ Top-nav: 已插入"讲师"');
  }

  // 2. Footer 学习列: 在"课程"后面插入"讲师" (links 是 JSON 数组)
  const learnCol = await prisma.footerColumn.findFirst({ where: { title: '学习' } });
  if (!learnCol) {
    console.log('  ! Footer 学习列不存在, 跳过');
  } else {
    const links = (learnCol.links as Prisma.JsonArray) as unknown as FooterLinkEntry[];
    const hasInstructor = links.some((l) => l.path === '/instructors');
    if (hasInstructor) {
      console.log('  · Footer 学习列已含讲师, 跳过');
    } else {
      const idx = links.findIndex((l) => l.path === '/courses');
      const orderStart = idx >= 0 ? idx : 0;
      const newLinks = [...links];
      newLinks.splice(orderStart + 1, 0, { label: '讲师', path: '/instructors' });
      // 重新整理 orderIndex
      newLinks.forEach((l, i) => { l.orderIndex = i; });
      await prisma.footerColumn.update({
        where: { id: learnCol.id },
        data: { links: newLinks as unknown as Prisma.InputJsonValue },
      });
      console.log('  ✓ Footer 学习列: 已插入"讲师"');
    }
  }

  console.log('\n=== 完成 ===');
}

main()
  .catch((e) => {
    console.error('Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
