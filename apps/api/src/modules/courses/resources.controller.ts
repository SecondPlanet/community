/**
 * ResourcesController — 课时资源 CRUD
 *
 * 路径:`/api/v1/lessons/:lessonId/resources`
 * 全部需 admin(JwtAuthGuard + RolesGuard)
 *
 * Resource 字段:
 *   - title: 资源标题
 *   - url:  资源链接 / CDN 路径
 *   - type: pdf | code | link | video | audio
 *   - isLocked: 未报名用户是否可下载(默认 true = 锁)
 *
 * 端点:
 *   GET    /lessons/:lessonId/resources           列出课时资源
 *   POST   /lessons/:lessonId/resources           新建资源
 *   PATCH  /resources/:id                         改资源
 *   DELETE /resources/:id                         软删(deletedAt)
 *   POST   /lessons/:lessonId/resources/reorder   批量重排
 *
 * 注:Resource 暂不存文件本身,只存 url。文件上传走预签名 URL(独立 endpoint,P2+)
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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole, ResourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResourceDto, UpdateResourceDto } from './resources.dto';

const ALLOWED_TYPES: ResourceType[] = ['pdf', 'code', 'link', 'video', 'audio'];

@ApiTags('resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller({ path: 'lessons', version: '1' })
export class ResourcesController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Get(':lessonId/resources')
  @ApiOperation({ summary: '列出课时资源' })
  async list(@Param('lessonId') lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.deletedAt) {
      throw new NotFoundException('Lesson not found');
    }
    return this.prisma.resource.findMany({
      where: { lessonId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post(':lessonId/resources')
  @ApiOperation({ summary: '新建资源' })
  async create(
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateResourceDto,
  ) {
    if (!dto.title) throw new BadRequestException('title is required');
    if (!dto.url) throw new BadRequestException('url is required');
    if (!ALLOWED_TYPES.includes(dto.type)) {
      throw new BadRequestException(`type must be one of: ${ALLOWED_TYPES.join(', ')}`);
    }
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.deletedAt) {
      throw new NotFoundException('Lesson not found');
    }
    const resource = await this.prisma.resource.create({
      data: {
        lessonId,
        title: dto.title,
        url: dto.url,
        type: dto.type,
        isLocked: dto.isLocked ?? true,
      },
    });
    return resource;
  }

  // 单个资源操作走 `/api/v1/resources/:id`(对应前端 coursesAdminApi.updateResource/deleteResource)
  // 单独 controller 路径,避免 lessons 命名空间耦合
}

// ──────────────────────────────────────────────────────────────────────
// 单个 resource 操作(独立 controller,路径 `/api/v1/resources/:id`)
// ──────────────────────────────────────────────────────────────────────

@ApiTags('resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller({ path: 'resources', version: '1' })
export class ResourceItemController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Patch(':id')
  @ApiOperation({ summary: '改资源' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    const existing = await this.prisma.resource.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Resource not found');
    }
    if (dto.type && !ALLOWED_TYPES.includes(dto.type)) {
      throw new BadRequestException(`type must be one of: ${ALLOWED_TYPES.join(', ')}`);
    }
    const resource = await this.prisma.resource.update({
      where: { id },
      data: dto,
    });
    return resource;
  }

  @Delete(':id')
  @ApiOperation({ summary: '软删资源' })
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.resource.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Resource not found');
    }
    await this.prisma.resource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
