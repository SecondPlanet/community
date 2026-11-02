import { PrismaClient, UserRole, CourseLevel, CostType, CourseStatus, HackathonStatus, RegistrationStatus, TeamRole, SubmissionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seed() {
  const isProduction = process.env.NODE_ENV === 'production';
  const requireStrongSeedPassword = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value || value.length < 16 || /password|change-me|placeholder/i.test(value)) {
      throw new Error(`${name} must be a non-placeholder password of at least 16 characters`);
    }
    return value;
  };

  if (isProduction) {
    // Production bootstrap is allowed exactly once, on an empty business DB.
    // Never turn the development cleanup below into an accidental data reset.
    const [users, courses, degrees, hackathons, enrollments, orders] = await Promise.all([
      prisma.user.count(),
      prisma.course.count(),
      prisma.nanoDegree.count(),
      prisma.hackathon.count(),
      prisma.enrollment.count(),
      prisma.order.count(),
    ]);
    if (users + courses + degrees + hackathons + enrollments + orders > 0) {
      throw new Error('Production seed refused: business data already exists');
    }
  } else {
    // Development-only reset keeps local demo data reproducible.
    await prisma.$transaction([
      prisma.submission.deleteMany(),
      prisma.teamMember.deleteMany(),
      prisma.team.deleteMany(),
      prisma.judge.deleteMany(),
      prisma.announcement.deleteMany(),
      prisma.hackathonRegistration.deleteMany(),
      prisma.hackathon.deleteMany(),
      prisma.resource.deleteMany(),
      prisma.lesson.deleteMany(),
      prisma.chapter.deleteMany(),
      prisma.degreeCourse.deleteMany(),
      prisma.enrollment.deleteMany(),
      prisma.order.deleteMany(),
      prisma.progressRecord.deleteMany(),
      prisma.course.deleteMany(),
      prisma.nanoDegree.deleteMany(),
      prisma.refreshToken.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  // Create admin user
  const adminPassword = await bcrypt.hash(
    isProduction ? requireStrongSeedPassword('ADMIN_INITIAL_PASSWORD') : 'admin123',
    12,
  );
  const admin = await prisma.user.create({
    data: {
      email: isProduction
        ? process.env.ADMIN_EMAIL?.trim() || 'admin@secondplanet.local'
        : 'admin@secondplanet.local',
      passwordHash: adminPassword,
      name: 'SecondPlanet Admin',
      role: UserRole.admin,
      passwordResetRequired: true,
    },
  });

  // Demo 主管理员 (README §7 演示指南承诺的账号,setup-demo.sh / seed-demo.ts 都会输出这个)
  // 只在 dev 创建;production 不暴露 demo 账号
  if (!isProduction) {
    const demoEmail = 'admin@secondplanet.local';
    const demoExisting = await prisma.user.findUnique({ where: { email: demoEmail } });
    if (!demoExisting) {
      await prisma.user.create({
        data: {
          email: demoEmail,
          passwordHash: adminPassword,
          name: 'OpenCSG Admin',
          role: UserRole.admin,
          passwordResetRequired: false,
        },
      });
    }
  }

  // Create test student
  const studentPassword = await bcrypt.hash(
    isProduction ? requireStrongSeedPassword('SEED_STUDENT_PASSWORD') : '123456',
    12,
  );
  const student = await prisma.user.create({
    data: {
      email: isProduction
        ? process.env.SEED_STUDENT_EMAIL?.trim() || 'student@secondplanet.local'
        : 'student@secondplanet.local',
      passwordHash: studentPassword,
      name: '测试学员',
      role: UserRole.student,
      passwordResetRequired: isProduction,
    },
  });

  console.log('Seeding badges...');
  const badges = [
    { code: 'first_enrollment', name: '启航者', description: '首次报名课程，开启学习之旅', icon: 'rocket', category: 'milestone', criteriaType: 'first_enrollment' as const, criteriaValue: 1, points: 20, isActive: true, orderIndex: 1 },
    { code: 'first_lesson', name: '初窥门径', description: '完成第一个课时', icon: 'book-open', category: 'learning', criteriaType: 'lessons_completed' as const, criteriaValue: 1, points: 10, isActive: true, orderIndex: 2 },
    { code: 'course_master', name: '课程大师', description: '完整完成一门课程的所有课时', icon: 'trophy', category: 'milestone', criteriaType: 'course_completed' as const, criteriaValue: 1, points: 50, isActive: true, orderIndex: 3 },
    { code: 'knowledge_seeker', name: '求知者', description: '累计完成 10 个课时', icon: 'graduation-cap', category: 'learning', criteriaType: 'lessons_completed' as const, criteriaValue: 10, points: 30, isActive: true, orderIndex: 4 },
    { code: 'knowledge_veteran', name: '资深学习者', description: '累计完成 50 个课时', icon: 'library', category: 'learning', criteriaType: 'lessons_completed' as const, criteriaValue: 50, points: 100, isActive: true, orderIndex: 5 },
    { code: 'week_streak', name: '坚持一周', description: '连续 7 天保持学习', icon: 'flame', category: 'streak', criteriaType: 'streak_days' as const, criteriaValue: 7, points: 40, isActive: true, orderIndex: 6 },
    { code: 'month_streak', name: '学习达人', description: '连续 30 天保持学习', icon: 'zap', category: 'streak', criteriaType: 'streak_days' as const, criteriaValue: 30, points: 150, isActive: true, orderIndex: 7 },
    { code: 'practice_beginner', name: '动手实践', description: '完成第一个实践项目', icon: 'wrench', category: 'milestone', criteriaType: 'practice_completed' as const, criteriaValue: 1, points: 30, isActive: true, orderIndex: 8 },
    { code: 'points_100', name: '积分破百', description: '累计获得 100 积分', icon: 'star', category: 'milestone', criteriaType: 'points_reached' as const, criteriaValue: 100, points: 0, isActive: true, orderIndex: 9 },
    { code: 'points_500', name: '积分达人', description: '累计获得 500 积分', icon: 'crown', category: 'milestone', criteriaType: 'points_reached' as const, criteriaValue: 500, points: 0, isActive: true, orderIndex: 10 },
  ];
  for (const badge of badges) {
    await prisma.badge.upsert({ where: { code: badge.code }, update: badge, create: badge });
  }

  // Create sample courses
  const courseInputs = [
    {
      title: '数字机密：安全基础',
      description: '好奇密码是如何工作的吗？学习如何在线保护你的数据安全。',
      learningPoints: JSON.stringify(['理解公钥与私钥加密机制', '掌握密码管理器的使用与双因素认证', '识别网络钓鱼与社会工程学攻击', '基础的网络流量分析与隐私保护']),
      instructor: 'Alice 博士',
      level: CourseLevel.Beginner,
      duration: '45 分钟',
      thumbnail: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20SEC%3C/text%3E%3C/svg%3E',
      tags: JSON.stringify(['安全', '适合所有人']),
      costType: CostType.free,
      price: 0,
      status: CourseStatus.published,
      chapters: {
        create: [
          {
            title: '第一章：安全基础',
            description: '了解基本安全概念',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '1.1 为什么安全很重要',
                  description: '介绍数字安全的重要性',
                  videoUrl: 'https://www.youtube.com/embed/36YgDDJ7Xsc',
                  orderIndex: 0,
                  isPreview: true,
                  resources: {
                    create: [
                      ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      title: '全民 AI',
      description: '揭开人工智能的神秘面纱。',
      learningPoints: JSON.stringify(['大型语言模型 (LLM) 的基本原理', '提示词工程 (Prompt Engineering) 入门', 'AI 在创意写作与图像生成中的应用', '人工智能的局限性与偏见']),
      instructor: '陈思远',
      level: CourseLevel.Beginner,
      duration: '60 分钟',
      thumbnail: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23262626%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20AI-EASY%3C/text%3E%3C/svg%3E',
      tags: JSON.stringify(['AI', '概念', '未来']),
      costType: CostType.free,
      price: 0,
      status: CourseStatus.published,
      chapters: {
        create: [
          {
            title: '第 1 章：AI 是什么',
            description: '从图灵测试到现代大模型',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '1.1 智能的定义与图灵测试',
                  description: '什么是"智能"？',
                  videoUrl: 'https://www.youtube.com/embed/aircAruvnKk',
                  videoDuration: 1200,
                  orderIndex: 0,
                  isPreview: true,
                  resources: {
                    create: [
                      { title: '推荐阅读：AI 简史', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                      { title: '相关论文集合', url: 'https://github.com/SecondPlanet/community', type: 'link' as const },
                    ],
                  },
                },
                {
                  title: '1.2 大语言模型是如何工作的',
                  description: 'Transformer 与注意力机制',
                  videoUrl: 'https://www.youtube.com/embed/aircAruvnKk',
                  videoDuration: 1500,
                  orderIndex: 1,
                  isPreview: false,
                  resources: {
                    create: [
                      { title: 'Transformer 架构图解', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                    ],
                  },
                },
              ],
            },
          },
          {
            title: '第 2 章：动手玩 AI',
            description: '从提示词开始',
            orderIndex: 1,
            lessons: {
              create: [
                {
                  title: '2.1 提示词工程基础',
                  description: '如何与 AI 对话',
                  videoUrl: 'https://www.youtube.com/embed/aircAruvnKk',
                  videoDuration: 1100,
                  orderIndex: 0,
                  isPreview: false,
                  resources: {
                    create: [
                      { title: '提示词模板库', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                      { title: '示例代码仓库', url: 'https://github.com/SecondPlanet/community', type: 'code' as const },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      title: '构建你的第一个网站',
      description: '在互联网上创造属于你的一角。',
      learningPoints: JSON.stringify(['HTML5 语义化标签结构', 'CSS3 布局与 Flexbox', '响应式设计基础 (Mobile First)', '使用 Git 进行版本控制与部署']),
      instructor: '李奕辰',
      level: CourseLevel.Beginner,
      duration: '45 分钟',
      thumbnail: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20WEB%3C/text%3E%3C/svg%3E',
      tags: JSON.stringify(['创意', '设计', 'Web']),
      costType: CostType.paid,
      price: 49.99,
      status: CourseStatus.published,
      chapters: {
        create: [
          {
            title: '第 1 章：HTML 入门',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '1.1 你的第一个网页',
                  description: 'Hello, World!',
                  videoUrl: 'https://www.youtube.com/embed/HD13eqQW3as',
                  videoDuration: 900,
                  orderIndex: 0,
                  isPreview: true,
                  resources: {
                    create: [
                      { title: 'HTML 速查表', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                    ],
                  },
                },
              ],
            },
          },
          {
            title: '第 2 章：CSS 美化',
            orderIndex: 1,
            lessons: {
              create: [
                {
                  title: '2.1 选择器与盒模型',
                  videoUrl: 'https://www.youtube.com/embed/HD13eqQW3as',
                  videoDuration: 1300,
                  orderIndex: 0,
                  isPreview: false,
                  resources: {
                    create: [
                      { title: '示例 CSS 代码', url: 'https://github.com/SecondPlanet/community', type: 'code' as const },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      title: 'Python：友好的编程语言',
      description: '用 Python 开启你的编程之旅。',
      learningPoints: JSON.stringify(['Python 基础语法与变量', '控制流：循环与条件判断', '函数式编程初步', '使用第三方库处理文件与网络请求']),
      instructor: '周子墨',
      level: CourseLevel.Beginner,
      duration: '90 分钟',
      thumbnail: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%232C2A26%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20PYTHON%3C/text%3E%3C/svg%3E',
      tags: JSON.stringify(['编程', 'Python', '逻辑']),
      costType: CostType.paid,
      price: 59.99,
      status: CourseStatus.published,
      chapters: {
        create: [
          {
            title: '第 1 章：基础语法',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '1.1 变量与数据类型',
                  videoUrl: 'https://www.youtube.com/embed/r-uOLxNrNk8',
                  videoDuration: 1500,
                  orderIndex: 0,
                  isPreview: true,
                  resources: {
                    create: [
                      { title: 'Python 语法速查', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                      { title: '示例代码', url: 'https://github.com/SecondPlanet/community', type: 'code' as const },
                    ],
                  },
                },
                {
                  title: '1.2 控制流',
                  videoUrl: 'https://www.youtube.com/embed/r-uOLxNrNk8',
                  videoDuration: 1700,
                  orderIndex: 1,
                  isPreview: false,
                  resources: {
                    create: [
                      { title: '课后习题', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                    ],
                  },
                },
              ],
            },
          },
          {
            title: '第 2 章：函数与模块',
            orderIndex: 1,
            lessons: {
              create: [
                {
                  title: '2.1 函数基础',
                  videoUrl: 'https://www.youtube.com/embed/r-uOLxNrNk8',
                  videoDuration: 1400,
                  orderIndex: 0,
                  isPreview: false,
                  resources: {
                    create: [
                      { title: '函数练习集', url: 'https://github.com/SecondPlanet/community', type: 'code' as const },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      title: '白帽黑客：数字防御',
      description: '通过了解黑客的思维方式来保护自己。',
      learningPoints: JSON.stringify(['Linux 命令行基础', '常见 Web 漏洞 (SQL 注入, XSS)', '网络嗅探与分析', '道德黑客的法律边界']),
      instructor: '赵启航',
      level: CourseLevel.Intermediate,
      duration: '55 分钟',
      thumbnail: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20HACK%3C/text%3E%3C/svg%3E',
      tags: JSON.stringify(['安全', '防御']),
      costType: CostType.paid,
      price: 79.99,
      status: CourseStatus.published,
      chapters: {
        create: [
          {
            title: '第 1 章：Linux 命令行',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '1.1 终端入门',
                  videoUrl: 'https://www.youtube.com/embed/IVquJ3NS81Q',
                  videoDuration: 1300,
                  orderIndex: 0,
                  isPreview: true,
                  resources: {
                    create: [
                      { title: '常用命令速查', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                    ],
                  },
                },
              ],
            },
          },
          {
            title: '第 2 章：常见 Web 漏洞',
            orderIndex: 1,
            lessons: {
              create: [
                {
                  title: '2.1 SQL 注入与防御',
                  videoUrl: 'https://www.youtube.com/embed/IVquJ3NS81Q',
                  videoDuration: 1500,
                  orderIndex: 0,
                  isPreview: false,
                  resources: {
                    create: [
                      { title: '漏洞演示代码', url: 'https://github.com/SecondPlanet/community', type: 'code' as const },
                      { title: 'OWASP 漏洞清单', url: 'https://owasp.org/www-project-top-ten/', type: 'link' as const },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      title: '云图：理解云计算',
      description: '你的照片到底存哪儿了？了解驱动现代世界的全球计算机网络。',
      learningPoints: JSON.stringify(['IaaS, PaaS, SaaS 的区别', '虚拟化与容器技术 (Docker 简介)', '无服务器架构 (Serverless)', '云端数据库与存储']),
      instructor: '林晓峰',
      level: CourseLevel.Beginner,
      duration: '30 分钟',
      thumbnail: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23262626%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20CLOUD%3C/text%3E%3C/svg%3E',
      tags: JSON.stringify(['基础设施', '概念']),
      costType: CostType.free,
      price: 0,
      status: CourseStatus.published,
      chapters: {
        create: [
          {
            title: '第 1 章：云的三种形态',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '1.1 IaaS / PaaS / SaaS',
                  videoUrl: 'https://www.youtube.com/embed/aK4N1-CJkVc',
                  videoDuration: 900,
                  orderIndex: 0,
                  isPreview: true,
                  resources: {
                    create: [
                      { title: '云服务对比表', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                    ],
                  },
                },
              ],
            },
          },
          {
            title: '第 2 章：容器与编排',
            orderIndex: 1,
            lessons: {
              create: [
                {
                  title: '2.1 Docker 简介',
                  videoUrl: 'https://www.youtube.com/embed/aK4N1-CJkVc',
                  videoDuration: 1100,
                  orderIndex: 0,
                  isPreview: false,
                  resources: {
                    create: [
                      { title: 'Docker 命令清单', url: 'https://github.com/SecondPlanet/community', type: 'pdf' as const },
                      { title: '示例 Dockerfile', url: 'https://github.com/SecondPlanet/community', type: 'code' as const },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ];

  const courses = [];
  for (const data of courseInputs) {
    const course = await prisma.course.create({ data });
    courses.push(course);
  }

  // 同步把 Course.instructor 字符串落为 Instructor 记录 + 主讲师 link,
  // 否则 /instructors 公开页为空库而课程却挂着讲师名(报告 D04)
  {
    const { createHash } = await import('crypto');
    const slugify = (name: string) => {
      const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return ascii ? ascii.slice(0, 40) : `i-${createHash('sha1').update(name).digest('hex').slice(0, 4)}`;
    };
    const seenSlugs = new Set<string>();
    for (const course of courses) {
      const name = (course.instructor ?? '').trim();
      if (!name) continue;
      let instructor = await prisma.instructor.findFirst({ where: { name: { equals: name } } });
      if (!instructor) {
        let slug = slugify(name);
        let suffix = 0;
        while (seenSlugs.has(slug) || await prisma.instructor.findUnique({ where: { slug } })) {
          suffix += 1;
          slug = `${slugify(name)}-${suffix}`;
        }
        seenSlugs.add(slug);
        instructor = await prisma.instructor.create({
          data: { slug, name, publishedAt: new Date(), orderIndex: 0 },
        });
      }
      await prisma.courseInstructorLink.create({
        data: { courseId: course.id, instructorId: instructor.id, role: 'instructor', isPrimary: true, orderIndex: 0 },
      });
    }
  }

  // Create sample nano degrees
  const degreeInputs = [
    {
      title: '数字安全卫士',
      description: '成为每个人都信赖的技术守护者。',
      learningPoints: JSON.stringify(['构建个人与企业的数字防御体系', '掌握基础渗透测试工具', '分析并响应网络安全事件', '获得 SecondPlanet 认证初级安全分析师资格']),
      price: 399,
      icon: 'shield',
      costType: CostType.paid,
      status: CourseStatus.published,
    },
    {
      title: '未来科技探索者',
      description: '从理解 AI 到编写你的第一行代码。',
      learningPoints: JSON.stringify(['熟练使用 Generative AI 工具提升效率', '掌握 Python 编程基础', '理解云计算与互联网基础设施', '培养计算思维与解决问题的能力']),
      price: 499,
      icon: 'sparkles',
      costType: CostType.paid,
      status: CourseStatus.published,
    },
  ];

  const degrees = [];
  for (const data of degreeInputs) {
    const degree = await prisma.nanoDegree.create({ data });
    degrees.push(degree);
  }

  // Link courses to degrees
  await prisma.degreeCourse.createMany({
    data: [
      { degreeId: degrees[0].id, courseId: courses[0].id, orderIndex: 0 },
      { degreeId: degrees[0].id, courseId: courses[4].id, orderIndex: 1 },
      { degreeId: degrees[1].id, courseId: courses[1].id, orderIndex: 0 },
      { degreeId: degrees[1].id, courseId: courses[3].id, orderIndex: 1 },
      { degreeId: degrees[1].id, courseId: courses[5].id, orderIndex: 2 },
    ],
  });

  console.log('Seeding hackathons...');

  const now = new Date();
  const addDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
  const addHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  const hackathonsData = [
    {
      title: 'AI Agent 创意马拉松',
      description: '在 48 小时内，基于大模型能力构建一个能解决实际问题的 AI Agent。\n\n赛道包括：个人效率助手、企业流程自动化、创意内容生成。',
      bannerUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20AGENT-HACK%3C/text%3E%3C/svg%3E',
      registrationUrl: 'https://github.com/SecondPlanet',
      registrationLabel: '立即报名',
      status: HackathonStatus.upcoming,
      startDate: addDays(7),
      endDate: addDays(9),
      registerDeadline: addDays(6),
      submissionDeadline: addDays(9),
      minTeamSize: 2,
      maxTeamSize: 4,
      location: '线上',
      rules: '1. 所有代码需在比赛期间编写\n2. 允许使用开源框架与 API\n3. 最终提交需包含 Demo 视频与仓库链接',
      submissionRequirements: '可访问的作品 Demo 链接\n代码仓库链接（含 README）\n3 分钟以内演示视频\n作品说明与团队成员信息',
      prizes: '一等奖：¥10,000\n二等奖：¥5,000\n三等奖：¥2,000',
    },
    {
      title: 'LLM 应用开发大赛',
      description: '从 0 到 1 打造基于大语言模型的创新应用，展示你的工程与产品能力。',
      bannerUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23262626%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20LLM-APP%3C/text%3E%3C/svg%3E',
      registrationUrl: 'https://github.com/SecondPlanet',
      registrationLabel: '前往参赛页',
      status: HackathonStatus.active,
      startDate: addDays(-1),
      endDate: addDays(2),
      registerDeadline: addHours(-2),
      submissionDeadline: addDays(2),
      minTeamSize: 1,
      maxTeamSize: 5,
      location: '北京 + 线上',
      rules: '1. 必须使用至少一种开源 LLM\n2. 提交需包含可运行的 Demo\n3. 评委由技术与产品专家组成',
      submissionRequirements: '线上可访问的 Demo\n代码仓库或技术方案\n使用的模型与数据说明\n产品演示视频',
      prizes: '最佳应用：¥15,000\n最佳创意：¥8,000\n最佳技术实现：¥5,000',
    },
    {
      title: '多模态 Hackathon',
      description: '探索文本、图像、音频与视频的跨模态 AI 能力，创造下一代多模态体验。',
      bannerUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20MULTIMODAL%3C/text%3E%3C/svg%3E',
      registrationUrl: 'https://github.com/SecondPlanet',
      status: HackathonStatus.judging,
      startDate: addDays(-5),
      endDate: addDays(-2),
      registerDeadline: addDays(-6),
      submissionDeadline: addDays(-2),
      minTeamSize: 2,
      maxTeamSize: 3,
      location: '上海',
      rules: '1. 作品需体现至少两种模态的融合\n2. 提交 3 分钟演示视频\n3. 允许使用预训练模型',
      submissionRequirements: '多模态作品 Demo\n代码仓库链接\n3 分钟演示视频\n技术架构说明',
      prizes: '金奖：¥12,000\n银奖：¥6,000\n铜奖：¥3,000',
    },
    {
      title: '开源模型微调挑战',
      description: '使用公开数据集对开源大模型进行微调，在指定评测任务上取得最好效果。',
      bannerUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20FINETUNE%3C/text%3E%3C/svg%3E',
      registrationUrl: 'https://github.com/SecondPlanet',
      status: HackathonStatus.finished,
      startDate: addDays(-45),
      endDate: addDays(-30),
      registerDeadline: addDays(-46),
      submissionDeadline: addDays(-30),
      minTeamSize: 1,
      maxTeamSize: 3,
      location: '线上',
      rules: '1. 模型需基于开源许可\n2. 提交训练代码与模型权重\n3. 在隐藏测试集上自动评分',
      submissionRequirements: '训练代码与配置\n模型权重或模型地址\n评测结果\n复现说明',
      prizes: '冠军：¥20,000\n亚军：¥10,000\n季军：¥5,000',
    },
    {
      title: 'RAG 系统构建赛',
      description: '为企业知识库场景构建高效、准确的 RAG（检索增强生成）系统。',
      bannerUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20RAG%3C/text%3E%3C/svg%3E',
      registrationUrl: 'https://github.com/SecondPlanet',
      status: HackathonStatus.upcoming,
      startDate: addDays(14),
      endDate: addDays(16),
      registerDeadline: addDays(13),
      submissionDeadline: addDays(16),
      minTeamSize: 2,
      maxTeamSize: 5,
      location: '深圳',
      rules: '1. 使用指定评测数据集\n2. 允许使用任意向量数据库与重排模型\n3. 需提交技术方案文档',
      submissionRequirements: '可运行的 RAG Demo\n代码仓库链接\n技术方案文档\n评测结果与成本说明',
      prizes: '一等奖：¥10,000\n二等奖：¥5,000\n三等奖：¥2,000',
    },
    {
      title: 'AI 教育工具创新赛',
      description: '设计面向 K12 或职场学习的 AI 教育工具，让知识传递更高效。',
      bannerUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27800%27%20height%3D%27400%27%3E%3Crect%20width%3D%27800%27%20height%3D%27400%27%20fill%3D%27%23171717%27/%3E%3Crect%20x%3D%2724%27%20y%3D%2724%27%20width%3D%27752%27%20height%3D%27352%27%20fill%3D%27none%27%20stroke%3D%27%23F5F4F0%27%20stroke-width%3D%272%27/%3E%3Ctext%20x%3D%2748%27%20y%3D%27208%27%20font-family%3D%27monospace%27%20font-size%3D%2728%27%20fill%3D%27%23F5F4F0%27%20letter-spacing%3D%278%27%3ESECONDPLANET%3C/text%3E%3Ctext%20x%3D%2748%27%20y%3D%27244%27%20font-family%3D%27monospace%27%20font-size%3D%2714%27%20fill%3D%27%23A8A6A0%27%20letter-spacing%3D%274%27%3ECOURSE%20COVER%20%C2%B7%20EDU-AI%3C/text%3E%3C/svg%3E',
      registrationUrl: 'https://github.com/SecondPlanet',
      status: HackathonStatus.cancelled,
      startDate: addDays(21),
      endDate: addDays(23),
      registerDeadline: addDays(14),
      submissionDeadline: addDays(23),
      minTeamSize: 1,
      maxTeamSize: 4,
      location: '线上',
      rules: '1. 作品需有明确的教育场景\n2. 提交原型与教学设计说明\n3. 允许组队或 solo',
      submissionRequirements: '产品原型或 Demo\n教学设计说明\n代码仓库或交付物\n3 分钟演示视频',
      prizes: '最佳教育产品：¥8,000\n最具潜力奖：¥4,000',
    },
  ];

  for (const h of hackathonsData) {
    const hackathon = await prisma.hackathon.create({
      data: {
        ...h,
        organizerId: admin.id,
        judges: {
          create: [
            { name: '李明', title: 'SecondPlanet 技术总监', bio: '专注大模型工程化落地 10 年。' },
            { name: 'Sarah Chen', title: 'AI 产品经理', bio: '曾主导多款百万用户级 AI 产品。' },
          ],
        },
        announcements: {
          create: [
            { title: '比赛正式启动', content: '欢迎大家报名参赛！', isPinned: true },
            { title: '常见问题 FAQ', content: '请查看官网 FAQ 页面了解组队、提交等规则。', isPinned: false },
          ],
        },
      },
    });

    if (
      h.status === HackathonStatus.active ||
      h.status === HackathonStatus.judging ||
      h.status === HackathonStatus.finished
    ) {
      const team = await prisma.team.create({
        data: {
          hackathonId: hackathon.id,
          name: `${h.title} 先锋队`,
          slogan: '用 AI 改变世界',
          captainId: student.id,
          members: {
            create: [{ userId: student.id, role: TeamRole.captain }],
          },
        },
      });

      await prisma.submission.create({
        data: {
          hackathonId: hackathon.id,
          teamId: team.id,
          userId: student.id,
          title: `${h.title} 作品示例`,
          description: '这是一个示例作品，用于展示提交格式。',
          demoUrl: 'https://github.com/SecondPlanet',
          repoUrl: 'https://github.com/SecondPlanet/community',
          status: h.status === HackathonStatus.finished ? SubmissionStatus.winner : SubmissionStatus.submitted,
          submittedAt: h.endDate,
          score: h.status === HackathonStatus.finished ? 92.5 : null,
          feedback: h.status === HackathonStatus.finished ? '创意出色，技术实现完整。' : null,
        },
      });
    }
  }

  console.log('✅ Seed completed');
  console.log(`Admin: ${admin.email}`);
  console.log(`Student: ${student.email}`);
  console.log(`Courses: ${courses.length}`);
  console.log(`Degrees: ${degrees.length}`);
  console.log(`Hackathons: ${hackathonsData.length}`);
}

export async function closeSeedConnection() {
  await prisma.$disconnect();
}

if (require.main === module) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(closeSeedConnection);
}
