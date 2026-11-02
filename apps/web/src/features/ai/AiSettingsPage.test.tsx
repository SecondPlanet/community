import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSettingsPage } from './AiSettingsPage';
import { aiProviderApi } from '../../lib/aiProviderApi';

vi.mock('../../lib/aiProviderApi', () => ({
  aiProviderApi: {
    list: vi.fn(),
    save: vi.fn(),
    verify: vi.fn(),
    remove: vi.fn(),
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AiSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AiSettingsPage', () => {
  beforeEach(() => {
    vi.mocked(aiProviderApi.list).mockReset();
    vi.mocked(aiProviderApi.save).mockReset();
    vi.mocked(aiProviderApi.verify).mockReset();
    vi.mocked(aiProviderApi.remove).mockReset();
  });

  it('shows a retryable error state when provider configs fail to load', async () => {
    vi.mocked(aiProviderApi.list).mockRejectedValue(new Error('Network Error'));
    renderPage();

    expect(await screen.findByRole('heading', { name: '无法加载 AI 配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('keeps API key controls accessible and confirms before removing a config', async () => {
    vi.mocked(aiProviderApi.list).mockResolvedValue([
      {
        id: 'config-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        baseUrl: null,
        isActive: true,
        verifiedAt: new Date().toISOString(),
        lastVerifyError: null,
        apiKeyMasked: 'sk-****',
      },
    ]);
    vi.mocked(aiProviderApi.remove).mockResolvedValue(undefined);
    renderPage();

    expect(await screen.findByRole('button', { name: '显示 API Key' })).toBeInTheDocument();
    const removeButton = await screen.findByRole('button', { name: '移除' });
    fireEvent.click(removeButton);
    expect(aiProviderApi.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(aiProviderApi.remove).toHaveBeenCalledWith('openai'));
  });

  it('saves the MiniMax Anthropic preset for BYOK users', async () => {
    vi.mocked(aiProviderApi.list).mockResolvedValue([]);
    vi.mocked(aiProviderApi.save).mockResolvedValue({
      id: 'config-minimax',
      provider: 'minimax',
      model: 'MiniMax-M3',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      isActive: true,
      verifiedAt: null,
      lastVerifyError: null,
      apiKeyMasked: '****test',
    });
    vi.mocked(aiProviderApi.verify).mockResolvedValue({ ok: true, sample: 'ok' });
    renderPage();

    const minimax = await screen.findByRole('button', { name: /MiniMax/ });
    fireEvent.click(minimax);
    fireEvent.change(screen.getByPlaceholderText('粘贴你的 API Key'), { target: { value: 'minimax-secret-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));

    await waitFor(() => expect(aiProviderApi.save).toHaveBeenCalledWith({
      provider: 'minimax',
      apiKey: 'minimax-secret-key',
      model: 'MiniMax-M3',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      isActive: true,
    }));
    expect(aiProviderApi.verify).toHaveBeenCalledWith('minimax');
  });

  it('keeps a saved provider pending when verification fails', async () => {
    vi.mocked(aiProviderApi.list).mockResolvedValue([]);
    vi.mocked(aiProviderApi.save).mockResolvedValue({
      id: 'config-minimax',
      provider: 'minimax',
      model: 'MiniMax-M3',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      isActive: true,
      verifiedAt: null,
      lastVerifyError: null,
      apiKeyMasked: '****test',
    });
    vi.mocked(aiProviderApi.verify).mockResolvedValue({ ok: false, error: 'AI_PROVIDER_HTTP_401' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /MiniMax/ }));
    const keyInput = screen.getByPlaceholderText('粘贴你的 API Key');
    fireEvent.change(keyInput, { target: { value: 'minimax-secret-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并启用' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '配置已保存，但连接验证失败：AI_PROVIDER_HTTP_401',
    );
    expect(keyInput).toHaveValue('');
  });
});
