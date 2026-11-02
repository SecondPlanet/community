import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegistrationFormBuilder, validateRegistrationFields } from './RegistrationFormBuilder';
import type { RegistrationField } from './types';

function Harness() {
  const [fields, setFields] = useState<RegistrationField[]>([]);
  return <RegistrationFormBuilder mode="internal" fields={fields} registrationUrl="" registrationLabel="" saving={false} onModeChange={vi.fn()} onFieldsChange={setFields} onUrlChange={vi.fn()} onLabelChange={vi.fn()} onSave={vi.fn()} />;
}

describe('RegistrationFormBuilder', () => {
  it('adds, edits, and reorders fields without changing their identity controls', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '添加字段' }));
    fireEvent.change(screen.getByLabelText(/字段名称/), { target: { value: '姓名' } });
    fireEvent.click(screen.getByRole('button', { name: '添加字段' }));
    fireEvent.change(screen.getAllByLabelText(/字段名称/)[1], { target: { value: '项目链接' } });
    fireEvent.click(screen.getByRole('button', { name: '下移 姓名' }));
    expect(screen.getAllByLabelText<HTMLInputElement>(/字段名称/).map((input) => input.value)).toEqual(['项目链接', '姓名']);
    fireEvent.click(screen.getByRole('button', { name: '预览表单' }));
    expect(screen.getByText('项目链接')).toBeInTheDocument();
    expect(screen.getByText('姓名')).toBeInTheDocument();
  });

  it('validates labels and choice options before save', () => {
    const base = { id: 'one', label: '', type: 'text' as const, required: false };
    expect(validateRegistrationFields([base])).toMatch('名称');
    expect(validateRegistrationFields([{ ...base, label: '方向', type: 'select', options: [] }])).toMatch('选项');
    expect(validateRegistrationFields([{ ...base, label: '方向', type: 'select', options: ['AI'] }])).toBeNull();
  });
});
