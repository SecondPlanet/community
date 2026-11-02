import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('jwt-secret-that-is-long-enough-for-tests'),
  } as any;
  const prisma = {
    user: { findFirst: jest.fn() },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('uses the current database identity and role', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'current@example.com',
      role: 'student',
    });
    const strategy = new JwtStrategy(config, prisma);

    await expect(
      strategy.validate({ sub: 'u1', email: 'old@example.com', role: 'admin' }),
    ).resolves.toEqual({ userId: 'u1', email: 'current@example.com', role: 'student' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', deletedAt: null },
      select: { id: true, email: true, role: true },
    });
  });

  it('rejects access tokens for disabled or missing users immediately', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const strategy = new JwtStrategy(config, prisma);

    await expect(
      strategy.validate({ sub: 'u1', email: 'user@example.com', role: 'student' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
