/**
 * WebAssistantMessage — 单条 message 渲染
 *
 * - user: 右对齐 + 蓝色气泡
 * - assistant: 左对齐 + 灰气泡 + sources chips(可点击跳转)
 * - system: 不渲染
 */
import { useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, Trophy, ExternalLink, Globe, FileText } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/cn';
import { useWebAssistantStore } from '../../stores/webAssistantStore';
import type { ChatMessage, ChatSource } from '../../lib/chatApi';

interface WebAssistantMessageProps {
  message: ChatMessage;
  sources?: ChatSource[];
  pending?: boolean;
}

// P1 (verifier audit 2026-07-24): 必须覆盖 ChatSource['type'] 全 union, 否则
// 后端 emit 'site' source 时 `meta.icon` 抛 undefined → React 崩. 加 'site' fallback.
// v1.9-alpha.2 (C-01): 加 'lesson' — 课程会话 RAG 引用当前课时。
const TYPE_META: Record<ChatSource['type'], { label: string; icon: typeof BookOpen }> = {
  course: { label: '课程', icon: BookOpen },
  degree: { label: '学位', icon: GraduationCap },
  hackathon: { label: '黑客松', icon: Trophy },
  site: { label: '站内', icon: Globe },
  lesson: { label: '本课时', icon: FileText },
};

export function WebAssistantMessage({ message, sources, pending }: WebAssistantMessageProps) {
  const isUser = message.role === 'user';
  const navigate = useNavigate();
  const closeDrawer = useWebAssistantStore((s) => s.closeDrawer);

  if (message.role === 'system') return null;

  const handleSourceClick = (url: string) => {
    closeDrawer();
    navigate(url);
  };

  return (
    <div
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
      data-testid={`chat-msg-${message.role}`}
    >
      <div className={cn('flex flex-col max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-3 py-2 text-sm leading-relaxed break-words',
            isUser
              ? 'bg-[#171717] text-neutral-0 rounded-md rounded-br-sm'
              : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-200 dark:text-neutral-900 rounded-md rounded-bl-sm',
          )}
        >
          {pending ? (
            <div className="flex flex-col gap-2 min-w-[120px]">
              <span className="text-xs text-neutral-600">正在思考...</span>
              <Skeleton variant="text" count={3} />
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        {!isUser && sources && sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="chat-sources">
            {sources.map((s) => {
              const meta = TYPE_META[s.type];
              const Icon = meta.icon;
              return (
                <button
                  key={`${s.type}-${s.id}`}
                  type="button"
                  onClick={() => handleSourceClick(s.url)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1 text-xs',
                    'rounded-md border border-neutral-200 bg-neutral-0',
                    'text-neutral-900 hover:border-[#171717] hover:bg-neutral-50',
                    'dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200',
                    'transition-colors',
                  )}
                  title={s.title}
                >
                  <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate max-w-[160px]">
                    {meta.label}: {s.title}
                  </span>
                  <ExternalLink className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
