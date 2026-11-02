import { describe, expect, it } from 'vitest';
import {
  clearOAuthLink,
  consumeOAuthLink,
  isOAuthLinkState,
  markOAuthLink,
  providerFromOAuthState,
} from './oauthCallback';

function stateFor(payload: object) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${encoded}.signature`;
}

describe('providerFromOAuthState', () => {
  it('extracts an OAuth provider from the signed-state payload', () => {
    expect(providerFromOAuthState(stateFor({ providerId: 'oauth.github' }))).toBe('oauth.github');
  });

  it('rejects malformed and non-OAuth provider ids', () => {
    expect(providerFromOAuthState('invalid')).toBeNull();
    expect(providerFromOAuthState(stateFor({ providerId: 'email_password' }))).toBeNull();
  });

  it('recognizes an account-link state without relying on session storage', () => {
    const state = stateFor({ providerId: 'oauth.github', purpose: 'oauth-link-state' });
    expect(isOAuthLinkState(state, 'oauth.github')).toBe(true);
    expect(isOAuthLinkState(state, 'oauth.google')).toBe(false);
    expect(
      isOAuthLinkState(
        stateFor({ providerId: 'oauth.github', purpose: 'oauth-state' }),
        'oauth.github',
      ),
    ).toBe(false);
  });

  it('marks and consumes a provider-specific account-link callback once', () => {
    clearOAuthLink();
    markOAuthLink('oauth.google');
    expect(consumeOAuthLink('oauth.github')).toBe(false);
    expect(consumeOAuthLink('oauth.google')).toBe(false);

    markOAuthLink('oauth.google');
    expect(consumeOAuthLink('oauth.google')).toBe(true);
    expect(consumeOAuthLink('oauth.google')).toBe(false);
  });
});
