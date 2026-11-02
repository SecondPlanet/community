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
import { DegreesService } from './degrees.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole, CourseStatus } from '@prisma/client';
import { CreateDegreeDto, UpdateDegreeDto, LinkCoursesDto } from './degrees.dto';

@ApiTags('degrees')
@Controller('degrees')
export class DegreesController {
  constructor(private readonly degreesService: DegreesService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取纳米学位列表（公开）' })
  @ApiQuery({ name: 'status', required: false, enum: CourseStatus, description: '状态过滤' })
  @ApiQuery({ name: 'search', required: false, description: '标题/描述模糊搜索' })
  async findAll(
    @Query('status') status?: CourseStatus,
    @Query('search') search?: string,
    @Req() req?: { user?: { role?: UserRole } },
  ) {
    const effectiveStatus = req?.user?.role === UserRole.admin
      ? status
      : CourseStatus.published;
    return this.degreesService.findAll({
      status: effectiveStatus,
      search,
      includePrivateCourses: req?.user?.role === UserRole.admin,
    });
  }

  // Security: same draft-filter pattern as courses/:id.
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取纳米学位详情（公开；管理员可见草稿）' })
  @ApiParam({ name: 'id', description: '学位ID' })
  async findOne(
    @Param('id') id: string,
    @Req() req: { user?: { role?: UserRole } },
  ) {
    const includeDraft = req.user?.role === UserRole.admin;
    return this.degreesService.findOne(id, includeDraft);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建纳米学位（管理员）' })
  async create(@Body() dto: CreateDegreeDto) {
    return this.degreesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新纳米学位（管理员）' })
  @ApiParam({ name: 'id', description: '学位ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateDegreeDto) {
    return this.degreesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除纳米学位（管理员）' })
  @ApiParam({ name: 'id', description: '学位ID' })
  async delete(@Param('id') id: string) {
    return this.degreesService.delete(id);
  }

  @Post(':id/courses')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '给学位绑定课程（管理员）' })
  @ApiParam({ name: 'id', description: '学位ID' })
  async linkCourses(@Param('id') id: string, @Body() dto: LinkCoursesDto) {
    return this.degreesService.linkCourses(id, dto);
  }
}
