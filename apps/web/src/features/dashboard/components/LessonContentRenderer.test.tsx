import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonContentRenderer } from './LessonContentRenderer';
import type { LessonBlock } from '../../ai-courses/aiCourses.types';

describe('LessonContentRenderer safety', () => {
  it('sanitizes raw HTML and non-HTTPS links without executing content', () => {
    render(<LessonContentRenderer blocks={[{ id: 'p1', type: 'paragraph', markdown: '<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [http](http://example.com) [good](https://example.com)', conceptKeys: [] }]} />);
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: 'good' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByText('bad').closest('a')).not.toHaveAttribute('href');
    expect(screen.getByText('http').closest('a')).toHaveAttribute('href', '');
  });

  it('renders a safe fallback for unknown blocks', () => {
    render(<LessonContentRenderer blocks={[{ id: 'future', type: 'future' } as unknown as LessonBlock]} />);
    expect(screen.getByText(/暂时无法显示/)).toBeInTheDocument();
  });
});
