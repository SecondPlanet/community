import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, ExternalLink, Github, Linkedin, Star, Users } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { QueryErrorState } from '../../components/QueryErrorState';
import { Seo } from '../../components/Seo';
import { Skeleton } from '../../components/ui/Skeleton';
import { instructorsApi } from '../../lib/instructorsApi';

export function InstructorDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const instructorQuery = useQuery({
    queryKey: ['instructor', slug],
    queryFn: () => instructorsApi.getBySlug(slug),
    enabled: Boolean(slug),
  });
  const instructor = instructorQuery.data;
  const statsQuery = useQuery({
    queryKey: ['instructor-stats', instructor?.id],
    queryFn: () => instructorsApi.getStats(instructor!.id),
    enabled: Boolean(instructor?.id),
  });

  if (instructorQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-16 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton variant="rectangle" className="h-52 w-full" />
      </div>
    );
  }
  if (instructorQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <QueryErrorState error={instructorQuery.error} onRetry={() => instructorQuery.refetch()} title="无法加载讲师信息" />
      </div>
    );
  }
  if (!instructor) return null;

  const courses = instructor.courseLinks.filter((link) => link.course.status === 'published');
  const stats = statsQuery.data;
  const socials = [
    { href: instructor.linkedinUrl, label: 'LinkedIn', icon: Linkedin },
    { href: instructor.githubUrl, label: 'GitHub', icon: Github },
    { href: instructor.websiteUrl, label: '个人网站', icon: ExternalLink },
  ].filter((item): item is { href: string; label: string; icon: typeof Linkedin } => Boolean(item.href));

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <Seo
        title={`${instructor.name} · 讲师`}
        description={instructor.headline ?? instructor.bio ?? `${instructor.name} 的讲师主页`}
        path={`/instructors/${instructor.slug}`}
      />
      <section className="border-b border-neutral-200 bg-neutral-0">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <Link to="/courses" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> 返回课程
          </Link>
          <div className="mt-8 grid gap-8 md:grid-cols-[160px_1fr] md:items-start">
            <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl bg-[#171717] text-5xl font-black text-white">
              {instructor.avatarUrl ? (
                <img src={instructor.avatarUrl} alt={`${instructor.name} 的头像`} className="h-full w-full object-cover" />
              ) : (
                instructor.name.charAt(0)
              )}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-neutral-500">/ Instructor</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">{instructor.name}</h1>
              <p className="mt-2 text-lg text-neutral-600">
                {[instructor.title, instructor.company].filter(Boolean).join(' · ')}
              </p>
              {instructor.headline && <p className="mt-5 max-w-3xl leading-7">{instructor.headline}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                {instructor.expertiseLinks.map(({ expertise }) => (
                  <span key={expertise.id} className="rounded-full bg-[#EEEDE9] px-3 py-1 text-xs font-semibold">
                    {expertise.label}
                  </span>
                ))}
              </div>
              {socials.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {socials.map(({ href, label, icon: Icon }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 border border-neutral-200 px-3 py-2 text-sm hover:border-[#171717]">
                      <Icon className="h-4 w-4" /> {label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {statsQuery.isError ? (
          <div className="border border-warning-500 bg-warning-50 text-warning-600 px-4 py-3 text-sm">
            统计信息暂时无法加载, 请稍后再试。
          </div>
        ) : stats ? (
          <section className="grid grid-cols-2 gap-px overflow-hidden border border-neutral-200 bg-neutral-200 md:grid-cols-4">
            <Metric icon={BookOpen} label="课程" value={String(stats.courseCount)} />
            <Metric icon={Users} label="学习人次" value={stats.studentCount.toLocaleString()} />
            <Metric icon={Star} label="平均评分" value={stats.reviewCount ? stats.averageRating.toFixed(1) : '暂无'} />
            <Metric icon={Users} label="完成率" value={`${Math.round(stats.completionRate * 100)}%`} />
          </section>
        ) : null}

        {instructor.bio && (
          <section className="mt-12 max-w-3xl">
            <h2 className="text-2xl font-black">讲师简介</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-600">{instructor.bio}</p>
          </section>
        )}

        <section className="mt-12">
          <h2 className="text-2xl font-black">相关课程</h2>
          {courses.length ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map(({ course, role }) => (
                <Link key={`${course.id}-${role}`} to={`/courses/${course.id}`} className="group border border-neutral-200 bg-neutral-0 p-5 hover:border-[#171717]">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">
                    {role === 'mentor' ? '导师' : '主讲'} · {course.level}
                  </p>
                  <h3 className="mt-3 text-lg font-bold group-hover:underline">{course.title}</h3>
                  <p className="mt-3 text-sm text-neutral-600">{course.duration}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState icon={<BookOpen className="h-5 w-5" />} title="暂无公开课程" description="讲师的公开课程上线后会展示在这里。" />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="bg-neutral-0 p-5">
      <Icon className="h-5 w-5" />
      <div className="mt-5 text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );
}
