import { Injectable } from '@nestjs/common';
import { CourseOrigin, LearningProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

type HomeItem = {
  id: string;
  kind: 'platform' | 'ai_personal';
  title: string;
  progress: number;
  lastAccessedAt: string | null;
  continueHref: string;
};

type Cursor = { at: string | null; id: string };

@Injectable()
export class LearningHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getHome(userId: string, encodedCursor?: string) {
    const cursor = this.decodeCursor(encodedCursor);
    const aiEnabled = this.config.get<boolean>('AI_PERSONAL_COURSES_ENABLED') === true;
    const [projects, enrollments] = await Promise.all([
      aiEnabled ? this.prisma.learningProject.findMany({
        where: {
          userId,
          status: { not: LearningProjectStatus.archived },
        },
        orderBy: [{ lastAccessedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: {
          id: true,
          status: true,
          lastAccessedAt: true,
          activeLessonId: true,
          course: {
            select: {
              title: true,
            },
          },
        },
      }) : Promise.resolve([]),
      this.prisma.enrollment.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          course: { origin: CourseOrigin.platform },
        },
        take: 100,
        select: {
          id: true,
          enrolledAt: true,
          course: {
            select: {
              id: true,
              title: true,
              chapters: {
                where: { deletedAt: null },
                orderBy: { orderIndex: 'asc' },
                select: {
                  lessons: {
                    where: { deletedAt: null, isHidden: false },
                    orderBy: { orderIndex: 'asc' },
                    select: { id: true },
                  },
                },
              },
              progressRecords: {
                where: { userId },
                orderBy: { updatedAt: 'desc' },
                select: { lessonId: true, status: true, updatedAt: true },
              },
            },
          },
        },
      }),
    ]);

    const personal: HomeItem[] = projects.map((project) => ({
      id: project.id,
      kind: 'ai_personal',
      title: project.course.title,
      progress: project.status === LearningProjectStatus.completed ? 100 : 0,
      lastAccessedAt: project.lastAccessedAt?.toISOString() ?? null,
      continueHref: this.personalHref(project.id, project.activeLessonId, project.status),
    }));
    const platform: HomeItem[] = enrollments.flatMap((enrollment) => {
      if (!enrollment.course) return [];
      const lessonIds = enrollment.course.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id));
      const completed = enrollment.course.progressRecords.filter((record) => record.status === 'completed').length;
      const latest = enrollment.course.progressRecords[0];
      const nextLessonId = latest?.lessonId ?? lessonIds[0];
      return [{
        id: enrollment.course.id,
        kind: 'platform' as const,
        title: enrollment.course.title,
        progress: lessonIds.length ? Math.round((completed / lessonIds.length) * 100) : 0,
        lastAccessedAt: (latest?.updatedAt ?? enrollment.enrolledAt).toISOString(),
        continueHref: nextLessonId
          ? `/dashboard/learning/${enrollment.course.id}/${nextLessonId}`
          : `/courses/${enrollment.course.id}`,
      }];
    });
    const sorted = [...personal, ...platform]
      .sort((a, b) => this.compare(b, a))
      .filter((item) => !cursor || this.compare(item, cursor) < 0);
    const items = sorted.slice(0, 20);
    const last = items.at(-1);
    return {
      items,
      nextCursor: sorted.length > items.length && last
        ? Buffer.from(JSON.stringify({ at: last.lastAccessedAt, id: last.id })).toString('base64url')
        : null,
    };
  }

  private personalHref(id: string, lessonId: string | null, status: LearningProjectStatus) {
    if (status === LearningProjectStatus.planning || status === LearningProjectStatus.plan_ready || status === LearningProjectStatus.generating_first_lesson || status === LearningProjectStatus.failed) {
      return `/ai-courses/${id}/plan`;
    }
    return lessonId ? `/ai-courses/${id}/learn/${lessonId}` : `/ai-courses/${id}/learn`;
  }

  private compare(left: { lastAccessedAt: string | null; id: string } | HomeItem, right: Cursor | HomeItem) {
    const byTime = (left.lastAccessedAt ?? '').localeCompare('lastAccessedAt' in right ? right.lastAccessedAt ?? '' : right.at ?? '');
    return byTime || left.id.localeCompare(right.id);
  }

  private decodeCursor(value?: string): Cursor | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
      return typeof parsed.id === 'string' && (typeof parsed.at === 'string' || parsed.at === null)
        ? { id: parsed.id, at: parsed.at }
        : null;
    } catch {
      return null;
    }
  }
}
