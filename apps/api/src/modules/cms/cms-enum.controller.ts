/**
 * CmsEnumController — 公开 GET endpoint (enums + date format)
 *
 * - GET /api/v1/enum-translations?type=...&locale=...
 * - GET /api/v1/date-format-templates?scope=...&locale=...
 *
 * 不走 JwtAuthGuard (前端 dashboard / 课程列表都要用).
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CmsEnumService } from './cms-enum.service';

@ApiTags('cms-enum')
@Controller({ path: '', version: '1' })
export class CmsEnumController {
  constructor(private readonly cmsEnumService: CmsEnumService) {}

  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Get('enum-translations')
  @ApiOperation({ summary: '枚举 i18n (label + color + icon)' })
  listEnumTranslations(
    @Query('type') type?: string,
    @Query('locale') locale?: string,
  ) {
    return this.cmsEnumService.listEnumTranslations(type, locale);
  }

  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Get('date-format-templates')
  @ApiOperation({ summary: '日期/时间格式模板' })
  listDateFormatTemplates(
    @Query('scope') scope?: string,
    @Query('locale') locale?: string,
  ) {
    return this.cmsEnumService.listDateFormatTemplates(scope, locale);
  }
}
