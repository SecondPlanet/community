/**
 * certificates/seed.ts — P1-8 证书 seed
 *
 * 给 admin user(从 DB 查,id 1 / email admin@secondplanet.local)发 3 条 mock 证书:
 *   1 课程 (LangChain)
 *   1 学位 (AI 工程师基础)
 *   1 黑客松 (Spring 2026 Agent Builders)
 *
 * 用法:
 *   pnpm --filter @secondplanet/api exec ts-node src/modules/certificates/seed.ts
 *
 * 幂等: 已存在则跳过。
 */
import { PrismaClient } from '@prisma/client';
import { CertificatesService } from './certificates.service';

async function main() {
  // 用 PrismaClient 直接 seed, 避免 nest module 依赖。PrismaService 继承 PrismaClient,
  // 但 seed 是单文件脚本不通过 DI 注入, 这里是 plain PrismaClient 即可。
  const prisma = new PrismaClient() as any;
  const certificatesService = new CertificatesService(prisma);

  // admin 1
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
  });
  if (!admin) {
    console.error('No admin user found. Run apps/api/prisma/seed.ts first.');
    process.exit(1);
  }
  console.info(`Seeding certificates for admin: ${admin.email} (${admin.id})`);

  // 找第一个 course / degree / hackathon 当 ref
  const course = await prisma.course.findFirst({
    where: { status: 'published' },
    select: { id: true, title: true },
  });
  const degree = await prisma.nanoDegree.findFirst({
    select: { id: true, title: true },
  });
  const hackathon = await prisma.hackathon.findFirst({
    orderBy: { startDate: 'desc' },
    select: { id: true, title: true },
  });

  if (course) {
    const cert = await certificatesService.issueCertificate({
      userId: admin.id,
      type: 'course',
      refId: course.id,
      title: `${course.title} · 完成证书`,
      description: `恭喜您完成课程《${course.title}》。`,
      completedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { score: 92, hours: 12 },
    });
    console.info(`  course certificate: ${cert.serialNumber}`);
  } else {
    console.info('  (skipped course certificate: no published course found)');
  }

  if (degree) {
    const cert = await certificatesService.issueCertificate({
      userId: admin.id,
      type: 'degree',
      refId: degree.id,
      title: `${degree.title} · 学位证书`,
      description: `恭喜您完成学位项目《${degree.title}》。`,
      completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { gpa: 3.8, totalCourses: 6 },
    });
    console.info(`  degree certificate: ${cert.serialNumber}`);
  } else {
    console.info('  (skipped degree certificate: no degree found)');
  }

  if (hackathon) {
    const cert = await certificatesService.issueCertificate({
      userId: admin.id,
      type: 'hackathon',
      refId: hackathon.id,
      title: `${hackathon.title} · 参赛证书`,
      description: `感谢您参加黑客松《${hackathon.title}》。`,
      completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { teamName: 'AI Pioneers', rank: 2 },
    });
    console.info(`  hackathon certificate: ${cert.serialNumber}`);
  } else {
    console.info('  (skipped hackathon certificate: no hackathon found)');
  }

  await prisma.$disconnect();
  console.info('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
