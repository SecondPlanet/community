/**
 * AdminController — 后台管理 API(仅 admin)
 *
 * - GET /admin/stats       看板数据(KPI / 图表 / 待办)
 *
 * 统计与运营看板集中在 admin module
 * 课程/章节/课时/评价管理走各自 module 的 controller:
 *   - CoursesModule     (CRUD)
 *   - ChaptersController(章节)
 *   - LessonsController (课时)
 *   - ReviewsController (评价 — 含 admin 删除)
 *   - BadgesModule      (徽章 CRUD)
 *
 * 全部需 admin 角色(JwtAuthGuard + RolesGuard)
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // P1-7: admin/stats 是聚合查询 (多个 prisma.count),
  // 5 req/sec 已能挡自动化轮询 (5+ 个 admin tab 同时刷才会撞限).
  @Throttle({ short: { limit: 5, ttl: 1000 } })
  @Get('stats')
  @ApiOperation({ summary: '后台看板统计(KPI / 图表 / 待办 / 系统状态)' })
  getStats() {
    return this.adminService.getStats();
  }
}
