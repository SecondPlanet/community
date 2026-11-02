import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileLearningTabs } from './MobileLearningTabs';

describe('MobileLearningTabs', () => {
  it('implements roving focus and arrow-key selection', () => {
    const change = vi.fn();
    render(<MobileLearningTabs tabs={[{ id: 'outline', label: '目录', panelId: 'outline-panel' }, { id: 'lesson', label: '学习', panelId: 'lesson-panel' }]} activeId="outline" onTabChange={change} />);
    const first = screen.getByRole('tab', { name: '目录' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(change).toHaveBeenCalledWith('lesson');
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label');
  });
});
