/**
 * reviews.dto.ts — P1-3 评价入参 DTO
 *
 * CreateReviewDto:
 *   - rating: 1-5 整数(必填)
 *   - content: 10-1000 字符(必填)
 *
 * ListReviewsQueryDto:
 *   - page / limit 分页(默认 1 / 10)
 */
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ description: '评分 (1-5 整数)', minimum: 1, maximum: 5 })
  @IsInt({ message: 'rating 必须是 1-5 整数' })
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ description: '评价内容 (10-1000 字符)', minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10, { message: '评价内容至少 10 字符' })
  @MaxLength(1000, { message: '评价内容最多 1000 字符' })
  content: string;
}

export class ListReviewsQueryDto {
  @ApiPropertyOptional({ description: '页码', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页大小 (1-50)', minimum: 1, maximum: 50, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class AdminListReviewsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  onlyDeleted?: boolean = false;
}
