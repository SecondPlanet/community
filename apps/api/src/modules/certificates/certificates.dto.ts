import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { CertificateType as PrismaCertificateType } from '@prisma/client';

export const CERTIFICATE_TYPES = ['course', 'degree', 'hackathon'] as const;
export type CertificateType = PrismaCertificateType;

/**
 * IssueCertificateDto — 由课程完成 / 学位完成 / 黑客松评审流程调用,
 * 不直接对前端暴露。前端用 0 endpoint 走 trigger (service 内部生成)。
 */
export class IssueCertificateDto {
  @IsString()
  userId: string;

  @IsEnum(PrismaCertificateType, { message: 'type 必须是 course / degree / hackathon' })
  type: PrismaCertificateType;

  @IsString()
  refId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class ListCertificatesQuery {
  @IsOptional()
  @IsEnum(PrismaCertificateType, { message: 'type 必须是 course / degree / hackathon / all' })
  type?: PrismaCertificateType | 'all'; // 'course' | 'degree' | 'hackathon' | 'all'
}
