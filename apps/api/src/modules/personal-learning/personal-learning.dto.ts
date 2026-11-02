import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum LessonGenerationModeDto {
  generate = 'generate',
  regenerate = 'regenerate',
}
export class GenerateLessonDto {
  @IsOptional()
  @IsEnum(LessonGenerationModeDto)
  mode: LessonGenerationModeDto = LessonGenerationModeDto.generate;
}

export enum LessonVariantActionDto {
  simplify = 'simplify',
  deepen = 'deepen',
  newExample = 'new_example',
}

export class CreateLessonVariantDto {
  @IsEnum(LessonVariantActionDto)
  action!: LessonVariantActionDto;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  blockId?: string;
}

export enum AssessmentAnswerConfidenceDto {
  high = 'high',
  medium = 'medium',
  low = 'low',
}

export class AssessmentAnswerDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  questionId!: string;

  @IsString()
  @MaxLength(10_000)
  answer!: string;

  @IsEnum(AssessmentAnswerConfidenceDto)
  confidence!: AssessmentAnswerConfidenceDto;
}

export class SubmitAssessmentAttemptDto {
  @IsUUID('4')
  clientSubmissionKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AssessmentAnswerDto)
  answers!: AssessmentAnswerDto[];
}
