/**
 * LessonsController — 课时 CRUD
 *
 * 路径:`/api/v1/chapters/:chapterId/lessons`
 * 全部需 admin
 *
 * - GET    列出章节下课时
 * - POST   新建课时
 * - PATCH  改课时
 * - DELETE 软删课时
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto, UpdateLessonDto } from './lessons.dto';

@ApiTags('lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller({ path: 'chapters', version: '1' })
export class LessonsController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Get(':chapterId/lessons')
  @ApiOperation({ summary: '列出章节下课时' })
  async list(@Param('chapterId') chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter || chapter.deletedAt) {
      throw new NotFoundException('Chapter not found');
    }
    return this.prisma.lesson.findMany({
      where: { chapterId, deletedAt: null },
      orderBy: { orderIndex: 'asc' },
      include: { resources: true },
    });
  }

  @Post(':chapterId/lessons')
  @ApiOperation({ summary: '新建课时' })
  async create(
    @Param('chapterId') chapterId: string,
    @Body() dto: CreateLessonDto,
  ) {
    if (!dto.title) throw new BadRequestException('title is required');
    const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter || chapter.deletedAt) {
      throw new NotFoundException('Chapter not found');
    }
    let orderIndex = dto.orderIndex;
    if (orderIndex === undefined) {
      const max = await this.prisma.lesson.aggregate({
        _max: { orderIndex: true },
        where: { chapterId, deletedAt: null },
      });
      orderIndex = (max._max.orderIndex ?? -1) + 1;
    }
    const lesson = await this.prisma.lesson.create({
      data: {
        chapterId,
        title: dto.title,
        description: dto.description,
        videoUrl: dto.videoUrl,
        videoDuration: dto.videoDuration,
        isPreview: dto.isPreview ?? false,
        orderIndex,
      },
    });
    return lesson;
  }

  @Patch('lessons/:id')
  @ApiOperation({ summary: '改课时' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
  ) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Lesson not found');
    }
    const lesson = await this.prisma.lesson.update({ where: { id }, data: dto });
    return lesson;
  }

  @Delete('lessons/:id')
  @ApiOperation({ summary: '软删课时' })
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Lesson not found');
    }
    await this.prisma.lesson.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  @Post(':chapterId/lessons/reorder')
  @ApiOperation({ summary: '批量重排课时顺序' })
  async reorder(
    @Param('chapterId') chapterId: string,
    @Body() dto: { ids: string[] },
  ) {
    if (!Array.isArray(dto.ids)) {
      throw new BadRequestException('ids must be an array');
    }
    // 安全: 校验所有 lesson id 都属于该 chapter, 防止 admin 拿任意 chapter 的 lesson id 重排
    const lessons = await this.prisma.lesson.findMany({
      where: { id: { in: dto.ids } },
      select: { id: true, chapterId: true },
    });
    const invalid = lessons.filter((l) => l.chapterId !== chapterId);
    if (invalid.length > 0) {
      throw new ForbiddenException(
        `Lessons ${invalid.map((l) => l.id).join(', ')} 不属于 chapter ${chapterId}`,
      );
    }
    if (lessons.length !== dto.ids.length) {
      throw new BadRequestException(
        `Some lesson ids not found: expected ${dto.ids.length}, got ${lessons.length}`,
      );
    }
    await this.prisma.$transaction(
      dto.ids.map((id, idx) =>
        this.prisma.lesson.update({
          where: { id },
          data: { orderIndex: idx },
        }),
      ),
    );
    return { ok: true };
  }
}
