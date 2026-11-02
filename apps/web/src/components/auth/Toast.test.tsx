/**
 * Toast — v1.9-alpha.1 (B-06) 默认时长回归测试
 *
 * 旧默认 3s 太短(UX-AUDIT-2026-09-11 §2 高频 Confusing);
 * 新默认: success/info/warning = 5000ms; error = 8000ms; 仍允许覆盖。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

function Probe({ variant, duration }: { variant: 'success' | 'error' | 'info' | 'warning'; duration?: number }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast('hello', variant, duration)}>
      emit
    </button>
  );
}

describe('Toast 默认时长 (B-06)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('success 默认 5000ms', async () => {
    render(
      <ToastProvider>
        <Probe variant="success" />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByText('emit').click();
    });
    expect(screen.getByText('hello')).toBeInTheDocument();
    // 4.999s 还在; 5.001s 消失
    await act(async () => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText('hello')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('error 默认 8000ms', async () => {
    render(
      <ToastProvider>
        <Probe variant="error" />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByText('emit').click();
    });
    await act(async () => {
      vi.advanceTimersByTime(7999);
    });
    expect(screen.getByText('hello')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('info 默认 5000ms', async () => {
    render(
      <ToastProvider>
        <Probe variant="info" />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByText('emit').click();
    });
    await act(async () => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText('hello')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('调用方传 durationMs 覆盖默认', async () => {
    render(
      <ToastProvider>
        <Probe variant="error" duration={1200} />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByText('emit').click();
    });
    await act(async () => {
      vi.advanceTimersByTime(1199);
    });
    expect(screen.getByText('hello')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });
});
