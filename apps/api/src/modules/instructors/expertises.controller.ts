import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { InstructorsService } from './instructors.service';
import {
  CreateExpertiseDto,
  UpdateExpertiseDto,
} from './instructors.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

// =============================================================
// 前台公开: 专长列表 (供前端 chip 筛选用)
// =============================================================

@ApiTags('instructor-expertises (public)')
@Controller('instructors/expertises')
export class ExpertisesPublicController {
  constructor(private readonly service: InstructorsService) {}

  @Get()
  @ApiOperation({ summary: '专长列表 (前台, 用于 chip 筛选)' })
  async findAll() {
    return this.service.findAllExpertises();
  }
}

// =============================================================
// Admin: 专长管理
// =============================================================

@ApiTags('instructor-expertises (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller('admin/instructors/expertises')
export class ExpertisesAdminController {
  constructor(private readonly service: InstructorsService) {}

  @Get()
  @ApiOperation({ summary: '专长列表 (admin, 含禁用)' })
  async findAll() {
    return this.service.findAllExpertises();
  }

  @Post()
  @ApiOperation({ summary: '新建专长 (admin)' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExpertiseDto) {
    return this.service.createExpertise(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新专长 (admin)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateExpertiseDto) {
    return this.service.updateExpertise(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除专长 (admin, 级联删除关联 link)' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string) {
    return this.service.deleteExpertise(id);
  }
}
