import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseModal } from './PurchaseModal';
import { ordersApi } from '../../lib/ordersApi';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../../lib/ordersApi', () => ({
  ordersApi: {
    create: vi.fn(),
    pay: vi.fn(),
  },
}));

vi.mock('../../lib/cms', () => ({
  usePageSettings: () => ({ data: undefined }),
  useI18n: () => ({ t: (_key: string, fallback: string) => fallback }),
  pickPage: (_data: unknown, _key: string, _locale: string, fallback: string) => fallback,
}));

function PurchaseHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开购买窗口
      </button>
      <PurchaseModal
        open={open}
        onClose={() => setOpen(false)}
        type="course"
        itemId="course-1"
        title="测试课程"
        price={0}
        costType="free"
      />
    </>
  );
}

function renderPurchase() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PurchaseHarness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PurchaseModal', () => {
  beforeEach(() => {
    vi.mocked(ordersApi.create).mockReset();
    vi.mocked(ordersApi.pay).mockReset();
    useAuthStore.setState({
      user: { id: 'user-1', email: 'student@example.com', name: '学生', role: 'student' },
    });
  });

  it('exposes dialog semantics, traps focus, closes on Escape, and restores focus', async () => {
    renderPurchase();
    const trigger = screen.getByRole('button', { name: '打开购买窗口' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '确认报名' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();

    const submit = screen.getByRole('button', { name: '立即报名' });
    submit.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.querySelector<HTMLButtonElement>('[aria-label="关闭购买窗口"]')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('announces order creation failures without leaking a rejected event promise', async () => {
    vi.mocked(ordersApi.create).mockRejectedValue(new Error('network unavailable'));
    renderPurchase();
    fireEvent.click(screen.getByRole('button', { name: '打开购买窗口' }));
    fireEvent.click(screen.getByRole('button', { name: '立即报名' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('操作失败，请稍后重试');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('moves focus to the success state after the confirm controls are replaced', async () => {
    vi.mocked(ordersApi.create).mockResolvedValue({ enrolled: true } as never);
    renderPurchase();
    fireEvent.click(screen.getByRole('button', { name: '打开购买窗口' }));
    fireEvent.click(screen.getByRole('button', { name: '立即报名' }));

    const successTitle = await screen.findByRole('heading', { name: '报名成功' });
    await waitFor(() => expect(successTitle).toHaveFocus());
  });
});
