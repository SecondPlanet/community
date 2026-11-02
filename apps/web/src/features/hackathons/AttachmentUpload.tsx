import { useEffect, useId, useState } from 'react';
import { FileUp, RotateCcw, X } from 'lucide-react';
import type { UploadedFileMeta } from '@secondplanet/shared-types';
import { uploadsApi } from '../../lib/uploadsApi';
import { Button } from '../../components/ui/Button';

interface PendingUpload {
  file: File;
  progress: number;
  error?: string;
}

interface AttachmentUploadProps {
  hackathonId: string;
  scope: 'hackathon-application-file' | 'submission-attachment';
  label: string;
  files: UploadedFileMeta[];
  onUploaded: (file: UploadedFileMeta) => void;
  onRemove: (key: string) => void;
  onDownload?: (file: UploadedFileMeta, index: number) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  multiple?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function AttachmentUpload({
  hackathonId,
  scope,
  label,
  files,
  onUploaded,
  onRemove,
  onDownload,
  disabled,
  required,
  error,
  multiple,
  onBusyChange,
}: AttachmentUploadProps) {
  const inputId = useId();
  const [pending, setPending] = useState<PendingUpload[]>([]);

  useEffect(() => {
    onBusyChange?.(pending.length > 0);
  }, [pending.length, onBusyChange]);

  const upload = async (file: File) => {
    setPending((current) => current.map((item) =>
      item.file === file ? { file, progress: 0 } : item,
    ));
    try {
      const result = await uploadsApi.upload({
        scope,
        file,
        refId: hackathonId,
        onProgress: ({ percent }) => setPending((current) => current.map((item) =>
          item.file === file ? { ...item, progress: percent } : item,
        )),
      });
      onUploaded({ key: result.key, name: result.name, size: result.size, mimeType: result.mimeType });
      setPending((current) => current.filter((item) => item.file !== file));
    } catch (cause) {
      setPending((current) => current.map((item) =>
        item.file === file ? { ...item, error: uploadErrorText(cause) } : item,
      ));
    }
  };

  const chooseFiles = (chosen: FileList | null) => {
    if (!chosen) return;
    const selected = Array.from(chosen);
    setPending((current) => [
      ...current,
      ...selected.map((file) => ({ file, progress: 0 })),
    ]);
    selected.forEach(upload);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <label htmlFor={inputId} className="text-xs font-black uppercase tracking-wider">
          {label}{required && <span className="ml-1" aria-hidden="true">*</span>}
        </label>
        {!disabled && (
          <Button size="sm" variant="secondary" type="button" onClick={() => document.getElementById(inputId)?.click()}>
            <FileUp className="w-3.5 h-3.5" /> 选择文件
          </Button>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        multiple={multiple}
        disabled={disabled}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(event) => {
          chooseFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {(files.length > 0 || pending.length > 0) && (
        <ul className="border border-[#D8D6CF] divide-y divide-[#D8D6CF] bg-white dark:bg-[#1A1916]">
          {files.map((file, index) => (
            <li key={file.key} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="flex-1 min-w-0 truncate font-medium">{file.name}</span>
              <span className="text-[#525252] dark:text-[#A8A6A0] shrink-0">{formatBytes(file.size)}</span>
              {onDownload && (
                <button type="button" className="font-bold underline underline-offset-2" onClick={() => onDownload(file, index)}>下载</button>
              )}
              {!disabled && (
                <button type="button" aria-label={`移除 ${file.name}`} onClick={() => onRemove(file.key)} className="p-1 hover:bg-[#EEEDE9] dark:hover:bg-[#2C2A26]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
          {pending.map((item, index) => (
            <li key={`${item.file.name}-${item.file.lastModified}-${index}`} className="px-3 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex-1 min-w-0 truncate font-medium">{item.file.name}</span>
                {!item.error && <span aria-live="polite">{item.progress}%</span>}
                {item.error && (
                  <button type="button" onClick={() => upload(item.file)} className="inline-flex items-center gap-1 font-bold underline underline-offset-2">
                    <RotateCcw className="w-3 h-3" /> 重试
                  </button>
                )}
              </div>
              {!item.error && <progress className="w-full h-1 mt-2" max={100} value={item.progress} aria-label={`${item.file.name} 上传进度`} />}
              {item.error && <p role="alert" className="mt-1 text-red-700">上传失败，请重试。{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {error && <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 上传失败文案: 后端/网络错误统一转中文, 不把英文原始错误暴露给用户 */
function uploadErrorText(cause: unknown): string {
  const code = (cause as { code?: string } | null)?.code;
  if (code === 'SIGN_FAILED') return '无法获取上传地址，请稍后重试';
  if (code === 'UPLOAD_FAILED') return '文件上传中断，请检查网络后重试';
  if (code === 'COMPLETE_FAILED') return '上传未完成，请稍后重试';
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('对象存储暂不可用')) return '文件服务暂不可用，请稍后重试';
  if (message.includes('network')) return '文件上传中断，请检查网络后重试';
  return message || '上传失败，请重试';
}
