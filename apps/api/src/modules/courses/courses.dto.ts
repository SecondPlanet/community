import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CourseLevel, CostType, CourseStatus, CourseType } from '@prisma/client';
import { CreateLessonDto as NestedCreateLessonDto } from './lessons.dto';
import { CreateResourceDto as NestedCreateResourceDto } from './resources.dto';
import { SafeUrl } from '../../common/validators/safe-url.decorator';

// P0 修复(2026-07-24): 直接 extends resources.dto.ts 的 CreateResourceDto, 共享 @SafeUrl url 校验
// 之前 courses.dto.ts 重复定义 CreateResourceDto, url 字段只有 @IsString 没 @SafeUrl
// POST /api/v1/courses 的 chapters[].lessons[].resources[].url 入库路径绕过 scheme 校验
class CreateResourceDto extends NestedCreateResourceDto {}

// P0 修复(2026-07-24): 直接 extends lessons.dto.ts 的 CreateLessonDto, 共享 @SafeUrl videoUrl 校验
// 之前 courses.dto.ts 重复定义 CreateLessonDto, videoUrl 字段只有 @IsString 没 @SafeUrl
// POST /api/v1/courses 的 chapters[].lessons[].videoUrl 入库路径绕过 scheme 校验
class NestedCourseLessonDto extends NestedCreateLessonDto {
  @ApiProperty({ description: '排序索引' })
  @IsNumber()
  orderIndex: number;

  @ApiPropertyOptional({ type: () => [CreateResourceDto], description: '关联资源' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateResourceDto)
  resources?: CreateResourceDto[];
}

class CreateChapterDto {
  @ApiProperty({ description: '章节标题' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: '章节描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '排序索引' })
  @IsNumber()
  orderIndex: number;

  @ApiPropertyOptional({ type: () => [NestedCourseLessonDto], description: '章节下的课时' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NestedCourseLessonDto)
  lessons?: NestedCourseLessonDto[];
}

export class CreateCourseDto {
  @ApiProperty({ description: '课程标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '课程描述' })
  @IsString()
  description: string;

  @ApiProperty({ description: '学习要点' })
  @IsString()
  learningPoints: string;

  @ApiPropertyOptional({
    description: '兼容旧数据/导入流程的讲师名称；后台手工创建请传 instructorId',
  })
  @IsOptional()
  @IsString()
  instructor?: string;

  @ApiPropertyOptional({ description: '讲师表 ID（Instructor 使用 cuid）' })
  @IsOptional()
  @IsString()
  instructorId?: string;

  @ApiProperty({ enum: CourseLevel, description: '难度等级' })
  @IsEnum(CourseLevel)
  level: CourseLevel;

  @ApiProperty({ description: '学习时长（人类可读，例如 "8h"）' })
  @IsString()
  duration: string;

  @ApiProperty({ description: '课程缩略图 URL' })
  @IsString()
  thumbnail: string;

  @ApiProperty({ description: '标签（逗号分隔或 JSON 字符串）' })
  @IsString()
  tags: string;

  @ApiProperty({ enum: CostType, description: '计费类型' })
  @IsEnum(CostType)
  costType: CostType;

  @ApiProperty({ description: '价格（元，0 表示免费）' })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ enum: CourseStatus, description: '课程状态' })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional({ enum: CourseType, description: '课程类型' })
  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;

  @ApiPropertyOptional({ description: '外链课程 URL（外部跳转类型课程用）', maxLength: 500 })
  @SafeUrl({ optional: true, maxLength: 500 })
  externalUrl?: string;

  @ApiPropertyOptional({ description: '原始视频源 URL（导入用）', maxLength: 500 })
  @SafeUrl({ optional: true, maxLength: 500 })
  sourceVideoUrl?: string;

  @ApiPropertyOptional({ description: '来源平台标识', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sourcePlatform?: string;

  @ApiPropertyOptional({ description: '课程分类 UUID' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: () => [CreateChapterDto], description: '课程章节（含课时和资源）' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateChapterDto)
  chapters?: CreateChapterDto[];
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

/**
 * P0 修复(2026-07-24): 课程挂学位 — 接受学位 ID 列表(append 语义)。
 * 课程会按列表顺序追加到各学位的末尾(orderIndex = 现有 max + 1..N)。
 * 精确顺序编辑请走 POST /api/v1/degrees/:id/courses (linkCourses)。
 */
export class LinkDegreesDto {
  @ApiProperty({ type: [String], description: '要追加到的学位 UUID 列表' })
  @IsUUID('all', { each: true })
  degreeIds: string[];
}

export enum CourseSort {
  newest = 'newest',
  recent = 'recent',
  rating = 'rating',
  popular = 'popular',
}

export class ListCoursesQueryDto {
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(CourseSort)
  sort?: CourseSort = CourseSort.recent;

  // 按讲师 ID 过滤 (前台公开可访问, 只返该讲师挂的课程)
  @IsOptional()
  @IsString()
  instructorId?: string;

  // 按讲师 slug 过滤 (前台友好 URL 共享)
  @IsOptional()
  @IsString()
  instructorSlug?: string;
}
