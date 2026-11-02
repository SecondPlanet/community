jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { EmailPasswordProvider } from './email-password.provider';

describe('EmailPasswordProvider', () => {
  const prisma: any = { user: { findUnique: jest.fn(), create: jest.fn() } };
  const provider = new EmailPasswordProvider(prisma, 12);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a soft-deleted user before checking its password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'deleted@example.com', passwordHash: 'hash', deletedAt: new Date(),
    });

    await expect(provider.verify({
      email: 'deleted@example.com', password: 'password', mode: 'login',
    })).rejects.toThrow(UnauthorizedException);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('rejects weak passwords even through the generic provider endpoint', async () => {
    await expect(provider.verify({
      email: 'new@example.com',
      password: 'password',
      name: 'New User',
      mode: 'register',
    })).rejects.toThrow(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a strong registration password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('strong-hash');
    prisma.user.create.mockResolvedValue({
      id: 'u2',
      email: 'new@example.com',
      name: 'New User',
    });

    await expect(provider.verify({
      email: 'new@example.com',
      password: 'Strong!Password123',
      name: 'New User',
      mode: 'register',
    })).resolves.toEqual(expect.objectContaining({ providerUserId: 'new@example.com' }));
  });
});
