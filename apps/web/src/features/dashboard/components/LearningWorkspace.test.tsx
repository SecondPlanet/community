import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LearningWorkspace } from './LearningWorkspace';

describe('LearningWorkspace responsibility', () => {
  it('composes responsive panels and keyboard tabs without router or query providers', () => {
    render(<LearningWorkspace tabs={[{ id: 'outline', label: '目录', panelId: 'o' }, { id: 'content', label: '教材', panelId: 'c' }, { id: 'assistant', label: '导师', panelId: 'a' }]} activeTab="content" onTabChange={() => undefined} outline={<p>outline-slot</p>} content={<p>content-slot</p>} assistant={<p>assistant-slot</p>} />);
    expect(screen.getByTestId('learning-workspace')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: '教材' })).toContainElement(screen.getByText('content-slot'));
    expect(screen.getAllByText('assistant-slot')).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole('tab', { name: '教材' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '导师' })).toHaveFocus();
  });
});
