import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { LearningEventsService } from './learning-events.service';
import { BatchCreateLearningEventDto, CreateLearningEventDto } from './learning-events.dto';

/**
 * 学习事件上报(LearningEvent)
 *
 * - 前端 video player 每 5s flush 一次,走 batch
 * - 单条接口给 immediate 类型(complete / note)用
 * - list 接口给用户历史 / 教师视角用
 */
@ApiTags('learning-events')
@ApiBearerAuth()
@Controller('learning-events')
@UseGuards(JwtAuthGuard)
export class LearningEventsController {
  constructor(private readonly service: LearningEventsService) {}

  @Post()
  // P0 (audit v1.5.0 P2-2): createOne 单条无限流, 攻击者绕 batch 限制单条灌
  // learning_events 表撑爆. 改: 短窗 5/1s 平衡正常使用, 中窗 60/60s 防滥用
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '上报单条学习事件（complete / note 等）' })
  async createOne(@Request() req: any, @Body() dto: CreateLearningEventDto) {
    const event = await this.service.createOne(req.user.userId, dto, req.user.role);
    return { event };
  }

  // 批量上报走更宽松的 throttle(防止 30s flush 撞限流)
  @Post('batch')
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '批量上报学习事件（video player flush）' })
  async createBatch(@Request() req: any, @Body() dto: BatchCreateLearningEventDto) {
    return this.service.createBatch(req.user.userId, dto, req.user.role);
  }

  @Get('me')
  @ApiOperation({ summary: '我的最近学习事件' })
  @ApiQuery({ name: 'limit', required: false, description: '返回条数（默认 50，上限 100）' })
  async listMine(@Request() req: any, @Query('limit') limit?: string) {
    return this.service.listMine(req.user.userId, limit ? Number(limit) : 50);
  }

  // v1.9-alpha.2 (batch-10 A-09): 续播读取侧 — 返回该用户该课时最近带 positionSec 的事件位置。
  @Get('me/lessons/:lessonId/position')
  @ApiOperation({ summary: '我的某课时最近一次观看位置（用于续播）' })
  @ApiParam({ name: 'lessonId', description: '课时ID' })
  async getMyPositionForLesson(
    @Request() req: any,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    const positionSec = await this.service.getMyPositionForLesson(req.user.userId, lessonId);
    return { positionSec };
  }

  @Get('lesson/:lessonId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.admin, UserRole.instructor)
  @ApiOperation({ summary: '课时的学习事件列表（管理员/讲师）' })
  @ApiParam({ name: 'lessonId', description: '课时ID' })
  @ApiQuery({ name: 'limit', required: false, description: '返回条数（默认 50，上限 100）' })
  async listByLesson(
    @Request() req: { user: { userId: string; role: UserRole } },
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listByLesson(req.user.userId, req.user.role, lessonId, limit ? Number(limit) : 50);
  }
}
