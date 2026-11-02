import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole, CourseStatus, CourseType } from '@prisma/client';
import {
  CreateCourseDto,
  UpdateCourseDto,
  LinkDegreesDto,
  ListCoursesQueryDto,
} from './courses.dto';

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取课程列表（公开）' })
  @ApiQuery({ name: 'status', required: false, enum: CourseStatus, description: '课程状态过滤' })
  @ApiQuery({ name: 'courseType', required: false, enum: CourseType, description: '课程类型过滤' })
  @ApiQuery({ name: 'search', required: false, description: '标题/描述/讲师模糊搜索' })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'recent', 'rating', 'popular'] })
  async findAll(
    @Query() query: ListCoursesQueryDto,
    @Req() req: { user?: { userId?: string; role?: UserRole } },
  ) {
    return this.coursesService.findAll({
      ...query,
      allowNonPublished: req.user?.role === UserRole.admin,
    });
  }

  // Security: only admins can fetch draft/archived courses by id. Public
  // visitors always get the published version (or 404 if not published).
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取课程详情（公开；管理员可见草稿）' })
  @ApiParam({ name: 'id', description: '课程ID' })
  async findOne(
    @Param('id') id: string,
    @Req() req: { user?: { userId?: string; role?: UserRole } },
  ) {
    const isAdmin = req.user?.role === UserRole.admin;
    return this.coursesService.findOne(id, {
      includeDraft: isAdmin,
      isAdmin,
      userId: req.user?.userId,
    });
  }

  // v1.9-alpha.2 (batch-7 A-05): 相似课程推荐 — 公开接口 (访客也能用, 用于
  // 课程详情页 footer "相关课程")。limit 默认 4, 上限 12。
  @Get(':id/similar')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '相似课程 (tag 交集 + 同 category + 评分排序)' })
  @ApiParam({ name: 'id', description: '源课程ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回条数 (1-12, 默认 4)' })
  async similar(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<
      Array<{
        id: string;
        title: string;
        thumbnail: string;
        level: string;
        tags: string;
        category: { id: string; key: string; label: string } | null;
        ratingAvg: number;
        ratingCount: number;
        score: number;
      }>
    > {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 4;
    const safe = Number.isFinite(parsedLimit) ? parsedLimit : 4;
    return this.coursesService.findSimilarCourses(id, safe);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建课程（管理员）' })
  async create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新课程（管理员）' })
  @ApiParam({ name: 'id', description: '课程ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除课程（管理员）' })
  @ApiParam({ name: 'id', description: '课程ID' })
  async delete(@Param('id') id: string) {
    return this.coursesService.delete(id);
  }

  // P0 修复(2026-07-24): 课程挂学位 (append 语义)
  @Post(':id/degrees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '把课程追加到指定学位末尾（管理员）' })
  @ApiParam({ name: 'id', description: '课程ID' })
  async linkDegrees(@Param('id') id: string, @Body() dto: LinkDegreesDto) {
    return this.coursesService.linkDegrees(id, dto);
  }
}
