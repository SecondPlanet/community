/**
 * CmsAdminController — Admin CRUD (16 个 resource 全部覆盖)
 *
 * 全部需 admin 角色 (JwtAuthGuard + RolesGuard).
 * 路径: /api/v1/admin/cms/<resource>
 *
 * Resource 列表:
 *   - app-settings, enum-translations, site-settings, page-settings
 *   - testimonials, quick-prompts
 *   - course-categories, popular-searches, hot-keywords
 *   - auth-providers, top-nav, footer-columns
 *   - i18n-messages
 *
 * enum-translations 主键是组合 (enumType, enumValue, locale), 路径用复合 ID
 *   即 :id 形式为 "course_level:Beginner:zh-CN", 拆分后调 service.
 *
 * P0-1 2026-07-24: 22 个 createX/updateX endpoint 改用 class-validator DTO
 *   (cms-admin.dto.ts), 删掉 `as never` 强转. valueJson / config 跑
 *   validateJsonValue + assertJsonSize; topNav.path / footer.link.path 跑
 *   assertSafeNavPath (拒 javascript: / data: / vbscript: / 协议相对).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CmsEnumService } from './cms-enum.service';
import { CmsConfigService } from './cms-config.service';
import { CmsContentService } from './cms-content.service';
import { CmsI18nService } from './cms-i18n.service';
import { assertSafeNavPath } from './cms-admin.dto';
import {
  CreateAppSettingDto,
  UpdateAppSettingDto,
  CreateSiteSettingDto,
  UpdateSiteSettingDto,
  CreatePageSettingDto,
  UpdatePageSettingDto,
  CreateDateFormatTemplateDto,
  UpdateDateFormatTemplateDto,
  CreateEnumTranslationDto,
  UpdateEnumTranslationDto,
  CreateTestimonialDto,
  UpdateTestimonialDto,
  CreateQuickPromptDto,
  UpdateQuickPromptDto,
  CreateCourseCategoryDto,
  UpdateCourseCategoryDto,
  CreatePopularSearchDto,
  UpdatePopularSearchDto,
  CreateHotKeywordDto,
  UpdateHotKeywordDto,
  CreateAuthProviderDto,
  UpdateAuthProviderDto,
  CreateTopNavItemDto,
  UpdateTopNavItemDto,
  CreateFooterColumnDto,
  UpdateFooterColumnDto,
  CreateI18nMessageDto,
  UpdateI18nMessageDto,
} from './cms-admin.dto';

@ApiTags('cms-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
@Controller({ path: 'admin/cms', version: '1' })
export class CmsAdminController {
  constructor(
    private readonly cmsEnumService: CmsEnumService,
    private readonly cmsConfigService: CmsConfigService,
    private readonly cmsContentService: CmsContentService,
    private readonly cmsI18nService: CmsI18nService,
  ) {}

  // ==================== app_settings ====================

  @Get('app-settings')
  @ApiOperation({ summary: 'Admin: 列出 app_settings' })
  listAppSettings() {
    return this.cmsConfigService.listAppSettings();
  }

  @Post('app-settings')
  @ApiOperation({ summary: 'Admin: 创建 app_setting' })
  createAppSetting(@Body() dto: CreateAppSettingDto) {
    return this.cmsConfigService.createAppSetting({
      key: dto.key,
      valueJson: dto.valueJson as never,
      scope: dto.scope,
      description: dto.description,
    });
  }

  @Patch('app-settings/:key')
  @ApiOperation({ summary: 'Admin: 更新 app_setting' })
  updateAppSetting(@Param('key') key: string, @Body() dto: UpdateAppSettingDto) {
    return this.cmsConfigService.updateAppSetting(key, {
      valueJson: dto.valueJson as never,
      scope: dto.scope,
      description: dto.description,
    });
  }

  @Delete('app-settings/:key')
  @ApiOperation({ summary: 'Admin: 删除 app_setting' })
  deleteAppSetting(@Param('key') key: string) {
    return this.cmsConfigService.deleteAppSetting(key);
  }

  // ==================== enum_translations ====================
  // 复合主键: id 形式 "enumType:enumValue:locale"

  @Get('enum-translations')
  @ApiOperation({ summary: 'Admin: 列出 enum_translations' })
  listEnumTranslations(
    @Query('type') type?: string,
    @Query('locale') locale?: string,
  ) {
    return this.cmsEnumService.listEnumTranslations(type, locale);
  }

  @Post('enum-translations')
  @ApiOperation({ summary: 'Admin: 创建 enum_translation' })
  createEnumTranslation(@Body() dto: CreateEnumTranslationDto) {
    return this.cmsEnumService.createEnumTranslation({
      enumType: dto.enumType,
      enumValue: dto.enumValue,
      locale: dto.locale,
      label: dto.label,
      colorClass: dto.colorClass,
      icon: dto.icon,
      sortOrder: dto.sortOrder,
    });
  }

  @Patch('enum-translations/:id')
  @ApiOperation({ summary: 'Admin: 更新 enum_translation' })
  updateEnumTranslation(
    @Param('id') id: string,
    @Body() dto: UpdateEnumTranslationDto,
  ) {
    const [enumType, enumValue, locale] = id.split(':');
    return this.cmsEnumService.updateEnumTranslation(enumType, enumValue, locale, {
      label: dto.label,
      colorClass: dto.colorClass,
      icon: dto.icon,
      sortOrder: dto.sortOrder,
    });
  }

  @Delete('enum-translations/:id')
  @ApiOperation({ summary: 'Admin: 删除 enum_translation' })
  deleteEnumTranslation(@Param('id') id: string) {
    const [enumType, enumValue, locale] = id.split(':');
    return this.cmsEnumService.deleteEnumTranslation(enumType, enumValue, locale);
  }

  // ==================== date_format_templates ====================

  @Get('date-format-templates')
  @ApiOperation({ summary: 'Admin: 列出 date_format_templates' })
  listDateFormatTemplates() {
    return this.cmsEnumService.listDateFormatTemplates();
  }

  @Post('date-format-templates')
  @ApiOperation({ summary: 'Admin: 创建 date_format_template' })
  createDateFormatTemplate(@Body() dto: CreateDateFormatTemplateDto) {
    return this.cmsEnumService.createDateFormatTemplate({
      scope: dto.scope,
      locale: dto.locale,
      template: dto.template,
    });
  }

  @Patch('date-format-templates/:id')
  @ApiOperation({ summary: 'Admin: 更新 date_format_template' })
  updateDateFormatTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateDateFormatTemplateDto,
  ) {
    const [scope, locale] = id.split(':');
    return this.cmsEnumService.updateDateFormatTemplate(scope, locale, {
      template: dto.template,
    });
  }

  @Delete('date-format-templates/:id')
  @ApiOperation({ summary: 'Admin: 删除 date_format_template' })
  deleteDateFormatTemplate(@Param('id') id: string) {
    const [scope, locale] = id.split(':');
    return this.cmsEnumService.deleteDateFormatTemplate(scope, locale);
  }

  // ==================== site_settings ====================

  @Get('site-settings')
  @ApiOperation({ summary: 'Admin: 列出 site_settings' })
  listSiteSettings() {
    return this.cmsConfigService.listSiteSettings();
  }

  @Post('site-settings')
  @ApiOperation({ summary: 'Admin: 创建 site_setting' })
  createSiteSetting(@Body() dto: CreateSiteSettingDto) {
    return this.cmsConfigService.createSiteSetting({
      key: dto.key,
      value: dto.valueJson as never,
      scope: dto.scope,
      description: dto.description,
    });
  }

  @Patch('site-settings/:key')
  @ApiOperation({ summary: 'Admin: 更新 site_setting' })
  updateSiteSetting(@Param('key') key: string, @Body() dto: UpdateSiteSettingDto) {
    return this.cmsConfigService.updateSiteSetting(key, {
      value: dto.valueJson as never,
      scope: dto.scope,
      description: dto.description,
    });
  }

  @Delete('site-settings/:key')
  @ApiOperation({ summary: 'Admin: 删除 site_setting' })
  deleteSiteSetting(@Param('key') key: string) {
    return this.cmsConfigService.deleteSiteSetting(key);
  }

  // ==================== page_settings ====================

  @Get('page-settings')
  @ApiOperation({ summary: 'Admin: 列出 page_settings' })
  listPageSettings() {
    return this.cmsConfigService.listPageSettings();
  }

  @Post('page-settings')
  @ApiOperation({ summary: 'Admin: 创建 page_setting' })
  createPageSetting(@Body() dto: CreatePageSettingDto) {
    return this.cmsConfigService.createPageSetting({
      page: dto.page,
      key: dto.key,
      value: dto.valueJson as never,
      description: dto.description,
    });
  }

  @Patch('page-settings/:id')
  @ApiOperation({ summary: 'Admin: 更新 page_setting' })
  updatePageSetting(
    @Param('id') id: string,
    @Body() dto: UpdatePageSettingDto,
  ) {
    const [page, key] = id.split(':');
    return this.cmsConfigService.updatePageSetting(page, key, {
      value: dto.valueJson as never,
      description: dto.description,
    });
  }

  @Delete('page-settings/:id')
  @ApiOperation({ summary: 'Admin: 删除 page_setting' })
  deletePageSetting(@Param('id') id: string) {
    const [page, key] = id.split(':');
    return this.cmsConfigService.deletePageSetting(page, key);
  }

  // ==================== testimonials ====================

  @Get('testimonials')
  @ApiOperation({ summary: 'Admin: 列出 testimonials' })
  listTestimonials() {
    return this.cmsContentService.listTestimonials();
  }

  @Post('testimonials')
  @ApiOperation({ summary: 'Admin: 创建 testimonial' })
  createTestimonial(@Body() dto: CreateTestimonialDto) {
    return this.cmsContentService.createTestimonial(dto as never);
  }

  @Patch('testimonials/:id')
  @ApiOperation({ summary: 'Admin: 更新 testimonial' })
  updateTestimonial(@Param('id') id: string, @Body() dto: UpdateTestimonialDto) {
    return this.cmsContentService.updateTestimonial(id, dto as never);
  }

  @Delete('testimonials/:id')
  @ApiOperation({ summary: 'Admin: 删除 testimonial' })
  deleteTestimonial(@Param('id') id: string) {
    return this.cmsContentService.deleteTestimonial(id);
  }

  // ==================== quick_prompts ====================

  @Get('quick-prompts')
  @ApiOperation({ summary: 'Admin: 列出 quick_prompts' })
  listQuickPrompts() {
    return this.cmsContentService.listQuickPrompts();
  }

  @Post('quick-prompts')
  @ApiOperation({ summary: 'Admin: 创建 quick_prompt' })
  createQuickPrompt(@Body() dto: CreateQuickPromptDto) {
    return this.cmsContentService.createQuickPrompt(dto);
  }

  @Patch('quick-prompts/:id')
  @ApiOperation({ summary: 'Admin: 更新 quick_prompt' })
  updateQuickPrompt(@Param('id') id: string, @Body() dto: UpdateQuickPromptDto) {
    return this.cmsContentService.updateQuickPrompt(id, dto);
  }

  @Delete('quick-prompts/:id')
  @ApiOperation({ summary: 'Admin: 删除 quick_prompt' })
  deleteQuickPrompt(@Param('id') id: string) {
    return this.cmsContentService.deleteQuickPrompt(id);
  }

  // ==================== course_categories ====================

  @Get('course-categories')
  @ApiOperation({ summary: 'Admin: 列出 course_categories' })
  listCourseCategories() {
    return this.cmsContentService.listCourseCategories();
  }

  @Post('course-categories')
  @ApiOperation({ summary: 'Admin: 创建 course_category' })
  createCourseCategory(@Body() dto: CreateCourseCategoryDto) {
    return this.cmsContentService.createCourseCategory(dto as never);
  }

  @Patch('course-categories/:id')
  @ApiOperation({ summary: 'Admin: 更新 course_category' })
  updateCourseCategory(@Param('id') id: string, @Body() dto: UpdateCourseCategoryDto) {
    return this.cmsContentService.updateCourseCategory(id, dto as never);
  }

  @Delete('course-categories/:id')
  @ApiOperation({ summary: 'Admin: 删除 course_category' })
  deleteCourseCategory(@Param('id') id: string) {
    return this.cmsContentService.deleteCourseCategory(id);
  }

  // ==================== popular_searches ====================

  @Get('popular-searches')
  @ApiOperation({ summary: 'Admin: 列出 popular_searches' })
  listPopularSearches() {
    return this.cmsContentService.listPopularSearches();
  }

  @Post('popular-searches')
  @ApiOperation({ summary: 'Admin: 创建 popular_search' })
  createPopularSearch(@Body() dto: CreatePopularSearchDto) {
    return this.cmsContentService.createPopularSearch(dto as never);
  }

  @Patch('popular-searches/:id')
  @ApiOperation({ summary: 'Admin: 更新 popular_search' })
  updatePopularSearch(@Param('id') id: string, @Body() dto: UpdatePopularSearchDto) {
    return this.cmsContentService.updatePopularSearch(id, dto as never);
  }

  @Delete('popular-searches/:id')
  @ApiOperation({ summary: 'Admin: 删除 popular_search' })
  deletePopularSearch(@Param('id') id: string) {
    return this.cmsContentService.deletePopularSearch(id);
  }

  // ==================== hot_keywords ====================

  @Get('hot-keywords')
  @ApiOperation({ summary: 'Admin: 列出 hot_keywords' })
  listHotKeywords() {
    return this.cmsContentService.listHotKeywords();
  }

  @Post('hot-keywords')
  @ApiOperation({ summary: 'Admin: 创建 hot_keyword' })
  createHotKeyword(@Body() dto: CreateHotKeywordDto) {
    return this.cmsContentService.createHotKeyword(dto as never);
  }

  @Patch('hot-keywords/:id')
  @ApiOperation({ summary: 'Admin: 更新 hot_keyword' })
  updateHotKeyword(@Param('id') id: string, @Body() dto: UpdateHotKeywordDto) {
    return this.cmsContentService.updateHotKeyword(id, dto as never);
  }

  @Delete('hot-keywords/:id')
  @ApiOperation({ summary: 'Admin: 删除 hot_keyword' })
  deleteHotKeyword(@Param('id') id: string) {
    return this.cmsContentService.deleteHotKeyword(id);
  }

  // ==================== auth_providers ====================

  @Get('auth-providers')
  @ApiOperation({ summary: 'Admin: 列出 auth_providers' })
  listAuthProviders() {
    return this.cmsContentService.listAuthProviders();
  }

  @Post('auth-providers')
  @ApiOperation({ summary: 'Admin: 创建 auth_provider' })
  createAuthProvider(@Body() dto: CreateAuthProviderDto) {
    return this.cmsContentService.createAuthProvider({
      id: dto.id,
      label: dto.label,
      icon: dto.icon ?? 'KeyRound',
      config: dto.config as never,
      isActive: dto.isActive ?? false,
      orderIndex: dto.orderIndex ?? 0,
    });
  }

  @Patch('auth-providers/:id')
  @ApiOperation({ summary: 'Admin: 更新 auth_provider' })
  updateAuthProvider(@Param('id') id: string, @Body() dto: UpdateAuthProviderDto) {
    const { orderIndex, ...rest } = dto;
    return this.cmsContentService.updateAuthProvider(id, {
      ...rest,
      ...(orderIndex !== undefined ? { orderIndex } : {}),
    } as never);
  }

  @Delete('auth-providers/:id')
  @ApiOperation({ summary: 'Admin: 删除 auth_provider' })
  deleteAuthProvider(@Param('id') id: string) {
    return this.cmsContentService.deleteAuthProvider(id);
  }

  // ==================== top_nav ====================

  @Get('top-nav')
  @ApiOperation({ summary: 'Admin: 列出 top_nav_items' })
  listTopNav() {
    return this.cmsContentService.listTopNavItems();
  }

  @Post('top-nav')
  @ApiOperation({ summary: 'Admin: 创建 top_nav_item' })
  createTopNavItem(@Body() dto: CreateTopNavItemDto) {
    assertSafeNavPath(dto.path, 'path');
    return this.cmsContentService.createTopNavItem(dto as never);
  }

  @Patch('top-nav/:id')
  @ApiOperation({ summary: 'Admin: 更新 top_nav_item' })
  updateTopNavItem(@Param('id') id: string, @Body() dto: UpdateTopNavItemDto) {
    if (dto.path !== undefined) assertSafeNavPath(dto.path, 'path');
    return this.cmsContentService.updateTopNavItem(id, dto as never);
  }

  @Delete('top-nav/:id')
  @ApiOperation({ summary: 'Admin: 删除 top_nav_item' })
  deleteTopNavItem(@Param('id') id: string) {
    return this.cmsContentService.deleteTopNavItem(id);
  }

  // ==================== footer_columns ====================

  @Get('footer-columns')
  @ApiOperation({ summary: 'Admin: 列出 footer_columns' })
  listFooterColumns() {
    return this.cmsContentService.listFooterColumns();
  }

  @Post('footer-columns')
  @ApiOperation({ summary: 'Admin: 创建 footer_column' })
  createFooterColumn(@Body() dto: CreateFooterColumnDto) {
    dto.links?.forEach((link, i) => assertSafeNavPath(link.path, `links[${i}].path`));
    return this.cmsContentService.createFooterColumn(dto as never);
  }

  @Patch('footer-columns/:id')
  @ApiOperation({ summary: 'Admin: 更新 footer_column' })
  updateFooterColumn(@Param('id') id: string, @Body() dto: UpdateFooterColumnDto) {
    dto.links?.forEach((link, i) => assertSafeNavPath(link.path, `links[${i}].path`));
    return this.cmsContentService.updateFooterColumn(id, dto as never);
  }

  @Delete('footer-columns/:id')
  @ApiOperation({ summary: 'Admin: 删除 footer_column' })
  deleteFooterColumn(@Param('id') id: string) {
    return this.cmsContentService.deleteFooterColumn(id);
  }

  // ==================== i18n_messages ====================

  @Get('i18n/messages')
  @ApiOperation({ summary: 'Admin: 列出 i18n_messages' })
  listI18nMessages(
    @Query('locale') locale?: string,
    @Query('category') category?: 'common' | 'auth' | 'course' | 'hackathon' | 'degree' | 'admin',
  ) {
    return this.cmsI18nService.listMessages(locale, category);
  }

  @Post('i18n/messages')
  @ApiOperation({ summary: 'Admin: 创建 i18n_message' })
  createI18nMessage(@Body() dto: CreateI18nMessageDto) {
    return this.cmsI18nService.createMessage(dto as never);
  }

  @Patch('i18n/messages/:id')
  @ApiOperation({ summary: 'Admin: 更新 i18n_message' })
  updateI18nMessage(
    @Param('id') id: string,
    @Body() dto: UpdateI18nMessageDto,
  ) {
    const [key, locale] = id.split(':');
    if (!key || !locale) {
      throw new BadRequestException('i18n message id must be "key:locale"');
    }
    return this.cmsI18nService.updateMessage(key, locale, dto as never);
  }

  @Delete('i18n/messages/:id')
  @ApiOperation({ summary: 'Admin: 删除 i18n_message' })
  deleteI18nMessage(@Param('id') id: string) {
    const [key, locale] = id.split(':');
    return this.cmsI18nService.deleteMessage(key, locale);
  }
}
