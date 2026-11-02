import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CostType, CourseStatus } from '@prisma/client';
import { SafeUrl } from '../../common/validators/safe-url.decorator';

class DegreeCourseLinkDto {
  @ApiProperty({ description: '课程 UUID' })
  @IsUUID()
  courseId: string;

  @ApiProperty({ description: '在学位内的排序索引' })
  @IsNumber()
  orderIndex: number;
}

export class CreateDegreeDto {
  @ApiProperty({ description: '学位标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '学位描述' })
  @IsString()
  description: string;

  @ApiProperty({ description: '学习要点' })
  @IsString()
  learningPoints: string;

  @ApiProperty({ description: '价格（元，0 表示免费）' })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ description: '图标 URL 或 emoji' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ enum: CostType, description: '计费类型' })
  @IsEnum(CostType)
  costType: CostType;

  @ApiPropertyOptional({ description: '缩略图 URL (http/https)' })
  @IsOptional()
  // 2026-07-24 P0: 限制 scheme
  @SafeUrl({ optional: true, maxLength: 1000 })
  thumbnail?: string;

  @ApiPropertyOptional({ enum: CourseStatus, description: '学位状态' })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional({
    type: [DegreeCourseLinkDto],
    description: '创建时直接绑定课程(可选)。后端在事务内原子完成 创建+绑定, 避免孤儿学位',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DegreeCourseLinkDto)
  courses?: DegreeCourseLinkDto[];
}

export class UpdateDegreeDto extends PartialType(CreateDegreeDto) {}

export class LinkCoursesDto {
  @ApiProperty({ type: [DegreeCourseLinkDto], description: '要绑定的课程列表（含排序）' })
  @ValidateNested({ each: true })
  @Type(() => DegreeCourseLinkDto)
  courses: DegreeCourseLinkDto[];
}
