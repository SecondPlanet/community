import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, IsBoolean, IsObject, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadgeCriteriaType } from '@prisma/client';

export class CreateBadgeDto {
  @ApiProperty({ description: '程序内唯一标识，如 first_course' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Lucide 图标名' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ description: '分组：learning / streak / milestone ...' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ enum: BadgeCriteriaType })
  @IsEnum(BadgeCriteriaType)
  criteriaType: BadgeCriteriaType;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  criteriaValue?: number;

  @ApiPropertyOptional({ description: '解锁时奖励积分' })
  @IsInt()
  @Min(0)
  @IsOptional()
  points?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  orderIndex?: number;

  @ApiPropertyOptional({ description: '高级徽章规则 DSL（AND / OR / NOT / course_specific）' })
  @IsOptional()
  @IsObject()
  criteriaJson?: Record<string, unknown>;
}

export class UpdateBadgeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: BadgeCriteriaType })
  @IsEnum(BadgeCriteriaType)
  @IsOptional()
  criteriaType?: BadgeCriteriaType;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  criteriaValue?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  points?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  orderIndex?: number;

  @ApiPropertyOptional({ description: '高级徽章规则 DSL；null 表示清除' })
  @IsOptional()
  @IsObject()
  criteriaJson?: Record<string, unknown> | null;
}
