/**
 * StorageProvider — 上传后端抽象类 (DI token)
 *
 * 2026-07-24: P0 — 视频上传管道
 * 设计: provider 模式, 后端可换 MinIO / S3 / Azure Blob / 阿里 OSS
 * 当前唯一实现: S3StorageService (兼容 MinIO 因 MinIO 是 S3 API)
 *
 * 用 abstract class 而不是 interface, 因为 TS 装饰器 / DI 不支持 interface token
 */
export abstract class StorageProvider {
  /**
   * 给前端生成一个"直传"预签名 URL.
   * - PUT 模式: 浏览器 PUT 二进制到 uploadUrl
   * - POST 模式: 浏览器 POST multipart 到 uploadUrl (含 fields)
   */
  abstract presignUpload(
    key: string,
    contentType: string,
    expiresIn: number,
    publicRead?: boolean,
  ): Promise<PresignResult>;

  /** 短期私有下载签名 */
  abstract presignDownload(key: string, expiresIn: number): Promise<string>;

  /** 删除 object */
  abstract deleteObject(key: string, publicRead?: boolean): Promise<void>;

  /** 检查 object 是否存在 */
  abstract headObject(key: string, publicRead?: boolean): Promise<ObjectMeta | null>;

  /** 公开 URL 基础 (给 complete 时拼 publicUrl) */
  abstract getPublicUrlBase(): string;
}

export interface PresignResult {
  /** 浏览器 PUT 到这个 URL 即可上传 */
  uploadUrl: string;
  /** 公开文件的长期 URL；私有 scope 不返回 */
  publicUrl?: string;
  /** S3/MinIO 上的 object key, 用于 confirm 时定位 */
  key: string;
  /** 签名 URL 过期时间 (秒) */
  expiresIn: number;
  /** 需要的额外 form 字段 (S3 POST 用, PUT 模式为空) */
  fields?: Record<string, string>;
}

export interface ObjectMeta {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
}
