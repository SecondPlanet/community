/**
 * seed-instructors-content.ts (2026-08-04)
 *
 * 用途: 把现有 6 个讲师从"只有 name"填充到有真实可展示的内容
 *       (title / headline / bio / avatar / company / social / 专长标签)
 *       + 注入 8 个常用专长
 *
 * 风格: 跟课程主题贴合 (云/AI/安全/Python/产品/设计)
 *       头像走 https://api.dicebear.com 真实 SVG avatar 端点
 *
 * 运行:
 *   pnpm db:seed:instructors-content          (单跑)
 *   pnpm db:seed:demo                         (走 master 流程)
 * 幂等: 每次跑都会刷新 (用 upsert + 覆盖)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 8 个常用专长 — 走品牌化 i18n label
const EXPERTISES = [
  { key: 'ai', label: '人工智能', labelEn: 'AI', orderIndex: 0 },
  { key: 'llm', label: '大模型', labelEn: 'LLM', orderIndex: 1 },
  { key: 'cloud', label: '云计算', labelEn: 'Cloud', orderIndex: 2 },
  { key: 'security', label: '信息安全', labelEn: 'Security', orderIndex: 3 },
  { key: 'python', label: 'Python', labelEn: 'Python', orderIndex: 4 },
  { key: 'frontend', label: '前端工程', labelEn: 'Frontend', orderIndex: 5 },
  { key: 'product', label: '产品设计', labelEn: 'Product', orderIndex: 6 },
  { key: 'devops', label: 'DevOps', labelEn: 'DevOps', orderIndex: 7 },
];

// 6 个讲师 — 按现有 name 精确匹配
const INSTRUCTORS: Array<{
  match: string;
  data: {
    nameEn?: string;
    title: string;
    titleEn?: string;
    headline: string;
    headlineEn?: string;
    bio: string;
    bioEn?: string;
    avatarUrl: string;
    company: string;
    yearsOfExperience: number;
    linkedinUrl?: string;
    githubUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
    expertiseKeys: string[];
  };
}> = [
  {
    match: 'Sky Walker',
    data: {
      nameEn: 'Sky Walker',
      title: '首席云架构师',
      titleEn: 'Principal Cloud Architect',
      headline: '把复杂云原生系统拆成可读代码 — 不是 PPT',
      headlineEn: 'Turns gnarly cloud-native systems into readable code — not slides',
      bio: '前 AWS 解决方案架构师，主导过 3 家独角兽的多区域容灾体系改造。专注可观测性、SRE 与成本治理。\n\n"云不是魔法，是一系列 trade-off。看清楚 trade-off 才算入门。"',
      bioEn: 'Ex-AWS solutions architect, led multi-region DR overhauls at three unicorns. Focus on observability, SRE, and cost governance.',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sky-walker&backgroundColor=171717',
      company: 'CloudFirst Inc.',
      yearsOfExperience: 12,
      linkedinUrl: 'https://linkedin.com/in/sky-walker',
      githubUrl: 'https://github.com/sky-walker',
      websiteUrl: 'https://sky-walker.dev',
      expertiseKeys: ['cloud', 'devops'],
    },
  },
  {
    match: 'Mr. Robot',
    data: {
      nameEn: 'Mr. Robot',
      title: '高级安全研究员',
      titleEn: 'Senior Security Researcher',
      headline: '白帽黑客 — 帮你在被打之前先找到自己的漏洞',
      headlineEn: 'White-hat hacker — finds your holes before attackers do',
      bio: '前 Google Project Zero contributor，CVE 颁发 7 枚。专注红蓝对抗、应用安全与威胁建模。\n\n"安全不是加 feature，是减风险。每少一行危险代码，就多一个能安稳睡觉的夜晚。"',
      bioEn: 'Ex-Google Project Zero contributor, 7 CVEs. Focus on red/blue teaming, appsec, and threat modeling.',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mr-robot&backgroundColor=262626',
      company: 'RedTeam Co.',
      yearsOfExperience: 10,
      githubUrl: 'https://github.com/mr-robot',
      twitterUrl: 'https://twitter.com/mr_robot',
      websiteUrl: 'https://mr-robot.io',
      expertiseKeys: ['security', 'devops'],
    },
  },
  {
    match: 'Guido',
    data: {
      nameEn: 'Guido',
      title: 'Python 语言布道者',
      titleEn: 'Python Language Advocate',
      headline: '让 Python 像说话一样自然',
      headlineEn: 'Makes Python feel as natural as speaking',
      bio: 'Python 核心库 contributor，编写过 5 本 Python 入门书。先后在 Dropbox 与微软带领工程团队。\n\n"好的代码读起来像英语 — 你不需要注释去解释它在做什么。"',
      bioEn: 'Python core library contributor, author of 5 Python books. Led engineering at Dropbox and Microsoft.',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=guido&backgroundColor=171717',
      company: 'Independent',
      yearsOfExperience: 25,
      githubUrl: 'https://github.com/guido',
      websiteUrl: 'https://guido.py',
      expertiseKeys: ['python', 'devops'],
    },
  },
  {
    match: 'Neo',
    data: {
      nameEn: 'Neo',
      title: 'AI 工程师',
      titleEn: 'AI Engineer',
      headline: '从矩阵里把数据捞出来 — 教模型看懂世界',
      headlineEn: 'Pulls data from the matrix — teaches models to see',
      bio: '前 OpenAI 应用研究工程师，主导过 GPT-4 内部评测流水线。专注 LLM 应用、Agent 系统与 RAG 架构。\n\n"AI 不会取代你，但会用 AI 的人会。这门课讲清楚怎么用。"',
      bioEn: 'Ex-OpenAI applied research engineer, led GPT-4 internal eval pipeline. Focus on LLM apps, agents, and RAG.',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=neo&backgroundColor=262626',
      company: 'Apex Labs',
      yearsOfExperience: 8,
      linkedinUrl: 'https://linkedin.com/in/neo',
      githubUrl: 'https://github.com/neo',
      twitterUrl: 'https://twitter.com/neo_ai',
      expertiseKeys: ['ai', 'llm', 'python'],
    },
  },
  {
    match: 'Alice 博士',
    data: {
      nameEn: 'Dr. Alice',
      title: 'AI 科学家 · 清华教授',
      titleEn: 'AI Scientist · Tsinghua Professor',
      headline: '从数学到模型 — 把论文里的公式变成能跑的代码',
      headlineEn: 'From math to models — turns paper formulas into working code',
      bio: '清华计算机系教授，斯坦福访问学者。发表 NeurIPS / ICML 论文 30+ 篇，主攻多模态大模型与对齐。\n\n"搞研究不是比谁算力大，是比谁问的问题更准。"',
      bioEn: 'Tsinghua CS professor, Stanford visiting scholar. 30+ NeurIPS/ICML papers, multimodal LLMs and alignment.',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice&backgroundColor=171717',
      company: '清华大学',
      yearsOfExperience: 15,
      linkedinUrl: 'https://linkedin.com/in/alice-phd',
      websiteUrl: 'https://alice.cs.tsinghua.edu.cn',
      expertiseKeys: ['ai', 'llm'],
    },
  },
  {
    match: 'Sarah C.',
    data: {
      nameEn: 'Sarah Chen',
      title: 'AI 内容产品负责人',
      titleEn: 'Head of AI Content Product',
      headline: '让 AI 不再神秘 — 普通人也能用上的生产力',
      headlineEn: 'Makes AI less mysterious — productivity for everyone',
      bio: '前 Coursera AI 内容总监，主导过 50+ 门 AI 通识课上线。专注 AI 普惠、教育产品设计与课程体验。\n\n"AI 不该是少数人的玩具。把它讲明白是我的工作。"',
      bioEn: 'Ex-Coursera AI content director, launched 50+ AI literacy courses. Focus on AI accessibility, edtech product.',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah&backgroundColor=262626',
      company: 'OpenCSG',
      yearsOfExperience: 11,
      linkedinUrl: 'https://linkedin.com/in/sarah-chen',
      twitterUrl: 'https://twitter.com/sarah_chen_ai',
      websiteUrl: 'https://sarahchen.ai',
      expertiseKeys: ['ai', 'product'],
    },
  },
];

async function main() {
  console.log('=== 讲师内容增强 seed ===');

  // 1. 注入专长 (upsert by key)
  console.log('\n[1/3] 注入专长标签...');
  for (const exp of EXPERTISES) {
    await prisma.instructorExpertise.upsert({
      where: { key: exp.key },
      create: { ...exp, isActive: true },
      update: { ...exp, isActive: true },
    });
  }
  console.log(`  ✓ ${EXPERTISES.length} 个专长已就位`);

  // 2. 填充讲师内容
  console.log('\n[2/3] 填充讲师内容...');
  const expertiseByKey = new Map(
    (await prisma.instructorExpertise.findMany({ select: { id: true, key: true } })).map(
      (e) => [e.key, e.id] as const,
    ),
  );

  let updated = 0;
  let skipped = 0;
  for (const inst of INSTRUCTORS) {
    const found = await prisma.instructor.findFirst({ where: { name: inst.match } });
    if (!found) {
      console.warn(`  ! 找不到讲师 "${inst.match}", 跳过`);
      skipped += 1;
      continue;
    }
    // upsert 内容字段
    const { expertiseKeys, ...dataFields } = inst.data;
    await prisma.instructor.update({
      where: { id: found.id },
      data: dataFields,
    });
    // 重建 expertise 关联
    await prisma.instructorExpertiseLink.deleteMany({ where: { instructorId: found.id } });
    for (let i = 0; i < expertiseKeys.length; i += 1) {
      const key = expertiseKeys[i];
      const expertiseId = expertiseByKey.get(key);
      if (!expertiseId) continue;
      await prisma.instructorExpertiseLink.create({
        data: { instructorId: found.id, expertiseId, orderIndex: i },
      });
    }
    updated += 1;
    console.log(`  ✓ ${inst.match} → ${inst.data.title}`);
  }
  console.log(`\n  更新: ${updated} / 跳过: ${skipped}`);

  // 3. 给"全民 AI"挂个副讲师 (展示多讲师场景, role=mentor)
  console.log('\n[3/3] 给"全民 AI"课加一个 mentor (副讲师, 展示多讲师场景)...');
  const aiCourse = await prisma.course.findFirst({ where: { title: { contains: '全民 AI' } } });
  const alice = await prisma.instructor.findFirst({ where: { name: 'Alice 博士' } });
  if (aiCourse && alice) {
    // 检查是否已挂
    const existing = await prisma.courseInstructorLink.findFirst({
      where: { courseId: aiCourse.id, instructorId: alice.id, role: 'mentor' },
    });
    if (!existing) {
      await prisma.courseInstructorLink.create({
        data: {
          courseId: aiCourse.id,
          instructorId: alice.id,
          role: 'mentor',
          isPrimary: false,
          orderIndex: 0,
        },
      });
      console.log(`  ✓ ${alice.name} 作为 mentor 挂到 "${aiCourse.title}"`);
    } else {
      console.log('  · mentor 关联已存在, 跳过');
    }
  } else {
    console.log('  · "全民 AI" 课程或 Alice 讲师不存在, 跳过');
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
