import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDegreeDto, UpdateDegreeDto, LinkCoursesDto } from './degrees.dto';
import { CourseStatus } from '@prisma/client';
import { PUBLIC_COURSE_WHERE } from '../../common/course-access/course-access-policy.service';

@Injectable()
export class DegreesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private degreeInclude = (publicCoursesOnly: boolean) => ({
    courses: {
      where: publicCoursesOnly ? { course: PUBLIC_COURSE_WHERE } : undefined,
      include: {
        course: {
          include: {
            chapters: {
              select: { id: true, lessons: { select: { id: true } } },
              orderBy: { orderIndex: 'asc' as const },
            },
            // 仅计数用: 不选 userId(防泄露学员 ID), 过滤已退/退款报名
            enrollments: {
              where: { deletedAt: null },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { orderIndex: 'asc' as const },
    },
  });

  async findAll(params: {
    status?: CourseStatus;
    search?: string;
    includePrivateCourses?: boolean;
  }) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search } },
        { description: { contains: params.search } },
      ];
    }

    const degrees = await this.prisma.nanoDegree.findMany({
      where,
      include: this.degreeInclude(!params.includePrivateCourses),
      orderBy: { createdAt: 'desc' },
      // P1-7 防御: 默认 50, max 100, 防 DoS
      take: 100,
    });
    return degrees.map((d) => this.shapeDegree(d));
  }

  async findOne(id: string, includeDraft = false) {
    const degree = await this.prisma.nanoDegree.findFirst({
      where: {
        id,
        ...(includeDraft ? {} : { status: 'published' }),
      },
      include: this.degreeInclude(!includeDraft),
    });
    if (!degree) throw new NotFoundException('Degree not found');
    return this.shapeDegree(degree);
  }

  /**
   * 把学位塑造成"学习路径"形状：
   * - 顶层有 stats（课程数、总课时、估算时长、学员数）
   * - 课程按 orderIndex 编号，带 moduleCount / lessonCount / duration
   */
  private shapeDegree(degree: any) {
    const courses = (degree.courses ?? []).map((link: any, idx: number) => {
      const c = link.course;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        thumbnail: c.thumbnail,
        level: c.level,
        duration: c.duration,
        instructor: c.instructor,
        tags: c.tags,
        costType: c.costType,
        price: c.price,
        orderIndex: link.orderIndex,
        stepNumber: idx + 1,
        moduleCount: c.chapters?.length ?? 0,
        lessonCount: c.chapters?.reduce((sum: number, ch: any) => sum + (ch.lessons?.length ?? 0), 0) ?? 0,
        // Deprecated compatibility fields. New clients should use moduleCount/lessonCount.
        chapterCount: c.chapters?.length ?? 0,
        learnerCount: c.enrollments?.length ?? 0,
      };
    });

    const totalLessons = courses.reduce(
      (sum: number, c: any) => sum + c.lessonCount,
      0,
    );
    const totalLearners = courses.reduce(
      (sum: number, c: any) => sum + c.learnerCount,
      0,
    );

    // 原始 courses 关联(含 chapters/enrollments 明细)不下发, 只保留塑形后的 courses
    const { courses: _rawCourses, ...degreeFields } = degree;
    return {
      ...degreeFields,
      courses,
      stats: {
        courseCount: courses.length,
        totalLessons,
        // Deprecated compatibility field. New clients should use totalLessons.
        totalChapters: courses.reduce((sum: number, c: any) => sum + c.chapterCount, 0),
        totalLearners,
        estimatedHours: Math.max(courses.length * 4, 1),
      },
    };
  }

  async create(dto: CreateDegreeDto) {
    // 创建时可直接带课程绑定, 与学位在同事务内原子写入, 避免前端
    // 「创建成功但绑定失败」留下无课程的孤儿学位。
    const { courses, ...degreeData } = dto;
    const courseLinks = courses?.length
      ? [...new Map(courses.map((c) => [c.courseId, c])).values()]
      : [];
    if (courseLinks.length) {
      const uniqueCourseIds = courseLinks.map((c) => c.courseId);
      const publicCourseCount = await this.prisma.course.count({
        where: { id: { in: uniqueCourseIds }, ...PUBLIC_COURSE_WHERE },
      });
      if (publicCourseCount !== uniqueCourseIds.length) {
        throw new BadRequestException('Degrees may only contain public published courses');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const degree = await tx.nanoDegree.create({
        data: {
          ...degreeData,
          status: degreeData.status ?? CourseStatus.draft,
        },
      });
      if (courseLinks.length) {
        await tx.degreeCourse.createMany({
          data: courseLinks.map((c) => ({
            degreeId: degree.id,
            courseId: c.courseId,
            orderIndex: c.orderIndex,
          })),
        });
      }
      return degree;
    });


    return this.prisma.nanoDegree.findUnique({
      where: { id: created.id },
      include: this.degreeInclude(false),
    });
  }

  async update(id: string, dto: UpdateDegreeDto) {
    // courses 字段不直接透传给 prisma (那是关联表), 课程绑定走 linkCourses
    const { courses: _courses, ...degreeData } = dto;
    const degree = await this.prisma.nanoDegree.update({
      where: { id },
      data: degreeData,
      include: this.degreeInclude(false),
    });


    return degree;
  }

  async delete(id: string) {
    await this.prisma.nanoDegree.delete({ where: { id } });


    return { message: 'Degree deleted' };
  }

  async linkCourses(id: string, dto: LinkCoursesDto) {
    const uniqueCourseIds = [...new Set(dto.courses.map((course) => course.courseId))];
    const publicCourseCount = await this.prisma.course.count({
      where: { id: { in: uniqueCourseIds }, ...PUBLIC_COURSE_WHERE },
    });
    if (publicCourseCount !== uniqueCourseIds.length) {
      throw new BadRequestException('Degrees may only contain public published courses');
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.degreeCourse.findMany({
        where: { degreeId: id },
        select: { courseId: true },
      });
      const nextIds = new Set(uniqueCourseIds);
      const removedIds = existing
        .map((link) => link.courseId)
        .filter((courseId) => !nextIds.has(courseId));

      await tx.degreeCourse.deleteMany({ where: { degreeId: id } });
      await tx.degreeCourse.createMany({
        data: dto.courses.map((c) => ({
          degreeId: id,
          courseId: c.courseId,
          orderIndex: c.orderIndex,
        })),
      });

      // 课程被移出学位后, 撤销该学位授予的课程报名(直接购买的不受影响)
      // ponytail: degree 来源的课程报名记录无 degreeId 维度, 用户若通过多个学位
      // 获得同一课程, 任一学位移除该课会整体失去访问; 需 schema 加来源维度才能精确
      if (removedIds.length) {
        await tx.enrollment.updateMany({
          where: {
            courseId: { in: removedIds },
            source: 'degree',
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
      }
    });

    return this.prisma.nanoDegree.findUnique({
      where: { id },
      include: this.degreeInclude(false),
    });
  }
}
