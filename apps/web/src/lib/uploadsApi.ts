/**
 * uploadsApi — 前端直传 MinIO/S3 客户端
 *
 * 2026-07-24: P0 — 视频上传管道
 *
 * 流程:
 *   1) sign(scope, file) → 后端返 presigned PUT URL
 *   2) 浏览器 PUT file 到 uploadUrl (XHR 带 progress)
 *   3) complete(scope, key, refId) → 后端把 publicUrl 写到目标 entity 字段
 *   4) 返 publicUrl 给业务侧用 (lesson.videoUrl / course.thumbnail ...)
 *
 * 设计:
 *   - 零 SDK: 浏览器 fetch + XHR 足够, 不引入 aws-sdk 浏览器版 (节省 bundle)
 *   - XHR 走 onprogress 给 UI 进度条
 *   - 错误细分: sign fail / upload fail / complete fail 三段
 */
import api from './api';

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

export interface SignResult {
  uploadUrl: string;
  publicUrl?: string;
  key: string;
  expiresIn: number;
  scope: UploadScope;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadOptions {
  scope: UploadScope;
  file: File;
  /** 目标 entity id. create 时上传 (resource/submission-video) 可留空, 由业务侧用 publicUrl setField */
  refId?: string;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  publicUrl?: string;
  key: string;
  name: string;
  size: number;
  mimeType: string;
  writtenBack: boolean;
}

export const uploadsApi = {
  /**
   * 申请 presigned PUT URL
   * @param refId 目标 entity id (可选, create 时上传可不传)
   */
  async sign(scope: UploadScope, file: { name: string; type: string; size: number }, refId?: string): Promise<SignResult> {
    const { data } = await api.post<SignResult>('/api/v1/uploads/sign', {
      scope,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      refId,
    });
    return data;
  },

  /**
   * 确认上传完成, 后端把 publicUrl 写到目标 entity
   */
  async complete(scope: UploadScope, key: string, refId?: string, filename?: string): Promise<UploadResult> {
    const { data } = await api.post<UploadResult>('/api/v1/uploads/complete', {
      scope,
      key,
      refId,
      filename,
    });
    return data;
  },

  /**
   * 一步上传: sign → PUT → complete (refId 存在时 complete 写库)
   * 返完整元数据；私有附件 scope 的 refId 始终为 hackathonId，无 publicUrl
   *
   * 错误细分 (用 err.code 区分):
   *   - 'SIGN_FAILED' / 'UPLOAD_FAILED' / 'COMPLETE_FAILED'
   */
  async upload(opts: UploadOptions): Promise<UploadResult> {
    const { scope, file, refId, onProgress, signal } = opts;

    // 1) sign
    let signed: SignResult;
    try {
      signed = await uploadsApi.sign(scope, file, refId);
    } catch (e: any) {
      const err = new Error(`sign failed: ${e?.response?.data?.message ?? e?.message}`) as any;
      err.code = 'SIGN_FAILED';
      err.cause = e;
      throw err;
    }

    // 2) PUT to uploadUrl
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signed.uploadUrl, true);
      if (file.type) xhr.setRequestHeader('Content-Type', file.type);
      if (onProgress) {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            onProgress({ loaded: ev.loaded, total: ev.total, percent: Math.round((ev.loaded / ev.total) * 100) });
          }
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`PUT ${xhr.status} ${xhr.responseText?.slice(0, 200) ?? ''}`));
      };
      xhr.onerror = () => reject(new Error('network error during PUT'));
      xhr.onabort = () => reject(new Error('upload aborted'));
      if (signal) {
        signal.addEventListener('abort', () => xhr.abort());
      }
      xhr.send(file);
    }).catch((e) => {
      const err = new Error(`upload failed: ${e?.message ?? e}`) as any;
      err.code = 'UPLOAD_FAILED';
      err.cause = e;
      throw err;
    });

    // 3) complete — refId 存在时后端写库, 不存在只 confirm object 存在
    try {
      const r = await uploadsApi.complete(scope, signed.key, refId, file.name);
      return r;
    } catch (e: any) {
      const err = new Error(`complete failed: ${e?.response?.data?.message ?? e?.message}`) as any;
      err.code = 'COMPLETE_FAILED';
      err.cause = e;
      throw err;
    }
  },
};

export default uploadsApi;
