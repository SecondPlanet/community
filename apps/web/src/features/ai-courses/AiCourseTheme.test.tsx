import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CreateAiCoursePage } from './CreateAiCoursePage';

describe('AI course theme surface', () => {
  it('provides a dark background and readable descendant color overrides', () => {
    document.documentElement.classList.add('dark');
    const client = new QueryClient();
    const { container } = render(<QueryClientProvider client={client}><MemoryRouter><CreateAiCoursePage /></MemoryRouter></QueryClientProvider>);
    const surface = container.firstElementChild;
    expect(surface).toHaveClass('dark:bg-neutral-950');
    expect(surface?.className).toContain('[&_.text-neutral-950]:dark:text-neutral-900');
    expect(screen.getByRole('heading', { name: /从一个真实问题开始/ })).toBeVisible();
    document.documentElement.classList.remove('dark');
  });
});
