import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/auth/Toast';
import { RegistrationsPanel } from './RegistrationsPanel';
import { adminHackathonsApi, type AdminRegistration } from './types';

vi.mock('../../../lib/hackathonsApi', () => ({
  hackathonsApi: {
    getRegistrations: vi.fn(),
    reviewRegistration: vi.fn(),
    getRegistrationAttachmentUrl: vi.fn(),
  },
}));

const registration: AdminRegistration = {
  id: 'r1',
  hackathonId: 'h1',
  userId: 'u1',
  user: { name: 'Ada', email: 'ada@example.com' },
  registeredAt: '2026-10-01T00:00:00Z',
  reviewStatus: 'pending',
  answers: { motivation: 'Build useful AI' },
  formSnapshot: [{ id: 'motivation', label: '参赛动机', type: 'textarea', required: true }],
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider><RegistrationsPanel hackathonId="h1" /></ToastProvider></QueryClientProvider>);
}

describe('RegistrationsPanel', () => {
  beforeEach(() => {
    vi.mocked(adminHackathonsApi.getRegistrations).mockReset();
    vi.mocked(adminHackathonsApi.reviewRegistration).mockReset();
  });

  it('reads paginated results, displays snapshot answers, and submits a review', async () => {
    vi.mocked(adminHackathonsApi.getRegistrations).mockResolvedValue({ items: [registration] });
    vi.mocked(adminHackathonsApi.reviewRegistration).mockResolvedValue({ ...registration, reviewStatus: 'approved', reviewNote: '合适' });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '查看报名详情' }));
    expect(screen.getByText('参赛动机')).toBeInTheDocument();
    expect(screen.getByText('Build useful AI')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('审核备注'), { target: { value: '合适' } });
    fireEvent.click(screen.getByRole('button', { name: '通过报名' }));
    await waitFor(() => expect(adminHackathonsApi.reviewRegistration).toHaveBeenCalledWith('h1', 'r1', { reviewStatus: 'approved', reviewNote: '合适' }));
  });
});
