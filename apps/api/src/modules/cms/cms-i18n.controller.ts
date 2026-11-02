/**
 * CmsI18nController — 公开 GET endpoint (i18n messages)
 *
 * - GET /api/v1/i18n/messages?locale=zh-CN&category=empty
 *
 * 不走 JwtAuthGuard.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CmsI18nService } from './cms-i18n.service';

@ApiTags('cms-i18n')
@Controller({ path: 'i18n', version: '1' })
export class CmsI18nController {
  constructor(private readonly cmsI18nService: CmsI18nService) {}

  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Get('messages')
  @ApiOperation({ summary: 'i18n 通用文案 (按 locale + category)' })
  listMessages(
    @Query('locale') locale?: string,
    @Query('category') category?: 'common' | 'auth' | 'course' | 'hackathon' | 'degree' | 'admin',
  ) {
    return this.cmsI18nService.listMessages(locale, category);
  }
}
