/**
 * CmsI18nService — i18n_messages 表的纯 Prisma 封装
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CmsI18nService {
  constructor(private readonly prisma: PrismaService) {}

  listMessages(locale?: string, category?: 'common' | 'auth' | 'course' | 'hackathon' | 'degree' | 'admin') {
    return this.prisma.i18nMessage.findMany({
      where: {
        ...(locale ? { locale } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  getMessage(key: string, locale: string) {
    return this.prisma.i18nMessage.findUnique({ where: { key_locale: { key, locale } } });
  }

  createMessage(data: Prisma.I18nMessageCreateInput) {
    return this.prisma.i18nMessage.create({ data });
  }

  updateMessage(key: string, locale: string, data: Prisma.I18nMessageUpdateInput) {
    return this.prisma.i18nMessage.update({
      where: { key_locale: { key, locale } },
      data,
    });
  }

  deleteMessage(key: string, locale: string) {
    return this.prisma.i18nMessage.delete({ where: { key_locale: { key, locale } } });
  }
}
