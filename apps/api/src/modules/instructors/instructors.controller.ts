import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { InstructorsService } from './instructors.service';
import {
  CreateInstructorDto,
  UpdateInstructorDto,
  QueryInstructorDto,
  LinkCourseDto,
  SyncCourseLinksDto,
  ReorderInstructorsDto,
} from './instructors.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

// =============================================================
// 前台公开端点
// =============================================================

@ApiTags('instructors (public)')
@Controller('instructors')
export class InstructorsPublicController {
  constructor(private readonly service: InstructorsService) {}

  @Get()
  @ApiOperation({ summary: '讲师列表 (前台, 仅 published)' })
  async findAll(@Query() query: QueryInstructorDto) {
    return this.service.findAll(query, { publishedOnly: true });
  }

  @Get(':slug')
  @ApiOperation({ summary: '讲师详情 (按 slug, 前台)' })
  @ApiParam({ name: 'slug', description: '讲师 slug' })
  async findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug, { publishedOnly: true });
  }

  @Get(':id/stats')
  @ApiOperation({ summary: '讲师统计 (公开, 仅统计该讲师 published 课程的聚合)' })
  @ApiParam({ name: 'id', description: '讲师 ID' })
  async getStats(@Param('id') id: string) {
    return this.service.getStats(id);
  }
}

// =============================================================
// Admin 端点
// =============================================================

@ApiTags('instructors (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller('admin/instructors')
export class InstructorsAdminController {
  constructor(private readonly service: InstructorsService) {}

  @Get()
  @ApiOperation({ summary: '讲师列表 (admin, 含草稿)' })
  async findAll(@Query() query: QueryInstructorDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '讲师详情 (admin, 按 id)' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiOperation({ summary: '新建讲师 (admin)' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateInstructorDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新讲师 (admin)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateInstructorDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '软删讲师 (admin, 置草稿 + 解除所有 link)' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.OK)
  async softDelete(@Param('id') id: string) {
    return this.service.softDelete(id);
  }

  @Post('reorder')
  @ApiOperation({ summary: '拖拽排序讲师 (admin, 一次提交完整 ID 列表)' })
  async reorder(@Body() dto: ReorderInstructorsDto) {
    return this.service.reorder(dto);
  }
}

// =============================================================
// Admin 课程下挂载端点
// (挂载管理: 在课程编辑时调, 一次提交整组 link)
// =============================================================

@ApiTags('course-instructors (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller('admin/courses/:courseId/instructors')
export class CourseInstructorsAdminController {
  constructor(private readonly service: InstructorsService) {}

  @Get()
  @ApiOperation({ summary: '获取该课程的所有讲师/导师 link' })
  @ApiParam({ name: 'courseId' })
  async list(@Param('courseId') courseId: string) {
    return this.service.listCourseLinks(courseId);
  }

  @Post()
  @ApiOperation({ summary: '挂一个讲师/导师到课程 (admin)' })
  @ApiParam({ name: 'courseId' })
  @HttpCode(HttpStatus.CREATED)
  async link(@Param('courseId') courseId: string, @Body() dto: LinkCourseDto) {
    return this.service.linkToCourse(courseId, dto);
  }

  @Delete(':linkId')
  @ApiOperation({ summary: '解除一个讲师 link (admin)' })
  @ApiParam({ name: 'courseId' })
  @ApiParam({ name: 'linkId' })
  @HttpCode(HttpStatus.OK)
  async unlink(
    @Param('courseId') courseId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.unlinkFromCourse(courseId, linkId);
  }

  @Put()
  @ApiOperation({ summary: '整组同步课程的讲师/导师 link (admin, 一次 diff 覆盖)' })
  @ApiParam({ name: 'courseId' })
  async syncLinks(
    @Param('courseId') courseId: string,
    @Body() dto: SyncCourseLinksDto,
  ) {
    return this.service.syncCourseLinks(courseId, dto);
  }
}
