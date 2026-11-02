import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ConfirmDialog', () => {
  it('不渲染当 open=false', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="确认删除?"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('渲染 title + description + confirm/cancel 按钮', () => {
    render(
      <ConfirmDialog
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="确认删除用户?"
        description="此操作不可恢复"
        variant="danger"
        confirmText="确认删除"
        cancelText="再想想"
      />,
    );
    expect(screen.getByText('确认删除用户?')).toBeInTheDocument();
    expect(screen.getByText('此操作不可恢复')).toBeInTheDocument();
    expect(screen.getByText('确认删除')).toBeInTheDocument();
    expect(screen.getByText('再想想')).toBeInTheDocument();
  });

  it('role="alertdialog" + aria-modal', () => {
    render(
      <ConfirmDialog
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="测试"
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('点"确认"调 onConfirm + onClose', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="删除确认"
      />,
    );
    // button text 是 "确认",title 是 "删除确认"
    const btn = screen.getByRole('button', { name: '确认' });
    btn.click();
    await vi.waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('点"取消"调 onClose', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="删除确认"
      />,
    );
    screen.getByRole('button', { name: '取消' }).click();
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('点遮罩调 onClose', () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="删除确认"
      />,
    );
    // 遮罩是第一个 aria-label="关闭" 的 button
    screen.getAllByRole('button', { name: '关闭' })[0].click();
    expect(onClose).toHaveBeenCalled();
  });

  it('ESC 键调 onClose', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="删除确认"
      />,
    );
    // useEffect 注册 listener 需要等一帧
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('陷阱焦点并在关闭后恢复到触发按钮', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>删除</button>
          <ConfirmDialog
            open={open}
            onClose={() => setOpen(false)}
            onConfirm={vi.fn()}
            title="删除确认"
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '删除' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();

    const confirm = screen.getByRole('button', { name: '确认' });
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getAllByRole('button', { name: '关闭' })[1]).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });
});
