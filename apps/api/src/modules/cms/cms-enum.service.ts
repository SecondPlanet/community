/**
 * CmsEnumService — enum_translations + date_format_templates 的纯 Prisma 封装
 *
 * 服务层只做 query, 不做业务规则. controller 做参数解析和权限.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateFormatTemplateScope } from '@prisma/client';

@Injectable()
export class CmsEnumService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- enum_translations ----

  listEnumTranslations(enumType?: string, locale?: string) {
    return this.prisma.enumTranslation.findMany({
      where: {
        ...(enumType ? { enumType } : {}),
        ...(locale ? { locale } : {}),
      },
      orderBy: [{ enumType: 'asc' }, { sortOrder: 'asc' }, { enumValue: 'asc' }],
    });
  }

  getEnumTranslation(enumType: string, enumValue: string, locale: string) {
    return this.prisma.enumTranslation.findUnique({
      where: { enumType_enumValue_locale: { enumType, enumValue, locale } },
    });
  }

  createEnumTranslation(data: {
    enumType: string;
    enumValue: string;
    locale: string;
    label: string;
    colorClass?: string;
    icon?: string;
    sortOrder?: number;
  }) {
    return this.prisma.enumTranslation.create({ data });
  }

  updateEnumTranslation(
    enumType: string,
    enumValue: string,
    locale: string,
    data: { label?: string; colorClass?: string; icon?: string; sortOrder?: number },
  ) {
    return this.prisma.enumTranslation.update({
      where: { enumType_enumValue_locale: { enumType, enumValue, locale } },
      data,
    });
  }

  deleteEnumTranslation(enumType: string, enumValue: string, locale: string) {
    return this.prisma.enumTranslation.delete({
      where: { enumType_enumValue_locale: { enumType, enumValue, locale } },
    });
  }

  // ---- date_format_templates ----

  listDateFormatTemplates(scope?: string, locale?: string) {
    return this.prisma.dateFormatTemplate.findMany({
      where: {
        ...(scope ? { scope: scope as DateFormatTemplateScope } : {}),
        ...(locale ? { locale } : {}),
      },
    });
  }

  getDateFormatTemplate(scope: string, locale: string) {
    return this.prisma.dateFormatTemplate.findUnique({
      where: { scope_locale: { scope: scope as DateFormatTemplateScope, locale } },
    });
  }

  createDateFormatTemplate(data: { scope: DateFormatTemplateScope; locale: string; template: string }) {
    return this.prisma.dateFormatTemplate.create({ data });
  }

  updateDateFormatTemplate(scope: string, locale: string, data: { template: string }) {
    return this.prisma.dateFormatTemplate.update({
      where: { scope_locale: { scope: scope as DateFormatTemplateScope, locale } },
      data,
    });
  }

  deleteDateFormatTemplate(scope: string, locale: string) {
    return this.prisma.dateFormatTemplate.delete({
      where: { scope_locale: { scope: scope as DateFormatTemplateScope, locale } },
    });
  }
}
