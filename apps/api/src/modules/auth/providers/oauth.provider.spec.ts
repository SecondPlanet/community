import { UnauthorizedException } from '@nestjs/common';
import { OAuthProvider } from './oauth.provider';

describe('OAuthProvider identity normalization', () => {
  const provider = new OAuthProvider(
    'oauth.google',
    { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/callback', scopes: [] },
    {} as any,
  );

  it('rejects a Google profile whose email is not provider-verified', () => {
    expect(() => (provider as any).normalize('oauth.google', {
      sub: 'google-user', email: 'unverified@example.com', email_verified: false,
    })).toThrow(UnauthorizedException);
  });

  it('marks a verified Google email as verified for account-linking decisions', () => {
    const identity = (provider as any).normalize('oauth.google', {
      sub: 'google-user', email: 'verified@example.com', email_verified: true,
    });

    expect(identity.profile).toEqual(expect.objectContaining({
      email: 'verified@example.com', emailVerified: true,
    }));
  });
});

describe('OAuthProvider account linking', () => {
  const prisma = {
    userProviderAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const provider = new OAuthProvider(
    'oauth.google',
    { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/callback', scopes: [] },
    prisma as any,
  );
  const identity = {
    providerUserId: 'google-user',
    profile: {
      email: 'verified@example.com',
      name: 'Verified User',
      emailVerified: true,
      raw: { sub: 'google-user' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(provider, 'verify').mockResolvedValue(identity);
  });

  it('creates a new provider account with visible identity metadata', async () => {
    prisma.userProviderAccount.findUnique.mockResolvedValue(null);

    await provider.link('user-1', { code: 'code' });

    expect(prisma.userProviderAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        provider: 'oauth.google',
        providerUserId: 'google-user',
        email: 'verified@example.com',
        displayName: 'Verified User',
        deletedAt: null,
      }),
    });
  });

  it('reactivates a previously unlinked provider account for the same user', async () => {
    const deletedAt = new Date('2026-01-01T00:00:00Z');
    prisma.userProviderAccount.findUnique.mockResolvedValue({
      id: 'identity-1',
      userId: 'user-1',
      linkedAt: new Date('2025-01-01T00:00:00Z'),
      deletedAt,
    });

    await provider.link('user-1', { code: 'code' });

    expect(prisma.userProviderAccount.update).toHaveBeenCalledWith({
      where: { id: 'identity-1' },
      data: expect.objectContaining({
        deletedAt: null,
        linkedAt: expect.any(Date),
        lastUsedAt: expect.any(Date),
      }),
    });
    expect(prisma.userProviderAccount.create).not.toHaveBeenCalled();
  });

  it('rejects a provider account already linked to another user', async () => {
    prisma.userProviderAccount.findUnique.mockResolvedValue({
      id: 'identity-1',
      userId: 'other-user',
      linkedAt: new Date(),
      deletedAt: null,
    });

    await expect(provider.link('user-1', { code: 'code' })).rejects.toThrow(
      /already linked to another user/,
    );
  });
});
