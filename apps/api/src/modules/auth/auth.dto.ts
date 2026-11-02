import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'User email, must be RFC 5321 compliant',
    example: 'user@example.com',
    maxLength: 320,
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Password, 12-128 chars, must include uppercase, lowercase, digit, and symbol',
    example: 'GoodPass!1234',
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: '密码必须包含大小写字母、数字和符号',
  })
  password: string;

  @ApiProperty({
    description: 'Display name shown in UI',
    example: '陈大文',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  name: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'Registered email',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Plaintext password (TLS only, never logged)',
    example: 'GoodPass!1234',
  })
  @IsString()
  password: string;
}

export class OAuthCallbackDto {
  @ApiProperty({
    description: 'OAuth2 authorization code from the IdP redirect',
    minLength: 1,
    maxLength: 2048,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  code: string;

  @ApiProperty({
    description: 'Opaque state token, must match what we issued in the auth URL',
    minLength: 20,
    maxLength: 4096,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  state: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({
    description: 'Account email to send the reset link to',
    example: 'user@example.com',
    maxLength: 320,
  })
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({
    description: 'Reset token from the email link',
    minLength: 32,
    maxLength: 256,
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token: string;

  @ApiProperty({
    description: 'New password, 12-128 chars, must include uppercase, lowercase, digit, and symbol',
    example: 'NewPass!5678',
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: '新密码必须包含大小写字母、数字和符号',
  })
  newPassword: string;
}
