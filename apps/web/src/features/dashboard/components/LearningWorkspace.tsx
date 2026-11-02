import type { ReactNode, RefObject } from 'react';
import { cn } from '../../../lib/cn';
import { MobileLearningTabs, type LearningTab } from './MobileLearningTabs';

interface LearningWorkspaceProps {
  tabs: [LearningTab, LearningTab, LearningTab];
  activeTab: string;
  onTabChange(id: string): void;
  outline: ReactNode;
  content: ReactNode;
  assistant: ReactNode;
  className?: string;
  contentClassName?: string;
  outlineClassName?: string;
  contentRef?: RefObject<HTMLElement | null>;
}

/** Pure responsive composition: no router, HTTP, query cache or domain state. */
export function LearningWorkspace({ tabs, activeTab, onTabChange, outline, content, assistant, className, contentClassName, outlineClassName, contentRef }: LearningWorkspaceProps) {
  const [outlineTab, contentTab, assistantTab] = tabs;
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)} data-testid="learning-workspace">
      <MobileLearningTabs tabs={tabs} activeId={activeTab} onTabChange={onTabChange} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_360px] 2xl:grid-cols-[320px_minmax(600px,1fr)_400px]">
        <aside id={outlineTab.panelId} role="tabpanel" aria-labelledby={`learning-tab-${outlineTab.id}`} className={cn('min-h-0 overflow-hidden border-r border-neutral-200 dark:border-neutral-700 md:block', activeTab === outlineTab.id ? 'block' : 'hidden', outlineClassName)}>{outline}</aside>
        <main ref={contentRef} id={contentTab.panelId} role="tabpanel" aria-labelledby={`learning-tab-${contentTab.id}`} className={cn('min-h-0 min-w-0 overflow-hidden md:block', activeTab === contentTab.id ? 'block' : 'hidden', contentClassName)}>{content}</main>
        <aside className="hidden min-h-0 min-w-0 overflow-hidden border-l border-neutral-200 dark:border-neutral-700 xl:block" aria-label={assistantTab.label}>{assistant}</aside>
      </div>
      <section id={assistantTab.panelId} role="tabpanel" aria-labelledby={`learning-tab-${assistantTab.id}`} hidden={activeTab !== assistantTab.id} className="fixed inset-x-0 bottom-0 top-[7rem] z-30 overflow-hidden bg-white dark:bg-neutral-900 md:hidden">{assistant}</section>
    </div>
  );
}
