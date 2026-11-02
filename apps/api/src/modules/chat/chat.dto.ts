import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  // v1.9-alpha.1 (B-05): 课程内 tutor 创建 session 时携带上下文。
  // listSessions 只返回 lessonId=null 的 general session,
  // 带上 lessonId 的课程会话自动从全站助手会话列表里消失(UX-AUDIT C-11 session 污染)。
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  content: string;
}
