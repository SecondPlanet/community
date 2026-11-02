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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { BadgesService } from './badges.service';
import { CreateBadgeDto, UpdateBadgeDto } from './badges.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('badges')
@Controller({ path: 'badges', version: '1' })
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get()
  @ApiOperation({ summary: '获取全部启用徽章（公开）' })
  async findAll() {
    return this.badgesService.findAllActive();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的徽章墙（含进度）' })
  async getMyBadges(@Request() req: any) {
    return this.badgesService.getUserBadgesWithStatus(req.user.userId);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员获取全部徽章（包含已停用）' })
  async findAllAdmin() {
    return this.badgesService.findAllAdmin();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建徽章（管理员）' })
  async create(@Body() dto: CreateBadgeDto) {
    return this.badgesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新徽章（管理员）' })
  @ApiParam({ name: 'id', description: '徽章ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateBadgeDto) {
    return this.badgesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除徽章（管理员）' })
  @ApiParam({ name: 'id', description: '徽章ID' })
  async delete(@Param('id') id: string) {
    return this.badgesService.delete(id);
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员数据看板' })
  async getAdminStats() {
    return this.badgesService.getAdminStats();
  }
}
