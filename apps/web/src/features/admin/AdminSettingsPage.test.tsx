import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/auth/Toast';
import { AdminSettingsPage } from './AdminSettingsPage';
import api from '../../lib/api';

vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AdminSettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('AdminSettingsPage CMS contracts', () => {
  it('persists site and page settings with the backend valueJson contract', async () => {
    mockedApi.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/site-settings')) return { data: [{ key: 'brand.name', value: 'Old brand' }] };
      if (url.endsWith('/app-settings')) return { data: [] };
      if (url.endsWith('/page-settings')) {
        return { data: [{ page: 'home', key: 'hero.headline', value: 'Old headline' }] };
      }
      return { data: [] };
    });
    mockedApi.patch.mockResolvedValue({ data: {} });
    mockedApi.post.mockResolvedValue({ data: {} });
    mockedApi.delete.mockResolvedValue({ data: {} });

    renderPage();

    const siteValue = await screen.findByDisplayValue('Old brand');
    fireEvent.change(siteValue, { target: { value: 'New brand' } });
    const siteSection = siteValue.closest('section')!;
    fireEvent.click(within(siteSection).getByTitle('保存此行'));
    await waitFor(() => {
      expect(mockedApi.patch).toHaveBeenCalledWith(
        '/api/v1/admin/cms/site-settings/brand.name',
        { valueJson: 'New brand' },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /页面文案/ }));
    const pageValue = await screen.findByDisplayValue('Old headline');
    fireEvent.change(pageValue, { target: { value: 'New headline' } });
    const pageSection = pageValue.closest('section')!;
    fireEvent.click(within(pageSection).getByTitle('保存此行'));
    await waitFor(() => {
      expect(mockedApi.patch).toHaveBeenCalledWith(
        '/api/v1/admin/cms/page-settings/home%3Ahero.headline',
        { valueJson: 'New headline' },
      );
    });
  });
});
