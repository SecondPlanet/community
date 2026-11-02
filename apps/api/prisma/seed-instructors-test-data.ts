/**
 * seed-instructors-test-data.ts (2026-08-04)
 *
 * 用途: 给生产 demo / 投资人路演 / 内部测试 制造丰富的讲师/课程数据
 *
 * 内容:
 *   - 6 → 15 讲师 (10 已发布 + 2 草稿 + 3 不同专长组合 + 中英双语)
 *   - 8 → 14 专长 (新增 6 个: rust / go / typescript / web3 / data-eng / design)
 *   - 给现有 6 课程 + 演示数据多挂讲师 (单讲师/双讲师/三讲师场景)
 *   - 草稿讲师 (前台不可见) 演示 publishedOnly 过滤
 *
 * 运行:
 *   pnpm db:seed:instructors-test-data       (单跑)
 *   pnpm db:seed:demo                        (走 master 流程)
 * 幂等: 用 upsert by name, 重复跑覆盖不重建
 */
import { PrismaClient, CourseInstructorRole, CourseStatus } from '@prisma/client';

const prisma = new PrismaClient();

// =============================================================
// 扩展专长
// =============================================================
const NEW_EXPERTISES = [
  { key: 'rust', label: 'Rust', labelEn: 'Rust', orderIndex: 8 },
  { key: 'go', label: 'Go', labelEn: 'Go', orderIndex: 9 },
  { key: 'typescript', label: 'TypeScript', labelEn: 'TypeScript', orderIndex: 10 },
  { key: 'web3', label: 'Web3', labelEn: 'Web3', orderIndex: 11 },
  { key: 'data-eng', label: '数据工程', labelEn: 'Data Engineering', orderIndex: 12 },
  { key: 'design', label: '设计', labelEn: 'Design', orderIndex: 13 },
];

// =============================================================
// 9 个新讲师 (mix: 已发布 + 草稿 + 有/无头像 + 不同专长组合 + 中英)
// 名字故意用 ASCII 避免 zh-CN 兼容, slug 自动 hash 兜底
// =============================================================
const NEW_INSTRUCTORS = [
  {
    name: '张明远',
    slug: 'zhang-mingyuan',
    nameEn: 'Mingyuan Zhang',
    title: 'AI 平台架构师',
    titleEn: 'AI Platform Architect',
    headline: '从 0 搭千亿参数在线推理平台, 让 GPU 不再是瓶颈',
    headlineEn: 'Building trillion-param online inference at scale',
    bio: '前阿里云 P9 高级技术专家, 主导通义千问在线推理平台从 0 到 1。专长 GPU 资源调度、KV cache 优化、Serving 系统设计。\n\n"模型大不等于有用, 工程化决定一切。"',
    bioEn: 'Ex-Alibaba Cloud P9, led Tongyi Qianwen online inference platform 0→1. Focus on GPU scheduling, KV cache optimization.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zhang-mingyuan&backgroundColor=171717',
    company: '字节跳动',
    yearsOfExperience: 13,
    linkedinUrl: 'https://linkedin.com/in/mingyuan',
    githubUrl: 'https://github.com/mingyuan',
    websiteUrl: 'https://mingyuan.dev',
    expertiseKeys: ['ai', 'llm', 'cloud'],
    published: true,
  },
  {
    name: '李雪',
    slug: 'li-xue',
    nameEn: 'Xue Li',
    title: '高级前端工程师',
    titleEn: 'Senior Frontend Engineer',
    headline: '让 React/Vue 不再是 "会用" 而是 "写明白"',
    headlineEn: 'React/Vue done right — not just used',
    bio: '前蚂蚁金服前端架构师, 10 年大厂经验, 专长大型应用状态管理、性能优化、设计系统。\n\n"前端的核心不是框架, 是数据流。框架只是语法糖。"',
    bioEn: 'Ex-Ant Group frontend architect, 10y in big tech. State management, perf, design systems.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=li-xue&backgroundColor=262626',
    company: '腾讯',
    yearsOfExperience: 10,
    linkedinUrl: 'https://linkedin.com/in/xue-li',
    githubUrl: 'https://github.com/xue-li',
    expertiseKeys: ['frontend', 'typescript'],
    published: true,
  },
  {
    name: 'Tom Hardy',
    slug: 'tom-hardy',
    nameEn: 'Tom Hardy',
    title: 'DevOps Tech Lead',
    titleEn: 'DevOps Tech Lead',
    headline: '把 6 个月的 K8s 迁移压缩到 6 周',
    headlineEn: '6-month K8s migration in 6 weeks',
    bio: '前 Cloudflare SRE, 主导过 50+ 微服务从 VM 迁移到 K8s 零宕机。专长 GitOps、Service Mesh、可观测性。\n\n"好的 SRE 不是救火, 是让火不再烧起来。"',
    bioEn: 'Ex-Cloudflare SRE, led 50+ microservice K8s migration zero-downtime. GitOps, Service Mesh, observability.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tom-hardy&backgroundColor=171717',
    company: 'Datadog',
    yearsOfExperience: 12,
    linkedinUrl: 'https://linkedin.com/in/tom-hardy',
    githubUrl: 'https://github.com/tom-hardy',
    twitterUrl: 'https://twitter.com/tom_hardy_sre',
    expertiseKeys: ['devops', 'cloud'],
    published: true,
  },
  {
    name: '林思琪',
    slug: 'lin-siqi',
    nameEn: 'Siqi Lin',
    title: '安全研究员',
    titleEn: 'Security Researcher',
    headline: '挖过 30+ CVE 的女 hacker',
    headlineEn: 'Female hacker with 30+ CVEs',
    bio: '蚂蚁金服安全团队, 主攻应用安全、加密学、Web 渗透。多次 Black Hat / DEF CON 演讲者。\n\n"安全是 design property, 不是 bolt-on。"',
    bioEn: 'Ant Group security team. AppSec, crypto, web pentest. Black Hat / DEF CON speaker.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lin-siqi&backgroundColor=262626',
    company: '蚂蚁集团',
    yearsOfExperience: 8,
    linkedinUrl: 'https://linkedin.com/in/siqi-lin',
    githubUrl: 'https://github.com/siqi-lin',
    expertiseKeys: ['security', 'devops'],
    published: true,
  },
  {
    name: 'Priya Sharma',
    slug: 'priya-sharma',
    nameEn: 'Priya Sharma',
    title: 'ML Engineer',
    titleEn: 'ML Engineer',
    headline: '把 RAG 从 demo 变成 production',
    headlineEn: 'RAG from demo to production',
    bio: '前 Microsoft AI 团队, 主导 Bing Copilot RAG 架构。专长向量检索、re-ranking、evals。\n\n"没有 eval 的 RAG 就是赌博。"',
    bioEn: 'Ex-Microsoft AI, led Bing Copilot RAG. Vector search, re-ranking, evals.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya&backgroundColor=171717',
    company: 'Microsoft',
    yearsOfExperience: 9,
    linkedinUrl: 'https://linkedin.com/in/priya-sharma',
    githubUrl: 'https://github.com/priya-sharma',
    expertiseKeys: ['ai', 'llm', 'python'],
    published: true,
  },
  {
    name: '陈哲',
    slug: 'chen-zhe',
    nameEn: 'Zhe Chen',
    title: '全栈工程师',
    titleEn: 'Full-Stack Engineer',
    headline: '从 Rust 后端到 WebAssembly 前端, 一人搞定',
    headlineEn: 'Rust backend to WASM frontend, solo',
    bio: '独立开发者, 做过 3 款开源项目, GitHub 8k stars。专长系统编程、性能优化、Web3 合约。\n\n"代码写得好不好, 看半年后你自己能不能看懂。"',
    bioEn: 'Indie dev, 3 OSS projects, 8k GitHub stars. Systems programming, perf, Web3 contracts.',
    avatarUrl: null,  // 测试无头像 fallback
    company: 'Independent',
    yearsOfExperience: 11,
    linkedinUrl: 'https://linkedin.com/in/zhe-chen',
    githubUrl: 'https://github.com/zhe-chen',
    websiteUrl: 'https://zhechen.dev',
    expertiseKeys: ['rust', 'go', 'typescript', 'web3'],
    published: true,
  },
  {
    name: 'Anna Müller',
    slug: 'anna-muller',
    nameEn: 'Anna Müller',
    title: '产品设计师',
    titleEn: 'Product Designer',
    headline: '让 0-1 的产品从 "能用" 变 "想用"',
    headlineEn: '0→1 products: usable to lovable',
    bio: '前 Figma 设计主管, 8 年设计系统经验。Figma Config 2024 演讲者。专长 design system、UX research、prototyping。\n\n"设计不是装饰, 是让复杂变简单的语言。"',
    bioEn: 'Ex-Figma design lead, 8y design systems. Figma Config 2024 speaker. DS, UX research, prototyping.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=anna-muller&backgroundColor=262626',
    company: 'Stripe',
    yearsOfExperience: 8,
    linkedinUrl: 'https://linkedin.com/in/anna-muller',
    twitterUrl: 'https://twitter.com/anna_designs',
    expertiseKeys: ['design', 'frontend', 'product'],
    published: true,
  },
  {
    name: '周明',
    slug: 'zhou-ming',
    nameEn: 'Ming Zhou',
    title: '数据架构师',
    titleEn: 'Data Architect',
    headline: 'PB 级数据 pipeline 不到 100 行代码',
    headlineEn: 'PB-scale pipelines in <100 LOC',
    bio: '前 Uber 数据团队, 主导实时数据平台架构。专长 Kafka / Flink / Iceberg / DuckDB。\n\n"数据不是越多越好, 是越对越好。"',
    bioEn: 'Ex-Uber data team, led real-time data platform. Kafka/Flink/Iceberg/DuckDB.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zhou-ming&backgroundColor=171717',
    company: 'Uber',
    yearsOfExperience: 14,
    linkedinUrl: 'https://linkedin.com/in/ming-zhou',
    githubUrl: 'https://github.com/ming-zhou',
    expertiseKeys: ['data-eng', 'python', 'cloud'],
    published: true,
  },
  {
    name: 'Alex Chen',
    slug: 'alex-chen',
    nameEn: 'Alex Chen',
    title: 'Web3 Engineer',
    titleEn: 'Web3 Engineer',
    headline: 'Solidity / Rust 合约 + ZK circuit 实战',
    headlineEn: 'Solidity / Rust + ZK circuit practitioner',
    bio: '前 Paradigm 研究员, 多个 L1/L2 协议核心 contributor。专长 zk-SNARK、共识机制、MEV。\n\n"Web3 不是金融游戏, 是去中心化协调的新范式。"',
    bioEn: 'Ex-Paradigm research, core contributor to multiple L1/L2 protocols. zk-SNARK, consensus, MEV.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex-chen&backgroundColor=262626',
    company: 'Paradigm',
    yearsOfExperience: 7,
    linkedinUrl: 'https://linkedin.com/in/alex-chen-web3',
    twitterUrl: 'https://twitter.com/alex_chen_web3',
    websiteUrl: 'https://alexchen.xyz',
    expertiseKeys: ['web3', 'rust'],
    published: true,
  },
  // 草稿讲师 (前台不可见, 演示 publishedOnly 过滤)
  {
    name: '黄鹤',
    slug: 'huang-he',
    nameEn: 'He Huang',
    title: 'Mobile Lead',
    titleEn: 'Mobile Lead',
    headline: 'iOS / Android 双端架构',
    headlineEn: 'iOS/Android cross-platform architecture',
    bio: '前字节跳动 mobile 团队, 抖音/西瓜视频早期架构。\n\n(草稿 — 头像/内容还在整理中)',
    bioEn: 'Ex-ByteDance mobile team, early Douyin/Xigua Video architecture.',
    avatarUrl: null,
    company: '字节跳动',
    yearsOfExperience: 9,
    expertiseKeys: ['mobile' as any].filter(Boolean), // 没有 mobile 专长,跳过
    published: false,  // 草稿
  },
];

// =============================================================
// 课程-讲师挂载映射 (给现有 6 课程多挂讲师, 演示多讲师场景)
// =============================================================
const COURSE_INSTRUCTOR_LINKS: Array<{
  courseTitle: string;
  links: Array<{ instructorName: string; role: CourseInstructorRole; isPrimary: boolean }>;
}> = [
  {
    // 云图: 理解云计算 — Sky Walker 主讲, + Tom Hardy 副讲
    courseTitle: '云图：理解云计算',
    links: [
      { instructorName: 'Sky Walker', role: CourseInstructorRole.instructor, isPrimary: true },
      { instructorName: 'Tom Hardy', role: CourseInstructorRole.instructor, isPrimary: false },
    ],
  },
  {
    // 白帽黑客 — Mr. Robot 主讲, + 林思琪 导师
    courseTitle: '白帽黑客：数字防御',
    links: [
      { instructorName: 'Mr. Robot', role: CourseInstructorRole.instructor, isPrimary: true },
      { instructorName: '林思琪', role: CourseInstructorRole.mentor, isPrimary: false },
    ],
  },
  {
    // Python — Guido 主讲, + Priya Sharma 副讲 (多语言讲师)
    courseTitle: 'Python：友好的编程语言',
    links: [
      { instructorName: 'Guido', role: CourseInstructorRole.instructor, isPrimary: true },
      { instructorName: 'Priya Sharma', role: CourseInstructorRole.instructor, isPrimary: false },
    ],
  },
  {
    // 构建你的第一个网站 — Neo 主讲, + 李雪 副讲
    courseTitle: '构建你的第一个网站',
    links: [
      { instructorName: 'Neo', role: CourseInstructorRole.instructor, isPrimary: true },
      { instructorName: '李雪', role: CourseInstructorRole.instructor, isPrimary: false },
    ],
  },
  {
    // 全民 AI — Sarah C. 主讲, + Alice 博士 导师 (已有) + Neo 副讲 (新)
    courseTitle: '全民 AI',
    links: [
      { instructorName: 'Sarah C.', role: CourseInstructorRole.instructor, isPrimary: true },
      { instructorName: 'Alice 博士', role: CourseInstructorRole.mentor, isPrimary: false },
      { instructorName: 'Neo', role: CourseInstructorRole.instructor, isPrimary: false },
    ],
  },
  {
    // 数字机密 — Alice 博士 主讲, + 林思琪 副讲
    courseTitle: '数字机密：安全基础',
    links: [
      { instructorName: 'Alice 博士', role: CourseInstructorRole.instructor, isPrimary: true },
      { instructorName: '林思琪', role: CourseInstructorRole.instructor, isPrimary: false },
    ],
  },
];

async function main() {
  console.log('=== 讲师测试数据生成器 ===\n');

  // 1. 新增专长
  console.log('[1/3] 新增专长标签 (6 个)...');
  for (const exp of NEW_EXPERTISES) {
    await prisma.instructorExpertise.upsert({
      where: { key: exp.key },
      create: { ...exp, isActive: true },
      update: { ...exp, isActive: true },
    });
  }
  console.log(`  ✓ 6 个新专长已就位 (现在共 ${await prisma.instructorExpertise.count()})`);

  // 2. 新增讲师
  console.log('\n[2/3] 新增讲师 (10 个, 9 已发布 + 1 草稿)...');
  const expertiseByKey = new Map(
    (await prisma.instructorExpertise.findMany({ select: { id: true, key: true } })).map(
      (e) => [e.key, e.id] as const,
    ),
  );
  for (const inst of NEW_INSTRUCTORS) {
    const { expertiseKeys, published, ...dataFields } = inst;
    // 草稿讲师 publishedAt=null, 已发布 = new Date()
    const publishedAt = published ? new Date() : null;
    const found = await prisma.instructor.findFirst({ where: { name: inst.name } });
    if (found) {
      // 已存在: 更新内容 (idempotent refresh)
      await prisma.instructor.update({
        where: { id: found.id },
        data: { ...dataFields, publishedAt },
      });
      console.log(`  ↻ 更新讲师: ${inst.name}${published ? '' : ' (草稿)'}`);
    } else {
      const created = await prisma.instructor.create({
        data: { ...dataFields, publishedAt },
      });
      console.log(`  ✓ 新建讲师: ${inst.name}${published ? '' : ' (草稿)'}`);
      // 挂专长
      for (let i = 0; i < expertiseKeys.length; i += 1) {
        const expertiseId = expertiseByKey.get(expertiseKeys[i]);
        if (!expertiseId) continue;
        await prisma.instructorExpertiseLink.upsert({
          where: {
            instructorId_expertiseId: {
              instructorId: created.id,
              expertiseId,
            },
          },
          create: { instructorId: created.id, expertiseId, orderIndex: i },
          update: { orderIndex: i },
        });
      }
    }
  }
  console.log(`  → 总讲师: ${await prisma.instructor.count()}`);

  // 3. 课程-讲师挂载 (idempotent: 已有 link 不重建, 补齐缺的)
  console.log('\n[3/3] 完善课程-讲师挂载 (含 1 个三讲师课程)...');
  for (const { courseTitle, links } of COURSE_INSTRUCTOR_LINKS) {
    const course = await prisma.course.findFirst({ where: { title: courseTitle } });
    if (!course) {
      console.log(`  ! 课程不存在: ${courseTitle}`);
      continue;
    }
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      const inst = await prisma.instructor.findFirst({ where: { name: link.instructorName } });
      if (!inst) {
        console.log(`  ! 讲师不存在: ${link.instructorName}`);
        continue;
      }
      // 唯一约束 (courseId, instructorId, role) → upsert
      await prisma.courseInstructorLink.upsert({
        where: {
          courseId_instructorId_role: {
            courseId: course.id,
            instructorId: inst.id,
            role: link.role,
          },
        },
        create: {
          courseId: course.id,
          instructorId: inst.id,
          role: link.role,
          isPrimary: link.isPrimary,
          orderIndex: i,
        },
        update: {
          isPrimary: link.isPrimary,
          orderIndex: i,
        },
      });
    }
    console.log(`  ✓ ${courseTitle}: ${links.length} 个讲师挂载`);
  }
  console.log(`  → 总课程-讲师挂载: ${await prisma.courseInstructorLink.count()}`);

  console.log('\n=== 完成 ===');
  console.log(`讲师: ${await prisma.instructor.count()} (含 ${await prisma.instructor.count({ where: { publishedAt: { not: null } } })} 已发布)`);
  console.log(`专长: ${await prisma.instructorExpertise.count()}`);
  console.log(`讲师-专长挂载: ${await prisma.instructorExpertiseLink.count()}`);
  console.log(`课程-讲师挂载: ${await prisma.courseInstructorLink.count()}`);
}

main()
  .catch((e) => {
    console.error('Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
