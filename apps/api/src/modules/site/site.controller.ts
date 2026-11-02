/**
 * SiteController — 公开站点统计(首页 / AuthShell 用)
 *
 * - GET /api/v1/site/stats   4 KPI + 1 推荐课程 + term 标签
 *
 * 公开 endpoint, 不走 JwtAuthGuard(首页和登录页都要用)
 * ThrottlerModule 提供全局传输层限流；敏感写接口另设更严格额度。
 */
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SiteService } from './site.service';

@ApiTags('site')
@Controller({ path: 'site', version: '1' })
export class SiteController {
  constructor(private readonly siteService: SiteService) {}

  @Get('stats')
  @ApiOperation({
    summary: '公开站点统计(首页 hero / 登录注册页品牌侧)',
  })
  getStats() {
    return this.siteService.getStats();
  }
}
