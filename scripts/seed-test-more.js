const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const partner = await prisma.course.create({
    data: {
      title: 'SecondPlanet x 清华 大模型微调实战',
      description: 'SecondPlanet 与清华大学联合推出的企业级大模型微调课程，涵盖 LoRA、QLoRA、全参数微调等核心技术。',
      learningPoints: JSON.stringify(['掌握 LoRA 微调原理', '实现 QLoRA 低显存训练', '部署企业级推理服务']),
      instructor: '清华大学 · 刘知远团队',
      level: 'Advanced',
      duration: '18 小时',
      thumbnail: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=500&fit=crop',
      tags: JSON.stringify(['大模型', 'LoRA', 'QLoRA', '微调']),
      costType: 'paid',
      price: 599,
      courseType: 'partner',
      status: 'published',
      chapters: {
        create: [
          {
            title: '大模型微调概览',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '为什么需要微调',
                  orderIndex: 0,
                  isPreview: true,
                  videoUrl: 'https://www.bilibili.com/video/BVpartner1',
                  resources: { create: [] }
                }
              ]
            }
          }
        ]
      }
    }
  });
  console.log('Created partner course:', partner.id);

  const publicCourse = await prisma.course.create({
    data: {
      title: 'Andrej Karpathy: 从零构建 GPT',
      description: ' Andrej Karpathy 的经典公开课程，从零开始用 Python 和 PyTorch 构建一个 GPT 语言模型。',
      learningPoints: JSON.stringify(['理解 Transformer 架构', '实现自注意力机制', '训练一个小型语言模型']),
      instructor: 'Andrej Karpathy',
      level: 'Beginner',
      duration: '2 小时',
      thumbnail: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&h=500&fit=crop',
      tags: JSON.stringify(['GPT', 'Transformer', 'PyTorch', '公开课']),
      costType: 'free',
      price: 0,
      courseType: 'public',
      status: 'published',
      chapters: {
        create: [
          {
            title: '先导课',
            orderIndex: 0,
            lessons: {
              create: [
                {
                  title: '课程介绍',
                  orderIndex: 0,
                  isPreview: true,
                  videoUrl: 'https://www.bilibili.com/video/BVpublic1',
                  resources: { create: [] }
                }
              ]
            }
          }
        ]
      }
    }
  });
  console.log('Created public course:', publicCourse.id);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); });
