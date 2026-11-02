import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import {
  UpdateUserDto,
  GrantCourseAccessDto,
  GrantDegreeAccessDto,
  CreateUserDto,
  ChangePasswordDto,
} from './users.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Roles(UserRole.admin, UserRole.student, UserRole.instructor)
  @ApiOperation({ summary: '获取当前登录用户信息' })
  async getMe(@Request() req: { user: { userId: string } }) {
    return this.usersService.findOne(req.user.userId);
  }

  @Get()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '用户列表（管理员）' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole, description: '按角色过滤' })
  @ApiQuery({ name: 'search', required: false, description: '邮箱/姓名模糊搜索' })
  @ApiQuery({ name: 'page', required: false, description: '页码（默认 1）' })
  @ApiQuery({ name: 'limit', required: false, description: '每页大小（默认 20）' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'disabled', 'all'] })
  async findAll(
    @Query('role') role?: UserRole,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status: 'active' | 'disabled' | 'all' = 'active',
  ) {
    return this.usersService.findAll({
      role,
      search,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status: ['active', 'disabled', 'all'].includes(status) ? status : 'active',
    });
  }

  @Get(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '获取指定用户信息（管理员）' })
  @ApiParam({ name: 'id', description: '用户ID' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '创建用户（管理员）' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Post('me/change-password')
  @Roles(UserRole.admin, UserRole.student, UserRole.instructor)
  @ApiOperation({ summary: '修改当前用户密码并吊销其他会话' })
  async changePassword(
    @Request() req: { user: { userId: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(req.user.userId, dto);
  }

  @Patch(':id')
  // 自己可改自己；管理员可改任意 — self-or-admin 的授权在 service 内判定，
  // 这里只声明「任意已认证角色可进入」以满足 fail-closed RolesGuard。
  @Roles(UserRole.admin, UserRole.student, UserRole.instructor)
  @ApiOperation({ summary: '更新用户（自己可改自己；管理员可改任意）' })
  @ApiParam({ name: 'id', description: '用户ID' })
  async update(
    @Request() req: { user: { userId: string; role: UserRole } },
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    // Users can update themselves; admins can update anyone
    // 之前返 { error: 'Forbidden' } + 200 → 前端以为成功, 改 throw ForbiddenException (403)
    if (req.user.role !== UserRole.admin && req.user.userId !== id) {
      throw new ForbiddenException('只能修改自己的账号');
    }
    if (dto.role !== undefined && req.user.role !== UserRole.admin) {
      throw new ForbiddenException('只有管理员可以修改角色');
    }
    return this.usersService.update(id, dto, {
      actorUserId: req.user.userId,
      isAdmin: req.user.role === UserRole.admin,
    });
  }

  @Post(':id/reset-password')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '生成一次性临时密码并吊销该用户全部会话（管理员）' })
  async resetPassword(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.usersService.resetPassword(id, req.user.userId);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '删除用户（管理员）' })
  @ApiParam({ name: 'id', description: '用户ID' })
  async delete(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.usersService.disable(id, req.user.userId);
  }

  @Post(':id/restore')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '恢复已停用用户（管理员）' })
  async restore(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.usersService.restore(id, req.user.userId);
  }

  @Post(':id/grant-course')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '给用户授权课程访问（管理员）' })
  @ApiParam({ name: 'id', description: '用户ID' })
  async grantCourseAccess(
    @Request() req: { user: { userId: string } },
    @Param('id') userId: string,
    @Body() dto: GrantCourseAccessDto,
  ) {
    return this.usersService.grantCourseAccess(userId, dto, req.user.userId);
  }

  @Post(':id/grant-degree')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '给用户授权学位访问（管理员）' })
  @ApiParam({ name: 'id', description: '用户ID' })
  async grantDegreeAccess(
    @Request() req: { user: { userId: string } },
    @Param('id') userId: string,
    @Body() dto: GrantDegreeAccessDto,
  ) {
    return this.usersService.grantDegreeAccess(userId, dto, req.user.userId);
  }
}
