import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CourseLevel } from '@prisma/client';

export enum LearningGoalTypeDto {
  quick_understanding = 'quick_understanding',
  systematic = 'systematic',
  project = 'project',
  exam = 'exam',
}

export enum ExplanationStyleDto {
  balanced = 'balanced',
  simple = 'simple',
  technical = 'technical',
  practical = 'practical',
}

export enum LearningDepthDto {
  introductory = 'introductory',
  standard = 'standard',
  deep = 'deep',
}

export enum LearningLanguageDto {
  zhCN = 'zh-CN',
  en = 'en',
}

export class LearningPreferencesDto {
  @IsOptional()
  @IsEnum(ExplanationStyleDto)
  explanationStyle?: ExplanationStyleDto;

  @IsOptional()
  @IsEnum(LearningDepthDto)
  depth?: LearningDepthDto;

  @IsOptional()
  @IsEnum(LearningGoalTypeDto)
  goalType?: LearningGoalTypeDto;

  @IsOptional()
  @IsEnum(LearningLanguageDto)
  language?: LearningLanguageDto;

  @IsOptional()
  @IsBoolean()
  includeMath?: boolean;

  @IsOptional()
  @IsBoolean()
  includeCode?: boolean;
}

export class CreateLearningProjectDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 500)
  question!: string;

  @IsOptional()
  @IsEnum(LearningGoalTypeDto)
  goalType?: LearningGoalTypeDto;

  @IsOptional()
  @IsEnum(CourseLevel)
  targetLevel?: CourseLevel;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(2400)
  availableMinutes?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => LearningPreferencesDto)
  preferences?: LearningPreferencesDto;
}

export class ListLearningProjectsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  archived = false;
}

export class UpdateProjectActivityDto {
  @IsString()
  @Length(1, 64)
  lessonId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  blockId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  blockOffset?: number | null;

  @IsDateString({ strict: true })
  occurredAt!: string;
}

export class ApproveCoursePlanDto {
  @IsInt()
  @Min(1)
  planVersion!: number;
}
