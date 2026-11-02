/**
 * uploads.config.ts — 上传 scope × role × 资源限制 矩阵
 *
 * 2026-07-24: 视频上传管道 (P0)
 * 设计: scope-driven 配置, 新增 scope 只需在这里加一行, 无需改 controller
 *
 * 7 个 scope 覆盖 4 类写入方:
 *   1. 课程内容 (admin):  lesson-video / resource / course-thumbnail
 *   2. 学位 (admin):       degree-thumbnail
 *   3. 黑客松 (admin / participant): hackathon-banner / hackathon-judge-avatar /
 *                                   hackathon-sponsor-logo / submission-video
 *   4. 用户 (self / admin): user-avatar
 *
 * 加新 scope 步骤:
 *   1) 在 UPLOAD_SCOPES 加一行
 *   2) 后端: uploads.service.complete 路由 (按 scope 决定写哪个表的哪个列)
 *   3) 前端: 在 usePresignedUpload 传 scope
 */
import { UserRole } from '@prisma/client';

export type UploadScope =
  | 'lesson-video'
  | 'resource'
  | 'course-thumbnail'
  | 'degree-thumbnail'
  | 'hackathon-banner'
  | 'hackathon-judge-avatar'
  | 'hackathon-sponsor-logo'
  | 'hackathon-application-file'
  | 'submission-attachment'
  | 'submission-video'
  | 'user-avatar';

export interface ScopeConfig {
  /** S3 bucket 名 (从 MINIO_BUCKET env 读, 这里只是 key 拼前缀) */
  keyPrefix: string;
  /** 谁可以请求 sign (allowedRoles 是 OR 关系; 自管 scope 额外检查 ownership) */
  allowedRoles: UserRole[];
  /** 单文件最大 (MB) */
  maxSizeMB: number;
  /** 允许的 MIME types */
  allowedMime: string[];
  /** 签名 URL TTL (秒) */
  presignTtlSec: number;
  /** 公开访问 (true = 通过 publicUrl 直接读; false = 必须签 GET) */
  publicRead: boolean;
  /** 描述 (swagger 用) */
  description: string;
}

const PRIVATE_ATTACHMENT_MIME = [
  'application/pdf',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const UPLOAD_SCOPES: Record<UploadScope, ScopeConfig> = {
  'lesson-video': {
    keyPrefix: 'lessons/videos',
    allowedRoles: [UserRole.admin],
    maxSizeMB: 500,
    allowedMime: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
    presignTtlSec: 15 * 60,
    publicRead: true,
    description: '课时视频 (mp4/webm/mov/mkv, max 500MB)',
  },
  'resource': {
    keyPrefix: 'lessons/resources',
    allowedRoles: [UserRole.admin],
    maxSizeMB: 100,
    allowedMime: [
      'application/pdf',
      'application/zip',
      'application/x-tar',
      'application/gzip',
      'video/mp4',
      'audio/mpeg',
      'audio/wav',
      'text/plain',
      'text/markdown',
    ],
    presignTtlSec: 15 * 60,
    publicRead: true,
    description: '课时资源 (pdf/zip/视频/音频, max 100MB)',
  },
  'course-thumbnail': {
    keyPrefix: 'courses/thumbnails',
    allowedRoles: [UserRole.admin],
    maxSizeMB: 5,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
    presignTtlSec: 10 * 60,
    publicRead: true,
    description: '课程封面 (jpg/png/webp, max 5MB)',
  },
  'degree-thumbnail': {
    keyPrefix: 'degrees/thumbnails',
    allowedRoles: [UserRole.admin],
    maxSizeMB: 5,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
    presignTtlSec: 10 * 60,
    publicRead: true,
    description: '学位封面 (jpg/png/webp, max 5MB)',
  },
  'hackathon-banner': {
    keyPrefix: 'hackathons/banners',
    allowedRoles: [UserRole.admin],
    maxSizeMB: 8,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
    presignTtlSec: 10 * 60,
    publicRead: true,
    description: '黑客松 banner (jpg/png/webp, max 8MB)',
  },
  'hackathon-judge-avatar': {
    keyPrefix: 'hackathons/judges/avatars',
    allowedRoles: [UserRole.admin],
    maxSizeMB: 3,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
    presignTtlSec: 10 * 60,
    publicRead: true,
    description: '评委头像 (jpg/png/webp, max 3MB)',
  },
  'hackathon-sponsor-logo': {
    keyPrefix: 'hackathons/sponsors/logos',
    allowedRoles: [UserRole.admin],
    maxSizeMB: 3,
    // SVG can execute script when served from a public object origin. Keep
    // sponsor logos to inert raster formats unless SVG is sanitized and served
    // from a separate, non-application origin.
    allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
    presignTtlSec: 10 * 60,
    publicRead: true,
    description: '赞助商 logo (jpg/png/webp, max 3MB)',
  },
  'hackathon-application-file': {
    keyPrefix: 'hackathons/applications/files',
    allowedRoles: [UserRole.student, UserRole.admin, UserRole.instructor],
    maxSizeMB: 20,
    allowedMime: PRIVATE_ATTACHMENT_MIME,
    presignTtlSec: 10 * 60,
    publicRead: false,
    description: '内部报名附件 (文档/压缩包/图片, max 20MB)',
  },
  'submission-attachment': {
    keyPrefix: 'hackathons/submissions/attachments',
    allowedRoles: [UserRole.student, UserRole.admin, UserRole.instructor],
    maxSizeMB: 50,
    allowedMime: PRIVATE_ATTACHMENT_MIME,
    presignTtlSec: 10 * 60,
    publicRead: false,
    description: '作品附件 (文档/压缩包/图片, max 50MB)',
  },
  'submission-video': {
    // hackathon 团队成员可上传作品 demo 视频
    keyPrefix: 'hackathons/submissions/videos',
    allowedRoles: [UserRole.student, UserRole.admin, UserRole.instructor],
    maxSizeMB: 200,
    allowedMime: ['video/mp4', 'video/webm', 'video/quicktime'],
    presignTtlSec: 15 * 60,
    publicRead: true,
    description: '黑客松作品 demo 视频 (team member 可传, max 200MB)',
  },
  'user-avatar': {
    // 任何登录 user 可改自己头像; admin 可改任何 user 头像
    keyPrefix: 'users/avatars',
    allowedRoles: [UserRole.student, UserRole.admin, UserRole.instructor],
    maxSizeMB: 2,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp'],
    presignTtlSec: 10 * 60,
    publicRead: true,
    description: '用户头像 (jpg/png/webp, max 2MB)',
  },
};

export const DEFAULT_UPLOAD_MAX_SIZE_MB = 500; // 全局上限 (按 scope 收紧)
export const UPLOAD_SIGN_TTL_SEC_DEFAULT = 15 * 60;
