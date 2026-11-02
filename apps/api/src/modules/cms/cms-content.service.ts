/**
 * CmsContentService — list resource 的纯 Prisma 封装
 *
 * 覆盖: testimonials / quick_prompts / course_categories / popular_searches
 *       hot_keywords / auth_providers / top_nav_items / footer_columns
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, QuickPromptScope, HotKeywordScope } from '@prisma/client';
import type { CreateQuickPromptDto, UpdateQuickPromptDto } from './cms-admin.dto';

@Injectable()
export class CmsContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- testimonials ----

  listTestimonials(scope?: { isActive?: boolean }) {
    return this.prisma.testimonial.findMany({
      where: scope?.isActive !== undefined ? { isActive: scope.isActive } : {},
      orderBy: { orderIndex: 'asc' },
    });
  }

  getTestimonial(id: string) {
    return this.prisma.testimonial.findUnique({ where: { id } });
  }

  createTestimonial(data: Prisma.TestimonialCreateInput) {
    return this.prisma.testimonial.create({ data });
  }

  updateTestimonial(id: string, data: Prisma.TestimonialUpdateInput) {
    return this.prisma.testimonial.update({ where: { id }, data });
  }

  deleteTestimonial(id: string) {
    return this.prisma.testimonial.delete({ where: { id } });
  }

  // ---- quick_prompts ----

  listQuickPrompts(scope?: { isActive?: boolean; promptScope?: string }) {
    const where: Prisma.QuickPromptWhereInput = {};
    if (scope?.isActive !== undefined) where.isActive = scope.isActive;
    if (scope?.promptScope) where.scope = scope.promptScope as QuickPromptScope;
    return this.prisma.quickPrompt.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    });
  }

  getQuickPrompt(id: string) {
    return this.prisma.quickPrompt.findUnique({ where: { id } });
  }

  createQuickPrompt(data: CreateQuickPromptDto) {
    return this.prisma.quickPrompt.create({ data });
  }

  updateQuickPrompt(id: string, data: UpdateQuickPromptDto) {
    return this.prisma.quickPrompt.update({ where: { id }, data });
  }

  deleteQuickPrompt(id: string) {
    return this.prisma.quickPrompt.delete({ where: { id } });
  }

  // ---- course_categories ----

  listCourseCategories(scope?: { isActive?: boolean }) {
    return this.prisma.courseCategory.findMany({
      where: scope?.isActive !== undefined ? { isActive: scope.isActive } : {},
      orderBy: { orderIndex: 'asc' },
    });
  }

  getCourseCategory(id: string) {
    return this.prisma.courseCategory.findUnique({ where: { id } });
  }

  createCourseCategory(data: Prisma.CourseCategoryCreateInput) {
    return this.prisma.courseCategory.create({ data });
  }

  updateCourseCategory(id: string, data: Prisma.CourseCategoryUpdateInput) {
    return this.prisma.courseCategory.update({ where: { id }, data });
  }

  deleteCourseCategory(id: string) {
    return this.prisma.courseCategory.delete({ where: { id } });
  }

  // ---- popular_searches ----

  listPopularSearches(scope?: { isActive?: boolean }) {
    return this.prisma.popularSearch.findMany({
      where: scope?.isActive !== undefined ? { isActive: scope.isActive } : {},
      orderBy: { orderIndex: 'asc' },
    });
  }

  getPopularSearch(id: string) {
    return this.prisma.popularSearch.findUnique({ where: { id } });
  }

  createPopularSearch(data: Prisma.PopularSearchCreateInput) {
    return this.prisma.popularSearch.create({ data });
  }

  updatePopularSearch(id: string, data: Prisma.PopularSearchUpdateInput) {
    return this.prisma.popularSearch.update({ where: { id }, data });
  }

  deletePopularSearch(id: string) {
    return this.prisma.popularSearch.delete({ where: { id } });
  }

  // ---- hot_keywords ----

  listHotKeywords(scope?: { isActive?: boolean; keywordScope?: string }) {
    const where: Prisma.HotKeywordWhereInput = {};
    if (scope?.isActive !== undefined) where.isActive = scope.isActive;
    if (scope?.keywordScope) where.scope = scope.keywordScope as HotKeywordScope;
    return this.prisma.hotKeyword.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    });
  }

  getHotKeyword(id: string) {
    return this.prisma.hotKeyword.findUnique({ where: { id } });
  }

  createHotKeyword(data: Prisma.HotKeywordCreateInput) {
    return this.prisma.hotKeyword.create({ data });
  }

  updateHotKeyword(id: string, data: Prisma.HotKeywordUpdateInput) {
    return this.prisma.hotKeyword.update({ where: { id }, data });
  }

  deleteHotKeyword(id: string) {
    return this.prisma.hotKeyword.delete({ where: { id } });
  }

  // ---- auth_providers ----

  /**
   * 公开端点列表 — 严格 select 排除 `config` 字段,防止 OAuth client_secret /
   * redirect_url 泄露给任意访问者。Admin 路径走 listAuthProviders 全量。
   * (P0 安全加固 2026-07-23)
   */
  listAuthProvidersPublic() {
    return this.prisma.authProvider.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        label: true,
        icon: true,
        isActive: true,
        orderIndex: true,
        // config 故意不 select — admin 才有权限看
      },
    });
  }

  listAuthProviders() {
    return this.prisma.authProvider.findMany({
      orderBy: { orderIndex: 'asc' },
    });
  }

  getAuthProvider(id: string) {
    return this.prisma.authProvider.findUnique({ where: { id } });
  }

  createAuthProvider(data: Prisma.AuthProviderCreateInput) {
    return this.prisma.authProvider.create({ data });
  }

  updateAuthProvider(id: string, data: Prisma.AuthProviderUpdateInput) {
    return this.prisma.authProvider.update({ where: { id }, data });
  }

  deleteAuthProvider(id: string) {
    return this.prisma.authProvider.delete({ where: { id } });
  }

  // ---- top_nav_items ----

  listTopNavItems(scope?: { isActive?: boolean }) {
    return this.prisma.topNavItem.findMany({
      where: scope?.isActive !== undefined ? { isActive: scope.isActive } : {},
      orderBy: { orderIndex: 'asc' },
    });
  }

  getTopNavItem(id: string) {
    return this.prisma.topNavItem.findUnique({ where: { id } });
  }

  createTopNavItem(data: Prisma.TopNavItemCreateInput) {
    return this.prisma.topNavItem.create({ data });
  }

  updateTopNavItem(id: string, data: Prisma.TopNavItemUpdateInput) {
    return this.prisma.topNavItem.update({ where: { id }, data });
  }

  deleteTopNavItem(id: string) {
    return this.prisma.topNavItem.delete({ where: { id } });
  }

  // ---- footer_columns ----

  listFooterColumns(scope?: { isActive?: boolean }) {
    return this.prisma.footerColumn.findMany({
      where: scope?.isActive !== undefined ? { isActive: scope.isActive } : {},
      orderBy: { orderIndex: 'asc' },
    });
  }

  getFooterColumn(id: string) {
    return this.prisma.footerColumn.findUnique({ where: { id } });
  }

  createFooterColumn(data: Prisma.FooterColumnCreateInput) {
    return this.prisma.footerColumn.create({ data });
  }

  updateFooterColumn(id: string, data: Prisma.FooterColumnUpdateInput) {
    return this.prisma.footerColumn.update({ where: { id }, data });
  }

  deleteFooterColumn(id: string) {
    return this.prisma.footerColumn.delete({ where: { id } });
  }
}
