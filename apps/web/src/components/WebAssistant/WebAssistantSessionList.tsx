/**
 * WebAssistantSessionList — 左侧 session 列表
 *
 * - 顶部"新对话"按钮(始终显)
 * - 中间会话列表(Skeleton / EmptyState / 真实数据)
 * - 选中项高亮(走 brutalist #171717)
 * - hover 显示删除按钮(可选,留到后续)
 */
import { Plus, MessageSquare } from 'lucide-react';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../../lib/cn';
import type { ChatSession } from '../../lib/chatApi';

interface WebAssistantSessionListProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch {
    return '';
  }
}

export function WebAssistantSessionList({
  sessions,
  currentSessionId,
  isLoading,
  onSelect,
  onNew,
}: WebAssistantSessionListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-neutral-200">
        <Button
          variant="primary"
          size="sm"
          fullWidth
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={onNew}
          data-testid="chat-new-session"
        >
          新对话
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2" data-testid="chat-session-list">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton variant="text" className="h-12" />
            <Skeleton variant="text" className="h-12" />
            <Skeleton variant="text" className="h-12" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={<MessageSquare className="w-5 h-5" />}
              title="还没有对话"
              description="点击上方按钮开始"
              className="py-6"
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    data-testid={`chat-session-${s.id}`}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md',
                      'flex flex-col gap-0.5',
                      'transition-colors',
                      isActive
                        ? 'bg-[#171717] text-neutral-0'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-200 text-neutral-900',
                    )}
                  >
                    <span className="text-sm font-medium truncate">
                      {s.title || '未命名对话'}
                    </span>
                    <span
                      className={cn(
                        'text-[11px]',
                        isActive ? 'text-neutral-200' : 'text-neutral-600',
                      )}
                    >
                      {s.messageCount} 条消息 · {formatTime(s.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
