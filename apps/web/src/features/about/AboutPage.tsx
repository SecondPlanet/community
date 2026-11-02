import { ArrowRight, BookOpen, GraduationCap, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../../components/Seo';

const PRINCIPLES = [
  {
    icon: BookOpen,
    title: '以实践检验学习',
    description: '课程围绕真实任务组织，让知识最终落到可以展示和复用的作品。',
  },
  {
    icon: GraduationCap,
    title: '让能力可被验证',
    description: '通过课程进度、项目成果与证书，形成清晰、连续的成长记录。',
  },
  {
    icon: Users,
    title: '连接学习者与讲师',
    description: '同时服务学习者与讲师，让 AI 能力建设在社区里更容易协作。',
  },
] as const;

export function AboutPage() {
  return (
    <div className="bg-neutral-50 dark:bg-neutral-950 text-neutral-900">
      <Seo
        title="关于我们"
        description="SecondPlanet 致力于让 AI 时代的能力可学习、可实践、可验证。"
        path="/about"
      />

      <section className="border-b border-neutral-200 bg-neutral-0 dark:bg-neutral-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-neutral-600 mb-4">
            / About SecondPlanet
          </p>
          <h1 className="max-w-4xl text-4xl md:text-6xl font-black tracking-tight">
            让 AI 时代的能力
            <br />
            可学习、可实践、可验证
          </h1>
          <p className="max-w-2xl mt-6 text-base md:text-lg leading-8 text-neutral-600">
            SecondPlanet 是一个面向个人学习者的 AI 学习平台。我们把系统课程、实践项目、
            学位路径和行业活动连接起来，帮助学习者把“知道”真正变成“会做”。
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-8">我们坚持的三件事</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {PRINCIPLES.map(({ icon: Icon, title, description }) => (
            <article key={title} className="border border-neutral-200 bg-neutral-0 dark:bg-neutral-100 p-6">
              <Icon className="w-6 h-6 mb-8" aria-hidden="true" />
              <h3 className="text-lg font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">{description}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/courses"
            className="inline-flex min-h-12 items-center gap-2 bg-[#171717] text-white px-5 py-3 text-sm font-black"
          >
            浏览课程 <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
