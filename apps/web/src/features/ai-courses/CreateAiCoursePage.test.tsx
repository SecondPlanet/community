import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiCoursesApi } from './aiCoursesApi';
import { CreateAiCoursePage } from './CreateAiCoursePage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><CreateAiCoursePage /></MemoryRouter></QueryClientProvider>);
}

describe('CreateAiCoursePage recovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reuses a key for the same input, rotates it after input changes, and focuses errors', async () => {
    const create = vi.spyOn(aiCoursesApi, 'createProject').mockRejectedValue(new Error('network'));
    renderPage();
    const question = screen.getByLabelText('你真正想学会什么？');
    fireEvent.change(question, { target: { value: '解释向量数据库如何召回相关知识' } });
    const submit = screen.getByRole('button', { name: '开始设计课程' });

    fireEvent.click(submit);
    const firstError = await screen.findByRole('alert');
    expect(firstError).toHaveFocus();
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    fireEvent.change(question, { target: { value: '解释向量数据库的索引与召回权衡' } });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));

    expect(create.mock.calls[0][1]).toBe(create.mock.calls[1][1]);
    expect(create.mock.calls[2][1]).not.toBe(create.mock.calls[1][1]);
  });
});
