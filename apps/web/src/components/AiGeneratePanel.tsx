import { useState } from 'react';
import { Sparkles, Loader2, X, Wand2 } from 'lucide-react';

interface AiGeneratePanelProps {
  type: 'course' | 'degree';
  onApply: (draft: any) => void;
  onGenerate: (topic: string, hint?: string) => Promise<any>;
  placeholder?: string;
}

/**
 * AI 智能填充面板
 * 管理员输入主题 → 后端生成草稿 → 一键应用到表单 → 仍可手动修改
 */
export function AiGeneratePanel({
  type,
  onApply,
  onGenerate,
  placeholder,
}: AiGeneratePanelProps) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('请输入主题或题目');
      return;
    }
    setLoading(true);
    setError(null);
    setApplied(false);
    try {
      const result = await onGenerate(topic.trim(), hint.trim() || undefined);
      setDraft(result);
    } catch (err: any) {
      setError(extractFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!draft) return;
    onApply(draft);
    setApplied(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        AI 智能填充
      </button>
    );
  }

  return (
    <div className="border-2 border-[#171717] bg-white p-4 sm:p-5 md:p-6 mb-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Wand2 className="w-4 h-4 shrink-0" />
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest truncate">
            AI 智能填充 · {type === 'course' ? '课程' : '学位'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDraft(null);
            setError(null);
            setApplied(false);
          }}
          aria-label="关闭 AI 智能填充"
          className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] hover:bg-[#EEEDE9] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs sm:text-sm text-[#666666] mb-4 leading-relaxed">
        输入一个题目或主题，AI 会自动生成标题、描述、学习要点、标签、缩略图等元数据。生成后仍可在下方表单自由修改。
      </p>

      <div className="space-y-3">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={placeholder ?? '例：RAG 系统实战：从零搭建企业知识库'}
          className="w-full px-4 py-3 border border-[#171717] text-base focus:outline-none focus:bg-[#EEEDE9] transition-colors"
        />
        <textarea
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          rows={2}
          placeholder="附加要求（可选）：如目标受众、难度、风格、必含模块..."
          className="w-full px-4 py-3 border border-[#171717] text-base focus:outline-none focus:bg-[#EEEDE9] transition-colors resize-none"
        />

        {error && (
          <div className="px-3 py-2 border border-red-600 bg-red-50 text-red-700 text-xs sm:text-sm">
            {error}
          </div>
        )}

        {applied && (
          <div className="px-3 py-2 border border-[#171717] bg-[#EEEDE9] text-[#171717] text-xs sm:text-sm">
            ✓ 已应用到下方表单。继续修改表单或点击"保存草稿"。
          </div>
        )}

        {draft && (
          <div className="border border-[#171717] p-3 sm:p-4 bg-[#F5F4F0] space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
              / AI Generated Draft
            </div>
            <DraftRow label="标题" value={draft.title} />
            <DraftRow label="讲师" value={draft.instructor} />
            <DraftRow label="难度" value={draft.level} />
            <DraftRow label="时长" value={draft.duration} />
            <DraftRow label="类型" value={draft.costType} />
            {draft.price !== undefined && <DraftRow label="价格" value={`¥${draft.price}`} />}
            <DraftRow label="标签" value={draft.tags} />
            {draft.courseType && <DraftRow label="课程类型" value={draft.courseType === 'external' ? '外部链接' : '自建课程'} />}
            {draft.externalUrl && <DraftRow label="外部链接" value={draft.externalUrl} />}
            <DraftRow label="描述" value={draft.description} multiline />
            {draft.learningPoints && (
              <DraftRow label="学习要点" value={draft.learningPoints} multiline />
            )}
            {draft.thumbnail && (
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#666666] sm:w-16 shrink-0">
                  封面
                </span>
                <img
                  src={draft.thumbnail}
                  alt="draft"
                  className="w-full sm:w-32 h-32 sm:h-20 object-cover border border-[#171717]"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          {!draft ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 生成中
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> 生成草稿
                </>
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleApply}
                disabled={applied}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors disabled:opacity-50"
              >
                {applied ? '✓ 已应用' : '应用到表单'}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 border border-[#171717] text-[#171717] text-xs font-black uppercase tracking-widest hover:bg-[#EEEDE9] transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                重新生成
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
      <span className="text-[10px] font-black uppercase tracking-widest text-[#666666] sm:w-16 shrink-0 sm:mt-0.5">
        {label}
      </span>
      <span className={`text-sm font-medium flex-1 break-words ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * 把任意错误归类成 5 种用户友好消息之一。
 * 优先匹配客户端可识别的错误（network / timeout / 401 / 403 / 5xx 兜底），
 * 避免把 API key / stack 摘要等内网细节透出到 UI。
 */
function extractFriendlyError(err: any): string {
  // 客户端可识别的错误
  const msg = String(err?.message ?? '');
  if (err?.code === 'ERR_NETWORK' || /Network Error/i.test(msg)) {
    return '网络连接失败，请检查后重试';
  }
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(msg) || err?.name === 'AbortError') {
    return 'AI 生成超时（已限制 30 秒），请稍后再试';
  }
  // 后端脱敏后的具体消息（如果有）
  const backend = err?.response?.data?.message;
  if (typeof backend === 'string' && backend.length > 0 && backend.length < 200 && !/(api[_ ]?key|stack|at \w+\(|node_modules)/i.test(backend)) {
    return backend;
  }
  // HTTP 状态码兜底
  const status = err?.response?.status;
  if (status === 401) return '登录已失效，请重新登录后再试';
  if (status === 403) return '没有权限使用 AI 智能填充';
  if (status === 429) return 'AI 调用太频繁，请稍后再试';
  if (status && status >= 500) return 'AI 服务暂时不可用，请稍后再试';
  return '生成失败，请稍后再试';
}
