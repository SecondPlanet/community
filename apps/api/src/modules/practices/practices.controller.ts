import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PracticesService } from './practices.service';
import { CreatePracticeProjectDto, UpdatePracticeProjectDto, CompletePracticeDto } from './practices.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('practices')
@Controller({ path: 'practices', version: '1' })
export class PracticesController {
  constructor(private practicesService: PracticesService) {}

  @Get('courses/:courseId')
  @ApiOperation({ summary: '获取课程的实践项目列表' })
  @ApiParam({ name: 'courseId', description: '课程ID' })
  async getProjectsByCourse(@Param('courseId') courseId: string) {
    return this.practicesService.getProjectsByCourseId(courseId);
  }

  @Get('courses/:courseId/access')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户可访问的课程实践项目' })
  @ApiParam({ name: 'courseId', description: '课程ID' })
  async getAccessibleProjectsByCourse(
    @Request() req: { user: { userId: string; role?: UserRole } },
    @Param('courseId') courseId: string,
  ) {
    return this.practicesService.getAccessibleProjectsByCourseId(req.user.userId, courseId, req.user.role);
  }

  @Get('admin/courses/:courseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取课程的全部实践项目（管理员）' })
  @ApiParam({ name: 'courseId', description: '课程ID' })
  async getAdminProjectsByCourse(@Param('courseId') courseId: string) {
    return this.practicesService.getAdminProjectsByCourseId(courseId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取实践项目详情' })
  @ApiParam({ name: 'id', description: '项目ID' })
  async getProject(@Param('id') id: string) {
    return this.practicesService.getProjectById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建实践项目（管理员）' })
  async createProject(@Body() dto: CreatePracticeProjectDto) {
    return this.practicesService.createProject(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新实践项目（管理员）' })
  @ApiParam({ name: 'id', description: '项目ID' })
  async updateProject(@Param('id') id: string, @Body() dto: UpdatePracticeProjectDto) {
    return this.practicesService.updateProject(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除实践项目（管理员）' })
  @ApiParam({ name: 'id', description: '项目ID' })
  async deleteProject(@Param('id') id: string) {
    return this.practicesService.deleteProject(id);
  }

  @Get('user/progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户的实践进度' })
  @ApiQuery({ name: 'courseId', required: false, description: '可选：按课程筛选' })
  async getUserProgress(@Request() req: any, @Query('courseId') courseId?: string) {
    return this.practicesService.getUserProgress(req.user.userId, courseId);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开始实践项目' })
  @ApiParam({ name: 'id', description: '项目ID' })
  async startProject(@Request() req: any, @Param('id') id: string) {
    return this.practicesService.startProject(req.user.userId, id, req.user.role);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成实践项目' })
  @ApiParam({ name: 'id', description: '项目ID' })
  async completeProject(@Request() req: any, @Param('id') id: string, @Body() dto: CompletePracticeDto) {
    return this.practicesService.completeProject(req.user.userId, id, dto, req.user.role);
  }

  @Post(':id/skip')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '跳过实践项目' })
  @ApiParam({ name: 'id', description: '项目ID' })
  async skipProject(@Request() req: any, @Param('id') id: string) {
    return this.practicesService.skipProject(req.user.userId, id, req.user.role);
  }
}
