/**
 * FileUploadButton — 通用 file picker + presigned upload
 *
 * 2026-07-24: P0 — 视频上传管道
 *
 * 用法:
 *   <FileUploadButton
 *     scope="lesson-video"
 *     refId={lessonId}
 *     label="上传视频"
 *     accept="video/*"
 *     onUploaded={(publicUrl) => setVideoUrl(publicUrl)}
 *   />
 *
 * 流程:
 *   1) 用户选文件
 *   2) sign → PUT to presigned URL (带 progress 进度条)
 *   3) complete → 后端把 publicUrl 写到 refId 字段
 *   4) onUploaded(publicUrl) 回调, 父组件 setVideoUrl(...) 自动填到 form
 */
import { useRef, useState } from 'react';
import { Upload, X, Check } from 'lucide-react';
import { uploadsApi, UploadScope, UploadResult } from '../../lib/uploadsApi';

interface Props {
  scope: UploadScope;
  /**
   * 目标 entity id.
   * - 已有 entity 改字段 (lesson 视频 / course 封面 / user avatar): refId = entity.id
   * - create 时上传 (resource / submission-video): refId 留空, 用 onUploaded 拿 publicUrl 走原 create flow
   */
  refId?: string;
  label?: string;
  accept?: string;
  /** 私有附件通过第二个参数接收 { key, name, size, mimeType }，publicUrl 为空 */
  onUploaded: (publicUrl: string, result: UploadResult) => void;
  /** 已有的 URL (用于显示"已上传"状态 + 删除按钮) */
  existingUrl?: string | null;
  /** 已有 URL 时显示 "替换" / "清除" 按钮 */
  onClear?: () => void;
  /** 自定义按钮 class */
  className?: string;
}

export function FileUploadButton({
  scope,
  refId,
  label = '上传文件',
  accept,
  onUploaded,
  existingUrl,
  onClear,
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const r = await uploadsApi.upload({
        scope,
        refId,
        file,
        onProgress: (p) => setProgress(p.percent),
      });
      onUploaded(r.publicUrl ?? '', r);
      setProgress(100);
    } catch (err: any) {
      setError(err?.message ?? '上传失败');
    } finally {
      setUploading(false);
      // 清空 input value 允许同名文件再选
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-[#171717] text-white hover:bg-[#262626] disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? `上传中 ${progress}%` : label}
        </button>
        {existingUrl && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest border border-[#171717] text-[#171717] hover:bg-[#EEEDE9]"
            title="清除当前 URL"
          >
            <X className="w-3 h-3" />
            清除
          </button>
        )}
      </div>
      {uploading && (
        <div className="h-1 bg-[#EEEDE9]">
          <div
            className="h-full bg-[#171717] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {existingUrl && !uploading && (
        <div className="flex items-center gap-1 text-[10px] text-green-700">
          <Check className="w-3 h-3" /> 已上传: {existingUrl.split('/').pop()}
        </div>
      )}
      {error && (
        <div className="text-[10px] text-red-600">{error}</div>
      )}
    </div>
  );
}
