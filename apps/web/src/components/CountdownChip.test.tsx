import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CountdownChip } from './CountdownChip';

describe('CountdownChip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('不渲染当 deadline 为 null', () => {
    const { container } = render(<CountdownChip deadline={null} prefix="倒计时" />);
    expect(container.firstChild).toBeNull();
  });

  it('不渲染当 deadline 已是过去时间', () => {
    const past = new Date(Date.now() - 60_000);
    const { container } = render(<CountdownChip deadline={past} prefix="倒计时" />);
    expect(container.firstChild).toBeNull();
  });

  it('渲染剩余时间 (天 时 分 格式)', () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000 + 30 * 60 * 1000);
    render(<CountdownChip deadline={future} prefix="报名截止" />);
    // 默认 ≥ 1 天时显示 "X 天 X 时 X 分"
    expect(screen.getByText(/2 天/)).toBeInTheDocument();
    expect(screen.getByText(/报名截止/)).toBeInTheDocument();
  });

  it('deadline 临近(< 1 小时)只显示分秒', () => {
    const future = new Date(Date.now() + 5 * 60 * 1000 + 30 * 1000);
    render(<CountdownChip deadline={future} prefix="距开赛" />);
    expect(screen.getByText(/分/)).toBeInTheDocument();
    expect(screen.queryByText(/天/)).not.toBeInTheDocument();
  });

  it('每秒 tick 刷新', () => {
    const future = new Date(Date.now() + 60_000);
    const { container } = render(<CountdownChip deadline={future} prefix="倒计时" />);
    const initialText = container.querySelector('time')?.textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const newText = container.querySelector('time')?.textContent;
    // 文本应该变化(秒数 -1)
    expect(newText).not.toBe(initialText);
  });

  it('time 元素 dateTime 属性用 ISO 格式', () => {
    const future = new Date('2026-12-31T23:59:59.000Z');
    const { container } = render(<CountdownChip deadline={future} prefix="倒计时" />);
    const time = container.querySelector('time');
    expect(time?.tagName).toBe('TIME');
    expect(time?.getAttribute('datetime')).toBe('2026-12-31T23:59:59.000Z');
  });

  it('onExpire 回调在 deadline 过了时触发', () => {
    const onExpire = vi.fn();
    const future = new Date(Date.now() + 5000);
    render(<CountdownChip deadline={future} onExpire={onExpire} />);
    expect(onExpire).not.toHaveBeenCalled();
    // 加速到过期
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onExpire).toHaveBeenCalled();
  });
});
