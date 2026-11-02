/**
 * CmsConfigService — app_settings + site_settings + page_settings 的纯 Prisma 封装
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, AppSettingScope, SiteSettingScope } from '@prisma/client';
import { validateJsonValue, assertJsonSize } from './cms-config.validator';

@Injectable()
export class CmsConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- app_settings ----

  listAppSettings(scope?: string) {
    return this.prisma.appSetting.findMany({
      where: scope ? { scope: scope as AppSettingScope } : {},
      orderBy: { key: 'asc' },
    });
  }

  getAppSetting(key: string) {
    return this.prisma.appSetting.findUnique({ where: { key } });
  }

  createAppSetting(data: {
    key: string;
    valueJson: Prisma.InputJsonValue;
    scope?: AppSettingScope;
    description?: string;
  }) {
    validateJsonValue(data.valueJson);
    assertJsonSize(data.valueJson);
    return this.prisma.appSetting.create({ data });
  }

  updateAppSetting(
    key: string,
    data: { valueJson?: Prisma.InputJsonValue; scope?: AppSettingScope; description?: string },
  ) {
    if (data.valueJson !== undefined) {
      validateJsonValue(data.valueJson);
      assertJsonSize(data.valueJson);
    }
    return this.prisma.appSetting.update({ where: { key }, data });
  }

  deleteAppSetting(key: string) {
    return this.prisma.appSetting.delete({ where: { key } });
  }

  // ---- site_settings ----

  listSiteSettings(scope?: string) {
    return this.prisma.siteSetting.findMany({
      where: scope ? { scope: scope as SiteSettingScope } : {},
      orderBy: { key: 'asc' },
    });
  }

  /**
   * 按 keys 批量获取. keys 是逗号分隔字符串 (公开 GET 的 ?keys=brand.hero.headline,brand.auth.shell_headline).
   * 返回 Record<key, value>, 没找到的 key 不在结果中.
   */
  async getSiteSettingsByKeys(keys: string[]) {
    if (keys.length === 0) return {};
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: keys } },
    });
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      out[row.key] = row.value;
    }
    return out;
  }

  getSiteSetting(key: string) {
    return this.prisma.siteSetting.findUnique({ where: { key } });
  }

  createSiteSetting(data: {
    key: string;
    value: Prisma.InputJsonValue;
    scope?: SiteSettingScope;
    description?: string;
  }) {
    validateJsonValue(data.value);
    assertJsonSize(data.value);
    return this.prisma.siteSetting.create({ data });
  }

  updateSiteSetting(
    key: string,
    data: { value?: Prisma.InputJsonValue; scope?: SiteSettingScope; description?: string },
  ) {
    if (data.value !== undefined) {
      validateJsonValue(data.value);
      assertJsonSize(data.value);
    }
    return this.prisma.siteSetting.update({ where: { key }, data });
  }

  deleteSiteSetting(key: string) {
    return this.prisma.siteSetting.delete({ where: { key } });
  }

  // ---- page_settings ----

  listPageSettings(page?: string) {
    return this.prisma.pageSetting.findMany({
      where: page ? { page } : {},
      orderBy: [{ page: 'asc' }, { key: 'asc' }],
    });
  }

  /**
   * 按 page 列表批量获取 (公开 GET 的 ?page=home&page=courses).
   * 返回 Record<page, Record<key, value>>.
   */
  async getPageSettingsByPages(pages: string[]) {
    if (pages.length === 0) return {};
    const rows = await this.prisma.pageSetting.findMany({
      where: { page: { in: pages } },
    });
    const out: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      if (!out[row.page]) out[row.page] = {};
      out[row.page][row.key] = row.value;
    }
    return out;
  }

  getPageSetting(page: string, key: string) {
    return this.prisma.pageSetting.findUnique({ where: { page_key: { page, key } } });
  }

  createPageSetting(data: {
    page: string;
    key: string;
    value: Prisma.InputJsonValue;
    description?: string;
  }) {
    validateJsonValue(data.value);
    assertJsonSize(data.value);
    return this.prisma.pageSetting.create({ data });
  }

  updatePageSetting(
    page: string,
    key: string,
    data: { value?: Prisma.InputJsonValue; description?: string },
  ) {
    if (data.value !== undefined) {
      validateJsonValue(data.value);
      assertJsonSize(data.value);
    }
    return this.prisma.pageSetting.update({ where: { page_key: { page, key } }, data });
  }

  deletePageSetting(page: string, key: string) {
    return this.prisma.pageSetting.delete({ where: { page_key: { page, key } } });
  }
}
