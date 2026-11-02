/**
 * CmsConfigController — 公开 GET endpoint (app/site/page settings)
 *
 * - GET /api/v1/app-settings?scope=...
 * - GET /api/v1/site-settings?keys=a,b,c
 * - GET /api/v1/page-settings?page=home&page=courses
 *
 * 不走 JwtAuthGuard.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CmsConfigService } from './cms-config.service';

@ApiTags('cms-config')
@Controller({ path: '', version: '1' })
export class CmsConfigController {
  constructor(private readonly cmsConfigService: CmsConfigService) {}

  // P2-5: 公开端点 30 req/sec 放宽（前台 layout 启动会拉 3 个 endpoint × 多 tab）
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Get('app-settings')
  @ApiOperation({ summary: '全局业务规则 key-value 配置' })
  listAppSettings(@Query('scope') scope?: string) {
    return this.cmsConfigService.listAppSettings(scope);
  }

  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Get('site-settings')
  @ApiOperation({ summary: '全局品牌文案 (key 批量)' })
  async getSiteSettings(@Query('keys') keys?: string) {
    const list = keys
      ? keys.split(',').map((k) => k.trim()).filter(Boolean)
      : [];
    if (list.length === 0) {
      return this.cmsConfigService.listSiteSettings();
    }
    return this.cmsConfigService.getSiteSettingsByKeys(list);
  }

  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Get('page-settings')
  @ApiOperation({ summary: '页面级文案 (按 page 批量)' })
  async getPageSettings(@Query('page') page?: string | string[]) {
    const pages = Array.isArray(page) ? page : page ? [page] : [];
    if (pages.length === 0) {
      return this.cmsConfigService.listPageSettings();
    }
    return this.cmsConfigService.getPageSettingsByPages(pages);
  }
}
