import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderButtons } from './ProviderButtons';

describe('ProviderButtons', () => {
  const providers = [
    { id: 'email_password', label: '邮箱', type: 'email_password' as const, enabled: true },
    { id: 'oauth.google', label: 'Google', type: 'oauth' as const, enabled: true },
    { id: 'oauth.github', label: 'GitHub', type: 'oauth' as const, enabled: false },
  ];

  it('uses backend capability flags and hides email_password', () => {
    const onClick = vi.fn();
    render(
      <ProviderButtons
        grayscale={false}
        providers={providers}
        onProviderClick={onClick}
      />,
    );

    expect(screen.queryByRole('button', { name: '用 邮箱 登录' })).toBeNull();
    expect(screen.getByRole('button', { name: '用 Google 登录' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'GitHub 暂不可用' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '用 Google 登录' }));
    expect(onClick).toHaveBeenCalledWith('oauth.google', 'Google');
  });

  it('can force all providers disabled on the account-binding page', () => {
    render(<ProviderButtons grayscale providers={providers} />);
    expect(screen.getByRole('button', { name: 'Google 暂不可用' })).toBeDisabled();
  });
});
