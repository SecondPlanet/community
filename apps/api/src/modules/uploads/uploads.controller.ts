/**
 * uploads.controller.ts — sign / complete 端点
 *
 * 2026-07-24: P0 — 视频上传管道
 *
 *   POST /api/v1/uploads/sign     body: { scope, filename, mimeType, size }
 *                                 → { uploadUrl, publicUrl, key, expiresIn, scope }
 *   POST /api/v1/uploads/complete body: { scope, key, refId }
 *                                 → { url, publicUrl, key }
 *
 * 全部 require auth (JwtAuthGuard). 业务权限 (role + scope) 走 uploads.service.
 * 前端流程: sign → PUT to uploadUrl (with file body) → complete → 用 publicUrl
 */
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { CompleteUploadDto, SignUploadDto } from './uploads.dto';
import type { Request } from 'express';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  // P0 (audit 2026-07-24): sign / complete 必须限流,否则 1 user 凭证可刷
  // presigned URL 灌满对象存储 / S3 账单。对比 learning-events.batch / reviews
  // 都有 throttle,uploads 反而不限流, 风险面更大 (要花钱)。
  // sign 限严格 (每 10s 最多 3 次),complete 略宽 (完成回调可以稍密)。
  @Post('sign')
  @Throttle({ short: { limit: 3, ttl: 10000 }, medium: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '申请一个 presigned PUT URL (前端直传 MinIO/S3)' })
  async sign(@Body() dto: SignUploadDto, @Req() req: Request) {
    const user = req.user as { userId: string; role: string };
    return this.uploads.sign(dto, user);
  }

  @Post('complete')
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '确认上传完成, 把 publicUrl 写到目标 entity 字段' })
  async complete(@Body() dto: CompleteUploadDto, @Req() req: Request) {
    const user = req.user as { userId: string; role: string };
    return this.uploads.complete(dto, user);
  }
}
