/**
 * resources.dto.ts — 课时资源 CRUD DTO
 *
 * 2026-07-24: P0 安全修 — url 加 @SafeUrl
 */
import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResourceType } from '@prisma/client';
import { SafeUrl } from '../../common/validators/safe-url.decorator';

export class CreateResourceDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ description: '资源 URL (http/https)' })
  @SafeUrl({ maxLength: 1000 })
  url: string;

  @ApiProperty({ enum: ResourceType })
  @IsEnum(ResourceType)
  type: ResourceType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}

export class UpdateResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  url?: string;

  @ApiPropertyOptional({ enum: ResourceType })
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}
