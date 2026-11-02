/**
 * seed-extra.ts — 给现有 DB 增量加数据, 不删旧数据
 *
 * 解决: AICourse 站点统计太单薄(只有 1 个 student, 0 enrollments, 0 practice completions).
 *       首页 hero / AuthShell 用 /api/v1/site/stats 展示 KPI, 数据太空.
 *
 * 策略(全部 idempotent, 重复跑不会爆):
 *   - 学员: 补到至少 11 个(student@secondplanet.local 之外再加 10 个, 名字/邮箱确定不冲突)
 *   - 选课: 给 featured course + 2-3 门其他课程加 enrollments(总到 8+)
 *   - 实践项目: 补 3 个 PracticeProject(原始 seed 没创建, 反正需要)
 *   - 实践完成: 给 student@secondplanet.local 加 5 个 practiceCompletion
 *   - 进度: 给 student@secondplanet.local 加几条 progressRecord(模拟已学过几节课)
 *   - 订单: 加 1-2 笔已支付 paid order(让 GMV > 0)
 *
 * 用法:
 *   cd apps/api && DATABASE_URL=... pnpm exec ts-node prisma/seed-extra.ts
 */
import { PrismaClient, UserRole, OrderStatus, OrderType, CompletionStatus, ProjectType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SAMPLE_STUDENTS = [
  { email: 'alice@secondplanet.local', name: 'Alice 王' },
  { email: 'bob@secondplanet.local', name: 'Bob 李' },
  { email: 'carol@secondplanet.local', name: 'Carol 张' },
  { email: 'david@secondplanet.local', name: 'David 陈' },
  { email: 'emma@secondplanet.local', name: 'Emma 刘' },
  { email: 'frank@secondplanet.local', name: 'Frank 周' },
  { email: 'grace@secondplanet.local', name: 'Grace 吴' },
  { email: 'henry@secondplanet.local', name: 'Henry 郑' },
  { email: 'ivy@secondplanet.local', name: 'Ivy 林' },
  { email: 'jack@secondplanet.local', name: 'Jack 黄' },
];

const SAMPLE_PRACTICES = [
  {
    title: '搭建你的第一个 RAG 系统',
    description: '用 LangChain + OpenAI + Chroma 搭一个能"问文档"的 chatbot',
    projectUrl: 'https://github.com/secondplanet/practice-rag-basics',
    projectType: ProjectType.repository,
    estimatedTime: 120,
    difficulty: 'intermediate' as const,
    tags: 'RAG,LangChain,向量数据库',
    requirements: '已完成 LangChain 入门课',
    objectives: '理解 RAG 全链路: 文档切片 / embedding / 检索 / 生成',
  },
  {
    title: 'Fine-tune 一个 LLM 做客服分类',
    description: '用 Hugging Face Transformers + LoRA 微调一个小模型',
    projectUrl: 'https://github.com/secondplanet/practice-finetune-classifier',
    projectType: ProjectType.model_training,
    estimatedTime: 180,
    difficulty: 'advanced' as const,
    tags: 'Fine-tuning,LoRA,HuggingFace',
    requirements: '了解 Transformer 基础',
    objectives: '掌握 LoRA 微调流程, 学会评测',
  },
  {
    title: 'Prompt Engineering 实验报告',
    description: '对比 zero-shot / few-shot / CoT 在客服场景的效果',
    projectUrl: 'https://github.com/secondplanet/practice-prompt-experiments',
    projectType: ProjectType.notebook,
    estimatedTime: 60,
    difficulty: 'beginner' as const,
    tags: 'Prompt Engineering,CoT,Few-shot',
    requirements: '无',
    objectives: '理解 prompt 设计对输出的影响',
  },
];

async function main() {
  console.log('🌱 seed-extra: augmenting DB with realistic data...');

  const password = await bcrypt.hash('123456', 12);

  // ============================================================
  // 1) 学员: 补到 ≥ 11 个
  // ============================================================
  let addedStudents = 0;
  for (const s of SAMPLE_STUDENTS) {
    const existing = await prisma.user.findUnique({ where: { email: s.email } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        email: s.email,
        passwordHash: password,
        name: s.name,
        role: UserRole.student,
        points: Math.floor(Math.random() * 200),
        level: Math.floor(Math.random() * 3) + 1,
      },
    });
    addedStudents++;
  }
  const totalStudents = await prisma.user.count({ where: { role: { in: ['student', 'instructor'] } } });
  console.log(`  ✓ students: +${addedStudents} (total non-admin: ${totalStudents})`);

  // ============================================================
  // 2) PracticeProject: 补 3 个
  // ============================================================
  const firstCourse = await prisma.course.findFirst({ where: { status: 'published' } });
  let addedPractices = 0;
  if (firstCourse) {
    for (const p of SAMPLE_PRACTICES) {
      const exists = await prisma.practiceProject.findFirst({ where: { title: p.title } });
      if (exists) continue;
      await prisma.practiceProject.create({
        data: {
          courseId: firstCourse.id,
          ...p,
          isActive: true,
        },
      });
      addedPractices++;
    }
  }
  const totalPractices = await prisma.practiceProject.count();
  console.log(`  ✓ practice projects: +${addedPractices} (total: ${totalPractices})`);

  // ============================================================
  // 3) 选课 enrollments: 至少 8 条
  // ============================================================
  const currentEnrollments = await prisma.enrollment.count();
  const allStudents = await prisma.user.findMany({ where: { role: 'student' }, select: { id: true } });
  const publishedCourses = await prisma.course.findMany({
    where: { status: 'published' },
    select: { id: true, costType: true, price: true },
  });

  let addedEnrollments = 0;
  if (currentEnrollments < 8 && allStudents.length > 0 && publishedCourses.length > 0) {
    // 给每个 student 选 1-2 门课
    for (const student of allStudents) {
      const existing = await prisma.enrollment.count({ where: { userId: student.id } });
      if (existing >= 2) continue;

      const numToAdd = Math.min(2 - existing, publishedCourses.length);
      for (let i = 0; i < numToAdd; i++) {
        const course = publishedCourses[(Math.random() * publishedCourses.length) | 0];
        const already = await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: student.id, courseId: course.id } },
        });
        if (already) continue;

        await prisma.enrollment.create({
          data: {
            userId: student.id,
            courseId: course.id,
            enrolledAt: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000),
            source: 'direct',
          },
        });
        addedEnrollments++;
      }
    }
  }
  const totalEnrollments = await prisma.enrollment.count();
  console.log(`  ✓ enrollments: +${addedEnrollments} (total: ${totalEnrollments})`);

  // ============================================================
  // 4) Practice completions: 至少 5 条
  // ============================================================
  const currentCompletions = await prisma.practiceCompletion.count();
  let addedCompletions = 0;
  if (currentCompletions < 5 && allStudents.length > 0) {
    const practices = await prisma.practiceProject.findMany({ select: { id: true } });
    if (practices.length > 0) {
      for (const student of allStudents) {
        if (addedCompletions >= 6) break;
        const p = practices[(Math.random() * practices.length) | 0];
        const exists = await prisma.practiceCompletion.findUnique({
          where: { userId_projectId: { userId: student.id, projectId: p.id } },
        });
        if (exists) continue;
        await prisma.practiceCompletion.create({
          data: {
            userId: student.id,
            projectId: p.id,
            status: CompletionStatus.completed,
            startedAt: new Date(Date.now() - (Math.random() * 30 + 5) * 24 * 3600 * 1000),
            completedAt: new Date(Date.now() - Math.random() * 7 * 24 * 3600 * 1000),
            submissionUrl: `https://github.com/${student.id.slice(0, 8)}/practice-${p.id.slice(0, 4)}`,
            notes: '完成了核心功能, 评测指标达成.',
          },
        });
        addedCompletions++;
      }
    }
  }
  const totalCompletions = await prisma.practiceCompletion.count();
  console.log(`  ✓ practice completions: +${addedCompletions} (total: ${totalCompletions})`);

  // ============================================================
  // 5) Orders: 至少 2 笔 paid
  // ============================================================
  const currentPaidOrders = await prisma.order.count({ where: { status: 'paid' } });
  let addedOrders = 0;
  if (currentPaidOrders < 2) {
    const paidCourses = await prisma.course.findMany({
      where: { costType: 'paid' },
      select: { id: true, price: true },
    });
    for (const student of allStudents) {
      if (addedOrders >= 2) break;
      if (paidCourses.length === 0) break;
      const course = paidCourses[(Math.random() * paidCourses.length) | 0];
      const exists = await prisma.order.findFirst({
        where: { userId: student.id, courseId: course.id, status: 'paid' },
      });
      if (exists) continue;
      await prisma.order.create({
        data: {
          userId: student.id,
          courseId: course.id,
          type: OrderType.course,
          amount: course.price,
          status: OrderStatus.paid,
          paymentMethod: 'alipay',
          paidAt: new Date(Date.now() - Math.random() * 14 * 24 * 3600 * 1000),
        },
      });
      addedOrders++;
    }
  }
  const totalPaidOrders = await prisma.order.count({ where: { status: 'paid' } });
  console.log(`  ✓ paid orders: +${addedOrders} (total: ${totalPaidOrders})`);

  // ============================================================
  // 6) Progress records: 给 student@secondplanet.local 加几条(让 DAU > 0)
  // ============================================================
  const studentUser = await prisma.user.findUnique({ where: { email: 'student@secondplanet.local' } });
  if (studentUser) {
    const currentProgress = await prisma.progressRecord.count({ where: { userId: studentUser.id } });
    if (currentProgress < 3) {
      const lessons = await prisma.lesson.findMany({ take: 5, select: { id: true } });
      let addedProgress = 0;
      for (const lesson of lessons) {
        const exists = await prisma.progressRecord.findUnique({
          where: { userId_lessonId: { userId: studentUser.id, lessonId: lesson.id } },
        });
        if (exists) continue;
        // ProgressRecord 需要 courseId, 从 lesson -> chapter -> course 取
        const lessonDetail = await prisma.lesson.findUnique({
          where: { id: lesson.id },
          select: { chapter: { select: { courseId: true } } },
        });
        if (!lessonDetail) continue;
        await prisma.progressRecord.create({
          data: {
            userId: studentUser.id,
            courseId: lessonDetail.chapter.courseId,
            lessonId: lesson.id,
            status: 'completed',
            completedAt: new Date(Date.now() - Math.random() * 7 * 24 * 3600 * 1000),
          },
        });
        addedProgress++;
        if (addedProgress >= 3) break;
      }
      console.log(`  ✓ progress records: +${addedProgress} for student@secondplanet.local`);
    }
  }

  // ============================================================
  // 7) User badges: 给一些学员发 1-2 个徽章(让 badge 展示更真实)
  // ============================================================
  const currentUserBadges = await prisma.userBadge.count();
  if (currentUserBadges < 8) {
    const badges = await prisma.badge.findMany({ where: { isActive: true }, take: 5 });
    let added = 0;
    for (const student of allStudents) {
      if (added >= 8) break;
      const b = badges[(Math.random() * badges.length) | 0];
      const exists = await prisma.userBadge.findUnique({
        where: { userId_badgeId: { userId: student.id, badgeId: b.id } },
      });
      if (exists) continue;
      await prisma.userBadge.create({
        data: {
          userId: student.id,
          badgeId: b.id,
          unlockedAt: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000),
        },
      });
      added++;
    }
    console.log(`  ✓ user badges: +${added}`);
  }

  console.log('✅ seed-extra done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
