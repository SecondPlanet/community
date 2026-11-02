import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsArray,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SafeUrl } from '../../common/validators/safe-url.decorator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ description: '邮箱', example: '[email protected]' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '密码（至少 12 位，包含大小写、数字和符号）', minLength: 12 })
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: '密码必须包含大小写字母、数字和符号',
  })
  password: string;

  @ApiProperty({ description: '显示名' })
  @IsString()
  name: string;

  @ApiProperty({ enum: UserRole, description: '用户角色' })
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '显示名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '头像 URL (http/https)' })
  @IsOptional()
  // 2026-07-24 P0: 限制 scheme 防 javascript: / data: / file:
  @SafeUrl({ optional: true, maxLength: 500 })
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: UserRole, description: '用户角色（仅管理员可修改）' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: '新密码，至少 12 位且包含大小写字母、数字和符号' })
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: '新密码必须包含大小写字母、数字和符号',
  })
  newPassword: string;
}

export class GrantCourseAccessDto {
  @ApiProperty({ type: [String], description: '要授权的课程 UUID 列表', format: 'uuid' })
  @IsArray()
  @IsUUID('4', { each: true })
  courseIds: string[];
}

export class GrantDegreeAccessDto {
  @ApiProperty({ type: [String], description: '要授权的学位 UUID 列表', format: 'uuid' })
  @IsArray()
  @IsUUID('4', { each: true })
  degreeIds: string[];
}
