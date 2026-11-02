/**
 * seed-demo.ts — 一键灌入完整 demo 数据 (2026-08-04)
 *
 * 新同事 clone repo 后跑这个就完事了。
 * 跑法 (在 apps/api 目录下):
 *   pnpm db:seed:demo
 *
 * 顺序 (前一步必须先成功, 后一步才进):
 *   1. seed.ts                          — admin / student 用户 + 6 门 baseline 课程
 *   2. seed-cms.ts                      — 16 张 CMS 表 (industries / testimonials / top-nav / footer-columns 等)
 *   3. seed-instructors-content.ts      — 给 6 门 baseline 课程的讲师补 title/bio/avatar/social
 *   4. seed-instructors-test-data.ts    — 扩充 10 个 demo 讲师 + 6 个新专长 + 多讲师挂载场景
 *   5. seed-nav-footer.ts               — 在 top-nav 和 footer 学习列插入"讲师"入口
 *   6. seed-extra.ts                    — 10 个额外学生 + enrollments + practice completions + orders
 *                                        (让首页 KPI 看上去真实)
 *
 * 全部 idempotent — 重复跑不会爆。
 * 出错会 halt, 不会留半截。
 */
import { execSync } from 'child_process';

const STEPS: Array<{ name: string; script: string; description: string }> = [
  {
    name: '1/6 基础数据 (admin + student + 6 课程)',
    script: 'seed.ts',
    description: '创建 2 个 admin + 1 个 student + 6 门 baseline 课程 (含章节/课时)',
  },
  {
    name: '2/6 CMS 16 张表',
    script: 'seed-cms.ts',
    description: 'industries / testimonials / top-nav / footer-columns / enum_translations / i18n 等',
  },
  {
    name: '3/6 讲师内容补全',
    script: 'seed-instructors-content.ts',
    description: '给 6 门 baseline 课程的讲师补 title / headline / bio / avatar / social + 8 个专长',
  },
  {
    name: '4/6 讲师测试数据',
    script: 'seed-instructors-test-data.ts',
    description: '扩充 10 个 demo 讲师 (9 已发布 + 1 草稿) + 6 个新专长 + 多讲师挂载场景 (单/双/三讲师)',
  },
  {
    name: '5/6 Nav / Footer 入口',
    script: 'seed-nav-footer.ts',
    description: '在 top-nav (5 项) 和 footer 学习列 (5 项) 插入"讲师"入口',
  },
  {
    name: '6/6 演示数据 (学员/选课/实践/订单)',
    script: 'seed-extra.ts',
    description: '10 个额外学生 + 8+ enrollments + 5+ practice completions + 1-2 笔订单 (让首页 KPI 不空)',
  },
];

function runStep(step: { name: string; script: string; description: string }) {
  const start = Date.now();
  console.log(`\n${'━'.repeat(64)}`);
  console.log(`▶ ${step.name}`);
  console.log(`  ${step.description}`);
  console.log(`${'━'.repeat(64)}`);
  try {
    execSync(`pnpm exec ts-node prisma/${step.script}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    const seconds = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ ${step.name} 完成 (${seconds}s)`);
  } catch (e) {
    console.error(`\n❌ ${step.name} 失败 — 已 halt, 不会跑后续步骤`);
    console.error(`   修复后重跑: pnpm db:seed:demo (整体重跑) 或 pnpm exec ts-node prisma/${step.script}`);
    process.exit(1);
  }
}

console.log('🚀 SecondPlanet — Demo 数据一键灌入');
console.log(`   工作目录: ${process.cwd()}`);
console.log(`   步骤数:   ${STEPS.length}`);

const overallStart = Date.now();
for (const step of STEPS) {
  runStep(step);
}
const overallSeconds = ((Date.now() - overallStart) / 1000).toFixed(1);

console.log(`\n${'━'.repeat(64)}`);
console.log(`🎉 全部 ${STEPS.length} 步完成 (${overallSeconds}s)`);
console.log(`${'━'.repeat(64)}`);
console.log('\n登录账号:');
console.log('  admin:  admin@secondplanet.local        / admin123');
console.log('  admin:  admin@secondplanet.local   / admin123');
console.log('  student: student@secondplanet.local        / 123456');
console.log('\n关键 URL:');
console.log('  公共讲师墙:  http://localhost:5500/instructors');
console.log('  Admin 后台:  http://localhost:5500/admin/instructors');
console.log('  API docs:    http://localhost:8080/api/docs');
