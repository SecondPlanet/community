import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
  Max,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  HackathonStatus,
  RegistrationMode,
  ReviewStatus,
  SubmissionStatus,
} from '@prisma/client';
import { SafeUrl } from '../../common/validators/safe-url.decorator';

export class HackathonFormFieldDto {
  @IsString()
  @MaxLength(100)
  id: string;

  @IsString()
  @MaxLength(200)
  label: string;

  @IsIn(['text', 'textarea', 'select', 'multiselect', 'number', 'url', 'file'])
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'url' | 'file';

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  placeholder?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxLength?: number;
}

export class CreateHackathonDto {
  @ApiProperty({ description: '黑客松标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '黑客松描述' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Banner 图片 URL (http/https)' })
  @IsOptional()
  // 2026-07-24 P0: @SafeUrl 替换 @IsUrl, 限制 http(s) 防 javascript:/data:/file:
  @SafeUrl({ optional: true, maxLength: 1000 })
  bannerUrl?: string;

  @ApiPropertyOptional({ enum: HackathonStatus, description: '状态' })
  @IsOptional()
  @IsEnum(HackathonStatus)
  status?: HackathonStatus;

  @ApiProperty({ description: '开始时间 ISO 字符串' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: '结束时间 ISO 字符串' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: '作品提交截止时间 ISO 字符串' })
  @IsOptional()
  @IsDateString()
  submissionDeadline?: string;

  @ApiPropertyOptional({ description: '报名截止时间 ISO 字符串' })
  @IsOptional()
  @IsDateString()
  registerDeadline?: string;

  @ApiPropertyOptional({ description: '最小团队人数', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minTeamSize?: number;

  @ApiPropertyOptional({ description: '最大团队人数', default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxTeamSize?: number;

  @ApiPropertyOptional({ description: '地点' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: '比赛规则' })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional({ description: '作品提交要求，建议逐行填写清单' })
  @IsOptional()
  @IsString()
  submissionRequirements?: string;

  @ApiPropertyOptional({ description: '奖项设置' })
  @IsOptional()
  @IsString()
  prizes?: string;

  @ApiPropertyOptional({ description: '外链 CTA URL (报名 / 了解更多 / 官网 等任意一个)' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  registrationUrl?: string;

  @ApiPropertyOptional({ description: '外链 CTA 文案, 留空默认 "前往报名"' })
  @IsOptional()
  @IsString()
  registrationLabel?: string;

  @ApiPropertyOptional({ enum: RegistrationMode, default: RegistrationMode.internal })
  @IsOptional()
  @IsEnum(RegistrationMode)
  registrationMode?: RegistrationMode;

  @ApiPropertyOptional({ type: [HackathonFormFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HackathonFormFieldDto)
  registrationFields?: HackathonFormFieldDto[];
}

export class UpdateHackathonDto extends PartialType(CreateHackathonDto) {}

export class RegisterHackathonDto {
  @ApiProperty({ description: '动态报名表答案，以字段 id 为键' })
  @IsObject()
  answers: Record<string, unknown>;
}

export class ReviewRegistrationDto {
  @ApiProperty({ enum: ReviewStatus })
  @IsEnum(ReviewStatus)
  reviewStatus: ReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reviewNote?: string;

  @ApiPropertyOptional({ description: '强制改态(跳过已通过/已拒绝的状态机保护), 用于管理员明确纠错' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ListRegistrationsDto {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UploadedFileMetaDto {
  @IsString()
  @MaxLength(1024)
  key: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  size: number;

  @IsString()
  @MaxLength(255)
  mimeType: string;

  /** 服务端在 verify 后盖章; 客户端原样回传(编辑草稿场景), 仍以服务端核验为准 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}

export class CreateTeamDto {
  @ApiProperty({ description: '队伍名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '队伍口号' })
  @IsOptional()
  @IsString()
  slogan?: string;
}

export class CreateSubmissionDto {
  @ApiProperty({ description: '作品标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '作品描述' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Demo 链接' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  demoUrl?: string;

  @ApiPropertyOptional({ description: '代码仓库链接' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  repoUrl?: string;

  @ApiPropertyOptional({ description: '视频链接' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  videoUrl?: string;

  @ApiPropertyOptional({ description: '所属队伍 ID，为空则个人参赛' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ enum: SubmissionStatus, description: '作品状态' })
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @ApiPropertyOptional({ type: [UploadedFileMetaDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => UploadedFileMetaDto)
  attachments?: UploadedFileMetaDto[];
}

export class UpdateSubmissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  demoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  repoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  videoUrl?: string;

  @ApiPropertyOptional({ enum: SubmissionStatus })
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @ApiPropertyOptional({ type: [UploadedFileMetaDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => UploadedFileMetaDto)
  attachments?: UploadedFileMetaDto[];
}

export class CreateAnnouncementDto {
  @ApiProperty({ description: '公告标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '公告内容' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: '是否置顶', default: false })
  @IsOptional()
  isPinned?: boolean;
}

export class JudgeSubmissionDto {
  @ApiProperty({ description: '评分 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional({ description: '评语' })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional({ enum: SubmissionStatus, description: '评审后状态' })
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;
}

// ==================== P0 修复(2026-07-24): Judges / Sponsors 内联 DTO 抽 class ====================

export class CreateJudgeDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '头像 URL (http/https)' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @ApiPropertyOptional({ enum: ['judge', 'advisor', 'host'] })
  @IsOptional()
  @IsString()
  role?: 'judge' | 'advisor' | 'host';
}

export class UpdateJudgeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '头像 URL (http/https)' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @ApiPropertyOptional({ enum: ['judge', 'advisor', 'host'] })
  @IsOptional()
  @IsString()
  role?: 'judge' | 'advisor' | 'host';
}

export class CreateSponsorDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Logo URL (http/https)' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  logoUrl?: string;

  @ApiPropertyOptional({ description: '官网 URL (http/https)' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  websiteUrl?: string;

  @ApiPropertyOptional({ enum: ['platinum', 'gold', 'silver', 'bronze'] })
  @IsOptional()
  @IsString()
  tier?: 'platinum' | 'gold' | 'silver' | 'bronze';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class UpdateSponsorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Logo URL (http/https)' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  logoUrl?: string;

  @ApiPropertyOptional({ description: '官网 URL (http/https)' })
  @IsOptional()
  @SafeUrl({ optional: true, maxLength: 1000 })
  websiteUrl?: string;

  @ApiPropertyOptional({ enum: ['platinum', 'gold', 'silver', 'bronze'] })
  @IsOptional()
  @IsString()
  tier?: 'platinum' | 'gold' | 'silver' | 'bronze';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  orderIndex?: number;
}
