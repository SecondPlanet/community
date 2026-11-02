import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  CostType,
  CourseOrigin,
  CourseStatus,
  CourseVisibility,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../modules/prisma/prisma.service';

export const PUBLIC_COURSE_WHERE = {
  status: CourseStatus.published,
  visibility: CourseVisibility.public,
} as const;

export interface CoursePrincipal {
  userId?: string;
  role?: UserRole;
}

export interface CourseAccessSubject {
  id: string;
  status: CourseStatus;
  visibility: CourseVisibility;
  origin: CourseOrigin;
  ownerUserId: string | null;
  costType: CostType;
}

@Injectable()
export class CourseAccessPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  assertCanView(
    course: CourseAccessSubject,
    principal?: CoursePrincipal,
  ): void {
    if (this.isPrivateCourse(course)) {
      if (!this.isOwnerOrAdmin(course, principal)) this.notFound();
      return;
    }

    if (
      principal?.role !== UserRole.admin &&
      (course.status !== CourseStatus.published ||
        course.visibility !== CourseVisibility.public)
    ) {
      this.notFound();
    }
  }

  assertCanEnroll(
    course: CourseAccessSubject,
    principal?: CoursePrincipal,
  ): void {
    this.assertCanView(course, principal);
  }

  async hasFullContentAccess(
    course: CourseAccessSubject,
    principal?: CoursePrincipal,
  ): Promise<boolean> {
    this.assertCanView(course, principal);

    if (this.isPrivateCourse(course)) return true;
    if (principal?.role === UserRole.admin) return true;
    if (course.costType === CostType.free || course.costType === CostType.charity) {
      return true;
    }
    if (!principal?.userId) return false;

    return this.hasActiveEnrollment(principal.userId, course.id);
  }

  async assertCanLearn(
    course: CourseAccessSubject,
    principal?: CoursePrincipal,
  ): Promise<void> {
    this.assertCanView(course, principal);

    if (this.isPrivateCourse(course) || principal?.role === UserRole.admin) return;
    if (!principal?.userId) this.notFound();

    if (course.costType === CostType.free || course.costType === CostType.charity) {
      await this.prisma.enrollment.upsert({
        where: {
          userId_courseId: { userId: principal.userId, courseId: course.id },
        },
        update: {
          deletedAt: null,
          expiresAt: null,
          enrolledAt: new Date(),
          source: 'direct',
        },
        create: {
          userId: principal.userId,
          courseId: course.id,
          source: 'direct',
        },
      });
      return;
    }

    if (!(await this.hasActiveEnrollment(principal.userId, course.id))) {
      throw new ForbiddenException('Course enrollment required');
    }
  }

  private isPrivateCourse(course: CourseAccessSubject): boolean {
    return (
      course.origin === CourseOrigin.ai_personal ||
      course.visibility !== CourseVisibility.public
    );
  }

  private isOwnerOrAdmin(
    course: CourseAccessSubject,
    principal?: CoursePrincipal,
  ): boolean {
    return (
      principal?.role === UserRole.admin ||
      (!!principal?.userId && principal.userId === course.ownerUserId)
    );
  }

  private async hasActiveEnrollment(userId: string, courseId: string) {
    return !!(await this.prisma.enrollment.findFirst({
      where: {
        userId,
        courseId,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    }));
  }

  private notFound(): never {
    throw new NotFoundException('Course not found');
  }
}
