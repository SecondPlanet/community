/**
 * uploads.dto.ts — sign / complete 的请求 DTO
 */
import { IsString, IsIn, IsNumber, IsOptional, IsUUID, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UploadScope } from './uploads.config';

export class SignUploadDto {
  @ApiProperty({ enum: ['lesson-video', 'resource', 'course-thumbnail', 'degree-thumbnail', 'hackathon-banner', 'hackathon-judge-avatar', 'hackathon-sponsor-logo', 'hackathon-application-file', 'submission-attachment', 'submission-video', 'user-avatar'] })
  @IsIn(['lesson-video', 'resource', 'course-thumbnail', 'degree-thumbnail', 'hackathon-banner', 'hackathon-judge-avatar', 'hackathon-sponsor-logo', 'hackathon-application-file', 'submission-attachment', 'submission-video', 'user-avatar'])
  scope: UploadScope;

  @ApiProperty({ description: '原始文件名, 用于扩展名推断' })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ description: 'MIME type' })
  @IsString()
  @MaxLength(100)
  mimeType: string;

  @ApiProperty({ description: '文件字节数' })
  @IsNumber()
  @Min(1)
  size: number;

  @ApiPropertyOptional({ description: '目标 entity id (lesson / hackathon / user). 留空用于 "create 时上传" (resource / submission-video), 由业务侧 setField' })
  @IsOptional()
  @IsUUID()
  refId?: string;
}

export class CompleteUploadDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  key: string;

  @ApiProperty({ enum: ['lesson-video', 'resource', 'course-thumbnail', 'degree-thumbnail', 'hackathon-banner', 'hackathon-judge-avatar', 'hackathon-sponsor-logo', 'hackathon-application-file', 'submission-attachment', 'submission-video', 'user-avatar'] })
  @IsIn(['lesson-video', 'resource', 'course-thumbnail', 'degree-thumbnail', 'hackathon-banner', 'hackathon-judge-avatar', 'hackathon-sponsor-logo', 'hackathon-application-file', 'submission-attachment', 'submission-video', 'user-avatar'])
  scope: UploadScope;

  @ApiPropertyOptional({ description: '目标 entity id；两个私有附件 scope 均使用 hackathonId (创建和更新都一样)' })
  @IsOptional()
  @IsUUID()
  refId?: string;

  @ApiPropertyOptional({ description: '原始文件名，仅作为附件显示元数据；MIME/大小以对象存储为准' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}
