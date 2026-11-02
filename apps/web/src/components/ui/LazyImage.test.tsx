import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LazyImage } from './LazyImage';

describe('LazyImage', () => {
  it('keeps a fill fallback inside normal parent layout after an image error', () => {
    render(
      <div data-testid="frame">
        <LazyImage src="/missing-course-cover.png" alt="课程封面" fill />
      </div>,
    );

    fireEvent.error(screen.getByAltText('课程封面'));

    const fallback = screen.getByRole('img', { name: '课程封面' });
    expect(fallback).toHaveClass('h-full', 'w-full');
    expect(fallback).not.toHaveClass('absolute', 'inset-0');
  });
});
