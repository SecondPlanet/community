import { IsString, IsNotEmpty, IsEnum, IsInt, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SafeUrl } from '../../common/validators/safe-url.decorator';

export enum ProjectDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum ProjectType {
  MODEL_DEPLOYMENT = 'model_deployment',
  MODEL_TRAINING = 'model_training',
  MODEL_INFERENCE = 'model_inference',
  API_INTEGRATION = 'api_integration',
  NOTEBOOK = 'notebook',
  SANDBOX = 'sandbox',
  REPOSITORY = 'repository',
  CSGHUB_SPACE = 'csghub_space',
}

export enum CompletionStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export class CreatePracticeProjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @SafeUrl({ maxLength: 1000 })
  @IsNotEmpty()
  projectUrl: string;

  @ApiPropertyOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  @IsOptional()
  thumbnailUrl?: string;

  @ApiProperty({ enum: ProjectDifficulty })
  @IsEnum(ProjectDifficulty)
  difficulty: ProjectDifficulty;

  @ApiProperty()
  @IsInt()
  @Min(1)
  estimatedTime: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tags?: string;

  @ApiProperty({ enum: ProjectType })
  @IsEnum(ProjectType)
  projectType: ProjectType;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  orderIndex?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  requirements?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  objectives?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePracticeProjectDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  @IsOptional()
  projectUrl?: string;

  @ApiPropertyOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  @IsOptional()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ enum: ProjectDifficulty })
  @IsEnum(ProjectDifficulty)
  @IsOptional()
  difficulty?: ProjectDifficulty;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  estimatedTime?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tags?: string;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsEnum(ProjectType)
  @IsOptional()
  projectType?: ProjectType;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  orderIndex?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  requirements?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  objectives?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CompletePracticeDto {
  @ApiPropertyOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  @IsOptional()
  submissionUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
