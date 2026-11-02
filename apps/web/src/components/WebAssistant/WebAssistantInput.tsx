/**
 * WebAssistantInput — 输入区
 *
 * - textarea auto-resize (1-6 行)
 * - 发送按钮:右对齐,无文本时 disabled
 * - 加载中:输入框 + 发送按钮都 disabled,显示 loader
 * - 快捷键:Enter 发送 / Shift+Enter 换行
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

interface WebAssistantInputProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_HEIGHT = 160; // 约 6 行

export function WebAssistantInput({
  value,
  onChange,
  onSend,
  isSending,
  disabled,
  placeholder = '试试问: 平台有哪些 AI 课程?',
}: WebAssistantInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // auto-resize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, MAX_HEIGHT);
    ta.style.height = `${next}px`;
  }, [localValue]);

  const handleChange = (text: string) => {
    setLocalValue(text);
    onChange(text);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (localValue.trim() && !isSending && !disabled) {
        onSend();
      }
    }
  };

  const canSend = !isSending && !disabled && localValue.trim().length > 0;

  return (
    <div
      className={cn(
        'flex items-end gap-2 p-3 border-t border-neutral-200',
        'bg-neutral-0 dark:bg-neutral-100',
      )}
    >
      <textarea
        ref={taRef}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        disabled={disabled || isSending}
        rows={1}
        data-testid="chat-input"
        className={cn(
          'flex-1 resize-none px-3 py-2 text-sm',
          'rounded-md border border-neutral-200 bg-neutral-50',
          'text-neutral-900 placeholder:text-neutral-600',
          'focus:outline-none focus:border-[#171717] focus:ring-1 focus:ring-[#171717]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'dark:bg-neutral-200 dark:text-neutral-900 dark:placeholder:text-neutral-600',
        )}
        style={{ minHeight: '40px' }}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        aria-label="发送"
        data-testid="chat-send"
        className={cn(
          'shrink-0 w-10 h-10 rounded-md',
          'flex items-center justify-center',
          'bg-[#171717] text-neutral-0',
          'hover:bg-[#262626] active:bg-[#171717]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors',
        )}
      >
        {isSending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
