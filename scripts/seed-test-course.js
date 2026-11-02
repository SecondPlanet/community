const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const course = await prisma.course.create({
    data: {
      title: 'Google DeepMind 强化学习导论',
      description: '来自 Google DeepMind 官方团队的强化学习基础课程，涵盖 Q-Learning、策略梯度等核心算法，适合有 Python 基础的初学者。',
      learningPoints: JSON.stringify(['理解马尔可夫决策过程', '掌握 Q-Learning 算法', '实现 DQN 与 Policy Gradient']),
      instructor: 'DeepMind 团队',
      level: 'Intermediate',
      duration: '12 小时',
      thumbnail: 'https://i.ytimg.com/vi/Example/maxresdefault.jpg',
      tags: JSON.stringify(['强化学习', 'DeepMind', 'RL', 'Python']),
      costType: 'free',
      price: 0,
      courseType: 'third_party',
      externalUrl: 'https://www.youtube.com/playlist?list=PLqYmG7hTraZDM-OYHWgPebKoLCbTq3h3C',
      status: 'published',
      chapters: {
        create: [
          {
            title: '课程导览',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '什么是强化学习',
                  orderIndex: 0,
                  isPreview: true,
                  videoUrl: 'https://www.youtube.com/embed/Example1',
                  resources: { create: [] }
                }
              ]
            }
          },
          {
            title: 'Q-Learning 基础',
            orderIndex: 1,
            lessons: {
              create: [
                {
                  title: '贝尔曼方程',
                  orderIndex: 0,
                  isPreview: false,
                  videoUrl: 'https://www.youtube.com/embed/Example2',
                  resources: { create: [] }
                }
              ]
            }
          }
        ]
      }
    }
  });
  console.log('Created test course:', course.id);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); });
