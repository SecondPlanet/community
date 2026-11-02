/**
 * CmsModule — CMS 基础设施 (16 张表, 公开 GET + Admin CRUD)
 *
 * 控制器:
 *   - CmsEnumController    公开: enum-translations + date-format-templates
 *   - CmsConfigController  公开: app-settings + site-settings + page-settings
 *   - CmsContentController 公开: 10 个 list resource
 *   - CmsI18nController    公开: i18n/messages
 *   - CmsAdminController   Admin CRUD: 全部 16 个 resource
 *
 * 服务:
 *   - CmsEnumService     enum_translations + date_format_templates 封装
 *   - CmsConfigService   app_settings + site_settings + page_settings 封装
 *   - CmsContentService  10 个 list resource 封装
 *   - CmsI18nService     i18n_messages 封装
 *
 * 见 review/cms-design.md §1-§2
 */
import { Module } from '@nestjs/common';
import { CmsEnumController } from './cms-enum.controller';
import { CmsConfigController } from './cms-config.controller';
import { CmsContentController } from './cms-content.controller';
import { CmsI18nController } from './cms-i18n.controller';
import { CmsAdminController } from './cms-admin.controller';
import { SitemapController } from './sitemap.controller';
import { CmsEnumService } from './cms-enum.service';
import { CmsConfigService } from './cms-config.service';
import { CmsContentService } from './cms-content.service';
import { CmsI18nService } from './cms-i18n.service';

@Module({
  controllers: [
    CmsEnumController,
    CmsConfigController,
    CmsContentController,
    CmsI18nController,
    CmsAdminController,
    SitemapController,
  ],
  providers: [CmsEnumService, CmsConfigService, CmsContentService, CmsI18nService],
  exports: [CmsEnumService, CmsConfigService, CmsContentService, CmsI18nService],
})
export class CmsModule {}
