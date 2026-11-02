/**
 * cms-admin.dto.ts — Admin CRUD 的 class-validator DTO (P0-1 2026-07-24)
 *
 * 22 个 createX/updateX endpoint 之前全用 `@Body() body: Record<string, unknown>`,
 * admin 凭证泄露 / 误操作可写恶意 payload (auth_provider.config / topNav.path /
 * bullets 等). 这里用 class-validator + 自定义校验, 10 个 resource 各
 * 1 CreateDto + 1 UpdateDto (UpdateDto 全字段 optional).
 *
 * 约束:
 *   - 跟 uploads.dto.ts 风格一致: @IsString / @IsOptional / @MaxLength / @IsEnum
 *     / @IsArray / @IsInt + @ApiProperty / @ApiPropertyOptional
 *   - valueJson / config 跑 `validateJsonValue` + `assertJsonSize` 防 DoS
 *   - topNav.path / footer.link.path 跑 `safeNavPath` 防 XSS / open-redirect
 *     (前后端白名单一致, 拒 javascript: / data: / vbscript: / 协议相对 //)
 *   - service 层签名不变, controller 在 body 解析后用 plain object 传入
 */
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
  MaxLength,
  Min,
  ArrayMaxSize,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import {
  AppSettingScope,
  SiteSettingScope,
  DateFormatTemplateScope,
  QuickPromptScope,
  HotKeywordScope as PrismaHotKeywordScope,
} from '@prisma/client';
import { assertJsonSize, validateJsonValue } from './cms-config.validator';

// ========== 共享 helper ==========

/** 后端等价 safeNavPath: 与 apps/web/src/lib/cms.ts:1070-1085 白名单一致 */
export function assertSafeNavPath(value: unknown, fieldName = 'path'): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${fieldName} must be a non-empty string`);
  }
  const p = value.trim();
  if (p.startsWith('//')) {
    throw new BadRequestException(`${fieldName} must not be a protocol-relative URL`);
  }
  if (p.startsWith('/')) return;
  if (/^https?:\/\//i.test(p)) return;
  if (p.startsWith('#')) return;
  if (/^(mailto|tel):/i.test(p)) return;
  throw new BadRequestException(
    `${fieldName} must start with "/", "http(s)://", "#", "mailto:", or "tel:"`,
  );
}

/** 给 DTO 字段的 @Transform, 把 incoming value 走一遍 validateJsonValue + assertJsonSize */
function TransformJsonField() {
  return Transform(({ value }) => {
    if (value === undefined) return value;
    validateJsonValue(value);
    assertJsonSize(value);
    return value;
  });
}

// ========== app_settings / site_settings ==========

export class CreateAppSettingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: 'JSON value (任意合法 JSON, ≤64KB, depth≤10)' })
  @TransformJsonField()
  valueJson: unknown;

  @ApiPropertyOptional({ enum: AppSettingScope })
  @IsOptional()
  @IsEnum(AppSettingScope)
  scope?: AppSettingScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateAppSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @TransformJsonField()
  valueJson?: unknown;

  @ApiPropertyOptional({ enum: AppSettingScope })
  @IsOptional()
  @IsEnum(AppSettingScope)
  scope?: AppSettingScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateSiteSettingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: 'JSON value (任意合法 JSON, ≤64KB, depth≤10)' })
  @TransformJsonField()
  valueJson: unknown;

  @ApiPropertyOptional({ enum: SiteSettingScope })
  @IsOptional()
  @IsEnum(SiteSettingScope)
  scope?: SiteSettingScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateSiteSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @TransformJsonField()
  valueJson?: unknown;

  @ApiPropertyOptional({ enum: SiteSettingScope })
  @IsOptional()
  @IsEnum(SiteSettingScope)
  scope?: SiteSettingScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

// ========== page_settings ==========

export class CreatePageSettingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  page: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: 'JSON value (任意合法 JSON, ≤64KB, depth≤10)' })
  @TransformJsonField()
  valueJson: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdatePageSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @TransformJsonField()
  valueJson?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

// ========== enum_translations ==========

export class CreateEnumTranslationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  enumType: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  enumValue: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  locale: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  colorClass?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateEnumTranslationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  colorClass?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// ========== date_format_templates ==========

export class CreateDateFormatTemplateDto {
  @ApiProperty({ enum: DateFormatTemplateScope })
  @IsEnum(DateFormatTemplateScope)
  scope: DateFormatTemplateScope;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  locale: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  template: string;
}

export class UpdateDateFormatTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  template: string;
}

// ========== testimonials ==========

export class CreateTestimonialDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  quote: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;
}

export class UpdateTestimonialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  quote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;
}

// ========== quick_prompts ==========

export class CreateQuickPromptDto {
  @ApiPropertyOptional({ default: '💡' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  promptText: string;

  @ApiPropertyOptional({ enum: QuickPromptScope })
  @IsOptional()
  @IsEnum(QuickPromptScope)
  scope?: QuickPromptScope;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class UpdateQuickPromptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  promptText?: string;

  @ApiPropertyOptional({ enum: QuickPromptScope })
  @IsOptional()
  @IsEnum(QuickPromptScope)
  scope?: QuickPromptScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

// ========== course_categories ==========

export class CreateCourseCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateCourseCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

// ========== popular_searches ==========

export class CreatePopularSearchDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  keyword: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdatePopularSearchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

// ========== hot_keywords ==========

// P1-2 (2026-07-24): scope 改成 prisma enum 同步 (courses / home / search / all).
// 之前 DTO 是 ['homepage', 'search', 'course', 'all'] — 跟 prisma default 'courses' 不一致,
// 与 Prisma enum 保持一致，避免后台写入前端无法识别的 scope。
export const HOT_KEYWORD_SCOPES = ['courses', 'home', 'search', 'all'] as const;
export type HotKeywordScope = (typeof HOT_KEYWORD_SCOPES)[number];

export class CreateHotKeywordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  keyword: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ enum: HOT_KEYWORD_SCOPES })
  @IsOptional()
  @IsEnum(PrismaHotKeywordScope)
  scope?: HotKeywordScope;
}

export class UpdateHotKeywordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ enum: HOT_KEYWORD_SCOPES })
  @IsOptional()
  @IsEnum(PrismaHotKeywordScope)
  scope?: HotKeywordScope;
}

// ========== auth_providers ==========

export class CreateAuthProviderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional({ description: 'JSON config (≤64KB, depth≤10). 不要存 OAuth client_secret。' })
  @IsOptional()
  @TransformJsonField()
  config: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAuthProviderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional({ description: 'JSON config (≤64KB, depth≤10). 不要存 OAuth client_secret。' })
  @IsOptional()
  @TransformJsonField()
  config?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ========== top_nav ==========

export class CreateTopNavItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiProperty({
    description:
      '白名单: 内部路由("/xxx") / 外部("https://...") / 锚点("#xxx") / mailto: / tel:. 拒 javascript: / data: / vbscript: / 协议相对("//evil.com")',
  })
  @IsString()
  @MaxLength(500)
  path: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTopNavItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description:
      '白名单: 内部路由("/xxx") / 外部("https://...") / 锚点("#xxx") / mailto: / tel:. 拒 javascript: / data: / vbscript: / 协议相对("//evil.com")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ========== footer_columns ==========

export class FooterLinkDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiProperty({
    description:
      '白名单: 内部路由("/xxx") / 外部("https://...") / 锚点("#xxx") / mailto: / tel:. 拒 javascript: / data: / vbscript: / 协议相对("//evil.com")',
  })
  @IsString()
  @MaxLength(500)
  path: string;
}

export class CreateFooterColumnDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ type: [FooterLinkDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FooterLinkDto)
  @ArrayMinSize(0)
  links?: FooterLinkDto[];
}

export class UpdateFooterColumnDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ type: [FooterLinkDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FooterLinkDto)
  @ArrayMinSize(0)
  links?: FooterLinkDto[];
}

// ========== i18n_messages ==========

export class CreateI18nMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  key: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  locale: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  value: string;

  @ApiPropertyOptional({ enum: ['common', 'auth', 'course', 'hackathon', 'degree', 'admin'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateI18nMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  value?: string;

  @ApiPropertyOptional({ enum: ['common', 'auth', 'course', 'hackathon', 'degree', 'admin'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
