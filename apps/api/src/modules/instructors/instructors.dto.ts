import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  IsEmail,
  MaxLength,
  Min,
  Max,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseInstructorRole } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { SafeUrl } from '../../common/validators/safe-url.decorator';

// =============================================================
// 讲师 CRUD DTO
// =============================================================

/**
 * Admin 新建讲师 DTO
 * 注意: slug 留空时由 service 自动生成 (拼音/hash), admin 也可指定
 *       publishedAt: 不填 = 草稿; 填 true = 立即发布; 填 false = 显式置空(草稿)
 */
export class CreateInstructorDto {
  @ApiPropertyOptional({ description: 'URL slug, 留空自动生成', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;

  @ApiProperty({ description: '中文主显示名', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ description: '英文/拼音别名', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameEn?: string;

  @ApiPropertyOptional({ description: '头衔 (自由文本, 不做 enum)', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ description: '英文头衔', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string;

  @ApiPropertyOptional({ description: '一句话标语 (摘要用)', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  headline?: string;

  @ApiPropertyOptional({ description: '英文标语', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  headlineEn?: string;

  @ApiPropertyOptional({ description: '长 bio, markdown', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  bio?: string;

  @ApiPropertyOptional({ description: '英文 bio', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  bioEn?: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  @SafeUrl({ protocols: ['http', 'https'] })
  avatarUrl?: string;

  @ApiPropertyOptional({ description: '当前就职公司', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @ApiPropertyOptional({ description: '从业年限', minimum: 0, maximum: 80 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ description: 'LinkedIn URL' })
  @IsOptional()
  @IsString()
  @SafeUrl({ protocols: ['https'] })
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'GitHub URL' })
  @IsOptional()
  @IsString()
  @SafeUrl({ protocols: ['https'] })
  githubUrl?: string;

  @ApiPropertyOptional({ description: 'Twitter/X URL' })
  @IsOptional()
  @IsString()
  @SafeUrl({ protocols: ['https'] })
  twitterUrl?: string;

  @ApiPropertyOptional({ description: '个人网站 URL' })
  @IsOptional()
  @IsString()
  @SafeUrl({ protocols: ['http', 'https'] })
  websiteUrl?: string;

  @ApiPropertyOptional({ description: '联系邮箱 (admin 可见, 前台不暴露)' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'admin 内部备注', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: '排序权重, 升序', default: 0 })
  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'true=发布, false/null=草稿', default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({
    description: '专长 ID 数组 (创建时一次性挂载)',
    type: [String],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  expertiseIds?: string[];
}

export class UpdateInstructorDto extends PartialType(CreateInstructorDto) {}

// =============================================================
// 列表查询 DTO
// =============================================================

/**
 * 前台 / 后台共用列表查询 DTO
 * - 前台: published=true 强制过滤, 不传 expertise / search 默认空
 * - 后台: 默认 published=null (查所有, 含草稿)
 */
export class QueryInstructorDto {
  @ApiPropertyOptional({ description: '搜索: name/title/headline 模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ description: '按专长 ID 过滤 (多选 OR)' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : []))
  @IsArray()
  @IsString({ each: true })
  expertiseIds?: string[];

  @ApiPropertyOptional({ description: 'null=全部, true=已发布, false=草稿' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({ description: '排序: orderIndex | name | recent', default: 'orderIndex' })
  @IsOptional()
  @IsString()
  sort?: 'orderIndex' | 'name' | 'recent';

  @ApiPropertyOptional({ description: '页码 (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页数量, max 100', default: 24, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// =============================================================
// 课程挂载 DTO
// =============================================================

/**
 * 把讲师/导师挂载到课程
 * - 一门课 1 个主讲师 (instructor + isPrimary)
 * - 0-N 个导师 (mentor)
 * - 同 (courseId, instructorId, role) 已存在则跳过 (idempotent)
 */
export class LinkCourseDto {
  @ApiProperty({ description: '讲师 ID' })
  @IsString()
  instructorId: string;

  @ApiProperty({
    enum: CourseInstructorRole,
    description: '角色: instructor 主讲师 / mentor 导师',
  })
  @IsEnum(CourseInstructorRole)
  role: CourseInstructorRole;

  @ApiPropertyOptional({ description: '是否主讲师, 仅 instructor role 有效', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: '展示顺序', default: 0 })
  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

/**
 * 批量更新课程的讲师挂载 (admin 编辑课程时一次提交)
 * - 整组覆盖该课程的 instructor / mentor link
 * - 提交空数组 = 清空所有 link
 */
export class SyncCourseLinksDto {
  @ApiProperty({ type: [LinkCourseDto], description: '完整 link 列表, 后端 diff 同步' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkCourseDto)
  links: LinkCourseDto[];
}

// =============================================================
// 专长 CRUD DTO
// =============================================================

export class CreateExpertiseDto {
  @ApiProperty({ description: '英文 key, 唯一, 程序内标识', maxLength: 60 })
  @IsString()
  @MaxLength(60)
  key: string;

  @ApiProperty({ description: '中文 label', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ description: '英文 label', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  labelEn?: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '排序权重', default: 0 })
  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class UpdateExpertiseDto extends PartialType(CreateExpertiseDto) {}

// =============================================================
// 排序 DTO
// =============================================================

/**
 * 拖拽排序: 一次提交完整的有序 ID 列表, 后端按位置赋值 orderIndex
 */
export class ReorderInstructorsDto {
  @ApiProperty({ type: [String], description: '按新顺序排列的讲师 ID 列表' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  orderedIds: string[];
}
