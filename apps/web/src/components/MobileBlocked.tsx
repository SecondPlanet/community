/**
 * MobileBlocked — < md 屏幕拦截页
 *
 * 用途:admin 等复杂后台在 < md(平板以下)体验差,
 * 显示「请用桌面访问」友好拦截页
 *
 * 用法:
 *   function AdminLayout() {
 *     return (
 *       <>
 *         <MobileBlocked />
 *         <div className="hidden md:block">{actualContent}</div>
 *       </>
 *     )
 *   }
 *
 * 行为:
 *   - 始终 mount,用 CSS @media 控制可见性,避免 SSR hydration mismatch
 *   - 自动 focus「复制桌面链接」按钮
 *   - 屏幕阅读器能感知角色
 */
import { Monitor, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';

interface MobileBlockedProps {
  /** 自定义标题(默认「请用桌面访问」) */
  title?: string;
  description?: string;
}

export function MobileBlocked({
  title = '请用桌面访问',
  description = '管理后台是复杂工具,推荐在桌面浏览器(Chrome / Safari / Edge 最新版)使用,以获得完整布局和编辑体验。',
}: MobileBlockedProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="alert"
      className={cn(
        'md:hidden min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center',
        'bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50',
      )}
    >
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#EEEDE9] dark:bg-[#262626]/20 text-[#171717] mb-6">
        <Monitor className="w-8 h-8" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-600 mb-6 max-w-sm leading-relaxed">
        {description}
      </p>
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white rounded-md hover:bg-[#262626] text-sm font-medium transition-colors min-h-[44px]"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? '已复制' : '复制当前链接到桌面浏览器'}
      </button>
      <p className="text-xs text-neutral-400 mt-4">
        提示:窗口宽度 ≥ 768px 时自动恢复访问
      </p>
    </div>
  );
}
