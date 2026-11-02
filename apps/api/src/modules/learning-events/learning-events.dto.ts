import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LearningEventType {
  play = 'play',
  pause = 'pause',
  seek = 'seek',
  complete = 'complete',
  replay = 'replay',
  skip = 'skip',
  note = 'note',
  personal_course_created = 'personal_course_created',
  personal_course_plan_ready = 'personal_course_plan_ready',
  personal_course_plan_approved = 'personal_course_plan_approved',
  personal_lesson_generation_started = 'personal_lesson_generation_started',
  personal_lesson_generation_completed = 'personal_lesson_generation_completed',
  personal_lesson_opened = 'personal_lesson_opened',
  personal_lesson_completed = 'personal_lesson_completed',
  personal_assessment_started = 'personal_assessment_started',
  personal_assessment_completed = 'personal_assessment_completed',
  personal_tutor_action_clicked = 'personal_tutor_action_clicked',
  personal_next_step_clicked = 'personal_next_step_clicked',
}

export class CreateLearningEventDto {
  @ApiPropertyOptional({ description: '课时 UUID' })
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @ApiProperty({ enum: LearningEventType, description: '事件类型' })
  @IsEnum(LearningEventType)
  eventType: LearningEventType;

  @ApiPropertyOptional({ description: '视频位置（秒）', minimum: 0, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400) // 上限 24h 防止恶意值
  positionSec?: number;

  @ApiPropertyOptional({ description: '事件持续时长（毫秒）', minimum: 0, maximum: 600000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000) // 上限 10 分钟
  durationMs?: number;

  @ApiPropertyOptional({ description: '附加元数据（自由 JSON）', type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class BatchCreateLearningEventDto {
  @ApiProperty({
    type: [CreateLearningEventDto],
    description: '事件数组 (1-50 条)',
    minItems: 1,
    maxItems: 50,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50) // 50 条/批,避免单请求过大
  @ValidateNested({ each: true })
  @Type(() => CreateLearningEventDto)
  events: CreateLearningEventDto[];
}
