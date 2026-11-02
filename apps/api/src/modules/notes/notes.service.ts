import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CourseAccessPolicyService } from '../../common/course-access/course-access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './notes.dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessPolicyService,
  ) {}

  async list(userId: string, lessonId: string, role?: UserRole) {
    await this.assertLessonAccess(userId, lessonId, role);
    return this.prisma.note.findMany({
      where: { userId, lessonId },
      orderBy: [{ positionSec: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
  }

  async create(userId: string, lessonId: string, dto: CreateNoteDto, role?: UserRole) {
    await this.assertLessonAccess(userId, lessonId, role);
    return this.prisma.note.create({
      data: {
        userId,
        lessonId,
        content: dto.content.trim(),
        positionSec: dto.positionSec,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    await this.assertOwned(userId, id);
    return this.prisma.note.update({
      where: { id },
      data: {
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.positionSec !== undefined ? { positionSec: dto.positionSec } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.prisma.note.delete({ where: { id } });
    return { ok: true };
  }

  private async assertLessonAccess(userId: string, lessonId: string, role?: UserRole) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, deletedAt: null },
      select: {
        chapter: {
          select: {
            deletedAt: true,
            course: {
              select: {
                id: true,
                status: true,
                visibility: true,
                origin: true,
                ownerUserId: true,
                costType: true,
              },
            },
          },
        },
      },
    });
    if (!lesson || lesson.chapter.deletedAt) throw new NotFoundException('Lesson not found');
    await this.courseAccess.assertCanLearn(lesson.chapter.course, { userId, role });
  }

  private async assertOwned(userId: string, id: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!note) throw new NotFoundException('Note not found');
  }
}
