import { KeyboardEvent } from 'react';
import { cn } from '../../../lib/cn';

export interface LearningTab {
  id: string;
  label: string;
  panelId: string;
}

export function MobileLearningTabs({
  tabs,
  activeId,
  onTabChange,
}: {
  tabs: LearningTab[];
  activeId: string;
  onTabChange(id: string): void;
}) {
  const activateFromKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onTabChange(tabs[next].id);
    document.getElementById(`learning-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label="学习视图" className="grid border-b border-neutral-200 bg-white dark:border-neutral-400 dark:bg-neutral-100 md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`learning-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          aria-controls={tab.panelId}
          tabIndex={activeId === tab.id ? 0 : -1}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(event) => activateFromKey(event, index)}
          className={cn(
            'min-h-11 border-b-2 px-3 text-sm font-medium',
            activeId === tab.id ? 'border-neutral-950 text-neutral-950 dark:border-white dark:text-white' : 'border-transparent text-neutral-600 dark:text-neutral-800',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
