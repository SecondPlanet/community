/**
 * CertificateType meta — 集中证书类型文案 / icon / 背景
 *
 * 历史:CertificatesPage + CertificateDetailPage 各自维护一份 TYPE_LABEL,
 * 且 TYPE_BG 在 CertificatesPage 里是 `bg-gradient-to-br from-[#171717] to-[#262626]`
 * (全部 3 种 type 同款渐变);CertificateDetailPage 里是 `bg-[#171717]`(纯黑),
 * 不一致。这里统一收口。
 *
 * 当前版本 1.0:全部 3 种 type 走 brutalist 黑底,后续如需差异化配色只动这一处。
 */
import { Code2, GraduationCap, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CertificateType } from '@secondplanet/shared-types';

export interface CertificateTypeMeta {
  /** 短标签(用于 tab / chip)— 例如"课程证书" */
  shortLabel: string;
  /** 完整标签(用于详情标题)— 例如"课程完成证书" */
  fullLabel: string;
  /** 详情页 hero 图标 */
  icon: ReactNode;
  /** 详情页 hero 背景 class (brutalist 黑底) */
  gradientClass: string;
}

const SHORT_LABEL: Record<CertificateType, string> = {
  course: '课程证书',
  degree: '学位证书',
  hackathon: '参赛证书',
};

const FULL_LABEL: Record<CertificateType, string> = {
  course: '课程完成证书',
  degree: '学位证书',
  hackathon: '参赛证书',
};

const ICON: Record<CertificateType, ReactNode> = {
  course: <GraduationCap className="w-5 h-5" />,
  degree: <Code2 className="w-5 h-5" />,
  hackathon: <Trophy className="w-5 h-5" />,
};

// v1:3 种证书都用 brutalist 纯黑底,跟 brand 保持一致
const GRADIENT_CLASS: Record<CertificateType, string> = {
  course: 'bg-[#171717]',
  degree: 'bg-[#171717]',
  hackathon: 'bg-[#171717]',
};

export function getCertificateTypeMeta(type: CertificateType | string): CertificateTypeMeta {
  const t = (type as CertificateType) in SHORT_LABEL ? (type as CertificateType) : 'course';
  return {
    shortLabel: SHORT_LABEL[t],
    fullLabel: FULL_LABEL[t],
    icon: ICON[t],
    gradientClass: GRADIENT_CLASS[t],
  };
}

export function getCertificateTypeShortLabel(type: CertificateType | string): string {
  return SHORT_LABEL[type as CertificateType] ?? '结业证书';
}

export function getCertificateTypeFullLabel(type: CertificateType | string): string {
  return FULL_LABEL[type as CertificateType] ?? '证书';
}
