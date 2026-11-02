import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Drawer } from './Drawer';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        查看详情
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="用户详情">
        <button type="button">编辑用户</button>
      </Drawer>
    </>
  );
}

describe('Drawer', () => {
  it('traps focus, closes on Escape, and restores its trigger', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '查看详情' });
    trigger.focus();
    fireEvent.click(trigger);

    const drawer = screen.getByRole('dialog', { name: '用户详情' });
    const close = screen.getAllByRole('button', { name: '关闭' })[1];
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(close).toHaveFocus();

    const edit = screen.getByRole('button', { name: '编辑用户' });
    edit.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
