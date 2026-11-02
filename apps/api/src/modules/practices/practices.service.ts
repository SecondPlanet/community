import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BadgesService } from '../badges/badges.service';
import { CreatePracticeProjectDto, UpdatePracticeProjectDto, CompletePracticeDto } from './practices.dto';
import { CourseOrigin, UserRole } from '@prisma/client';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';

@Injectable()
export class PracticesService {
  constructor(
    private prisma: PrismaService,
    private readonly badgesService: BadgesService,
    private readonly courseAccess: CourseAccessPolicyService,
  ) {}

  // 获取课程的所有实践项目
  async getProjectsByCourseId(courseId: string) {
    const course = await this.findCourse(courseId);
    this.courseAccess.assertCanView(course);
    const projects = await this.prisma.practiceProject.findMany({
      where: { courseId, isActive: true },
      orderBy: { orderIndex: 'asc' },
      // P1-7 防御: max 100, 防 DoS
      take: 100,
    });
    return projects.map((project) => ({ ...project, projectUrl: '' }));
  }

  async getAccessibleProjectsByCourseId(userId: string, courseId: string, role?: UserRole) {
    await this.assertCourseAccess(userId, courseId, role);
    return this.prisma.practiceProject.findMany({
      where: { courseId, isActive: true },
      orderBy: { orderIndex: 'asc' },
      take: 100,
    });
  }

  async getAdminProjectsByCourseId(courseId: string) {
    return this.prisma.practiceProject.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' },
      take: 100,
    });
  }

  // 获取单个实践项目详情
  async getProjectById(id: string) {
    const project = await this.prisma.practiceProject.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            status: true,
            visibility: true,
            origin: true,
            ownerUserId: true,
            costType: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Practice project not found');
    }
    this.courseAccess.assertCanView(project.course);

    return { ...project, projectUrl: '' };
  }

  // 创建实践项目（管理员）
  async createProject(dto: CreatePracticeProjectDto) {
    // 验证课程是否存在
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return this.prisma.practiceProject.create({
      data: {
        ...dto,
        orderIndex: dto.orderIndex ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // 更新实践项目（管理员）
  async updateProject(id: string, dto: UpdatePracticeProjectDto) {
    const project = await this.prisma.practiceProject.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException('Practice project not found');
    }

    return this.prisma.practiceProject.update({
      where: { id },
      data: dto,
    });
  }

  // 删除实践项目（管理员）
  async deleteProject(id: string) {
    const project = await this.prisma.practiceProject.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException('Practice project not found');
    }

    await this.prisma.practiceProject.delete({
      where: { id },
    });

    return { message: 'Practice project deleted successfully' };
  }

  // 获取用户的实践进度
  async getUserProgress(userId: string, courseId?: string) {
    const where: any = { userId };

    if (courseId) {
      await this.assertCourseAccess(userId, courseId);
      where.project = { courseId };
    }

    return this.prisma.practiceCompletion.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            title: true,
            courseId: true,
            difficulty: true,
            estimatedTime: true,
            projectType: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // 开始实践项目
  async startProject(userId: string, projectId: string, role?: UserRole) {
    // 验证项目是否存在
    const project = await this.prisma.practiceProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Practice project not found');
    }

    if (!project.isActive) {
      throw new ForbiddenException('This practice project is not active');
    }
    await this.assertCourseAccess(userId, project.courseId, role);

    // 检查是否已经开始
    const existing = await this.prisma.practiceCompletion.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    if (existing) {
      return existing; // 返回已有记录
    }

    // 创建新的完成记录
    return this.prisma.practiceCompletion.create({
      data: {
        userId,
        projectId,
        status: 'in_progress',
      },
      include: {
        project: true,
      },
    });
  }

  // 完成实践项目
  async completeProject(userId: string, projectId: string, dto: CompletePracticeDto, role?: UserRole) {
    const course = await this.assertProjectAccess(userId, projectId, role);
    const completion = await this.prisma.practiceCompletion.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    if (!completion) {
      throw new NotFoundException('Practice completion not found. Please start the project first.');
    }

    const wasAlreadyCompleted = completion?.status === 'completed';

    const updated = await this.prisma.practiceCompletion.update({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
      data: {
        status: 'completed',
        completedAt: new Date(),
        submissionUrl: dto.submissionUrl,
        notes: dto.notes,
      },
      include: {
        project: true,
      },
    });

    if (!wasAlreadyCompleted && course.origin !== CourseOrigin.ai_personal) {
      this.badgesService.checkAndAward(userId).catch(() => undefined);
    }

    return updated;
  }

  // 跳过实践项目
  async skipProject(userId: string, projectId: string, role?: UserRole) {
    await this.assertProjectAccess(userId, projectId, role);
    const completion = await this.prisma.practiceCompletion.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    if (!completion) {
      throw new NotFoundException('Practice completion not found');
    }

    return this.prisma.practiceCompletion.update({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
      data: {
        status: 'skipped',
      },
    });
  }

  private async assertProjectAccess(userId: string, projectId: string, role?: UserRole) {
    const project = await this.prisma.practiceProject.findUnique({
      where: { id: projectId },
      select: { courseId: true, isActive: true },
    });
    if (!project) throw new NotFoundException('Practice project not found');
    if (!project.isActive) throw new ForbiddenException('This practice project is not active');
    return this.assertCourseAccess(userId, project.courseId, role);
  }

  private async assertCourseAccess(userId: string, courseId: string, role?: UserRole) {
    const course = await this.findCourse(courseId);
    await this.courseAccess.assertCanLearn(course, { userId, role });
    return course;
  }

  private async findCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        status: true,
        visibility: true,
        origin: true,
        ownerUserId: true,
        costType: true,
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }
}
