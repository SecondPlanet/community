jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$reset-password-hash'),
}));

import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  const values: Record<string, string> = {
    RESEND_API_KEY: 're_test_key',
    MAIL_FROM: 'SecondPlanet <account@example.com>',
    PUBLIC_URL: 'https://secondplanet.example.com',
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!values[key]) throw new Error(`missing ${key}`);
      return values[key];
    }),
  } as any;
  const prisma: any = {
    user: { findFirst: jest.fn(), update: jest.fn() },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: { deleteMany: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
  };
  const fetchMock = jest.fn();
  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as any;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({ id: 'u1' });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    service = new PasswordResetService(prisma, config);
  });

  it('fails consistently when email delivery is not configured', async () => {
    const original = values.RESEND_API_KEY;
    values.RESEND_API_KEY = '';
    await expect(service.request('user@example.com')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    values.RESEND_API_KEY = original;
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns the same accepted response for an unknown address', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.request('missing@example.com')).resolves.toEqual({ accepted: true });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores only a token hash and sends a single-use reset link', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      passwordHash: 'existing-hash',
    });
    prisma.passwordResetToken.create.mockResolvedValue({ id: 'reset-1' });

    await expect(service.request('USER@example.com')).resolves.toEqual({ accepted: true });

    const createData = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(createData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createData.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
          'Idempotency-Key': 'password-reset-reset-1',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(['user@example.com']);
    expect(body.text).toContain('https://secondplanet.example.com/auth/reset?token=');
    expect(body.text).not.toContain(createData.tokenHash);
  });

  it('atomically consumes the token, changes the password and revokes sessions', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', deletedAt: null },
    });

    await expect(service.confirm('raw-token-value', 'New!Password123')).resolves.toEqual({
      changed: true,
    });
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'reset-1', usedAt: null }) }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: '$2b$12$reset-password-hash', passwordResetRequired: false },
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('rejects expired or already-used tokens', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'u1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', deletedAt: null },
    });
    await expect(service.confirm('raw-token-value', 'New!Password123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
