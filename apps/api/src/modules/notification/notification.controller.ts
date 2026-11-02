import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { ListNotificationsDto } from './notification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * NotificationController — P1-7 通知中心
 *
 * 全部 endpoint 登录态(JwtAuthGuard)。
 * 路径:`/api/v1/notifications` (global prefix + URI versioning)
 *
 *   GET    /notifications             列表 + 未读数 (分页)
 *   GET    /notifications/unread-count  仅未读数(bell 角标轮询用)
 *   POST   /notifications/:id/read    标已读
 *   POST   /notifications/read-all    全部标已读
 *   DELETE /notifications/:id         软删
 *   POST   /notifications/clear-read  清空已读(批量软删,前端 "清空已读" 按钮)
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: '我的通知列表 + 未读数' })
  async list(
    @Request() req: { user: { userId: string } },
    @Query() q: ListNotificationsDto,
  ) {
    return this.notificationService.list(req.user.userId, q);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '未读通知数(bell 角标)' })
  async unreadCount(@Request() req: { user: { userId: string } }) {
    const count = await this.notificationService.unreadCount(req.user.userId);
    return { count };
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: '标已读' })
  async markRead(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    const ok = await this.notificationService.markRead(req.user.userId, id);
    if (!ok) throw new NotFoundException('通知不存在或已删除');
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: '全部标已读' })
  async markAllRead(@Request() req: { user: { userId: string } }) {
    const count = await this.notificationService.markAllRead(req.user.userId);
    return { ok: true, count };
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: '软删通知' })
  async softDelete(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    const ok = await this.notificationService.softDelete(req.user.userId, id);
    if (!ok) throw new NotFoundException('通知不存在或已删除');
    return { ok: true };
  }

  @Post('clear-read')
  @HttpCode(200)
  @ApiOperation({ summary: '清空已读(批量软删已读通知)' })
  async clearRead(@Request() req: { user: { userId: string } }) {
    const count = await this.notificationService.clearRead(req.user.userId);
    return { ok: true, count };
  }
}
