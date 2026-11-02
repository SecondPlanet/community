/**
 * lessons.dto.ts — 课时 CRUD DTO
 *
 * 2026-07-24: P0 安全修 — videoUrl 加 @SafeUrl 校验
 */
import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SafeUrl } from '../../common/validators/safe-url.decorator';

export class CreateLessonDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  // P0: 限制 videoUrl scheme (防 javascript: / data: / file:)
  @ApiPropertyOptional({ description: '课时视频 URL (http/https)' })
  @SafeUrl({ optional: true, maxLength: 500 })
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  videoDuration?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}

export class UpdateLessonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @SafeUrl({ optional: true, maxLength: 500 })
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  videoDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}
