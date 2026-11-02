interface OAuthStatePayload {
  providerId?: unknown;
  purpose?: unknown;
}

function decodeOAuthState(state: string): OAuthStatePayload | null {
  try {
    const payload = state.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as OAuthStatePayload;
  } catch {
    return null;
  }
}

export function providerFromOAuthState(state: string): string | null {
  const decoded = decodeOAuthState(state);
  return typeof decoded?.providerId === 'string' && /^oauth\.[a-z0-9_-]+$/i.test(decoded.providerId)
    ? decoded.providerId
    : null;
}

/**
 * This payload hint only selects the callback endpoint. The API verifies the
 * signed state, its purpose, provider, user and expiry before linking.
 */
export function isOAuthLinkState(state: string, providerId: string): boolean {
  const decoded = decodeOAuthState(state);
  return decoded?.providerId === providerId && decoded.purpose === 'oauth-link-state';
}

const OAUTH_LINK_PROVIDER_KEY = 'secondplanet.oauth-link-provider';

export function markOAuthLink(providerId: string) {
  try {
    window.sessionStorage.setItem(OAUTH_LINK_PROVIDER_KEY, providerId);
  } catch {
    // Privacy modes may disable sessionStorage; the backend still validates state.
  }
}

export function consumeOAuthLink(providerId: string): boolean {
  try {
    const linkedProvider = window.sessionStorage.getItem(OAUTH_LINK_PROVIDER_KEY);
    window.sessionStorage.removeItem(OAUTH_LINK_PROVIDER_KEY);
    return linkedProvider === providerId;
  } catch {
    return false;
  }
}

export function clearOAuthLink() {
  try {
    window.sessionStorage.removeItem(OAUTH_LINK_PROVIDER_KEY);
  } catch {
    // Ignore storage failures.
  }
}
