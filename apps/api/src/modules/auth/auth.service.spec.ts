/**
 * AuthService 单测 (2026-07-27)
 *
 * 覆盖:
 *   - authenticate(providerId) 多 provider 调度 (email_password / oauth.google / custom.basic)
 *   - provider not found / disabled
 *   - upsertUser 三条路径: 已有 provider account / 同 email 合并 / 全新 user
 *   - refresh: 哈希校验 + 轮换 (删旧发新) + 失效检测 (expired / reused)
 *   - login / register 兼容入口
 *   - listProviders 过滤 disabled / 无 describe 的 provider
 *
 * 风格: jest mock prisma + provider 桩 (参考 instructors.service.spec.ts)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AuthService, AUTH_PROVIDERS } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthProvider, AuthIdentity } from './providers/auth-provider.types';

// =================== 桩 ===================

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userProviderAccount: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  authProvider: {
    findMany: jest.fn(),
  },
};

const mockJwtService: any = {
  sign: jest.fn((payload: any) => `jwt.${payload.sub}.${payload.role}`),
  verify: jest.fn(),
};

// 三个 provider 桩 — 用 class 让 AuthService 能 new Map(providers)
class StubEmailPasswordProvider extends AuthProvider {
  readonly id = 'email_password';
  readonly type = 'email_password' as const;
  readonly enabled = true;
  describe() {
    return { id: this.id, label: 'Email', type: this.type };
  }
  async verify(_creds: any): Promise<AuthIdentity> {
    return {
      providerUserId: 'u@example.com',
      profile: { email: 'u@example.com', name: 'User', emailVerified: true },
    };
  }
  async link(): Promise<void> {}
}

class StubGoogleProvider extends AuthProvider {
  readonly id = 'oauth.google';
  readonly type = 'oauth' as const;
  readonly enabled = true;
  describe() {
    return { id: this.id, label: 'Google', type: this.type };
  }
  async verify(_creds: any): Promise<AuthIdentity> {
    return {
      providerUserId: 'google-sub-123',
      profile: {
        email: 'g@example.com',
        name: 'G User',
        avatarUrl: 'https://x/a.png',
        emailVerified: true,
      },
    };
  }
  async link(): Promise<void> {}
  createAuthorizationUrl(state: string) {
    return `https://accounts.example/authorize?state=${state}`;
  }
}

class StubCustomProvider extends AuthProvider {
  readonly id = 'custom.basic';
  readonly type = 'email_password' as const;
  readonly enabled = true;
  describe() {
    return { id: this.id, label: 'Custom', type: this.type };
  }
  async verify(_creds: any): Promise<AuthIdentity> {
    return {
      providerUserId: 'custom-sub',
      profile: { email: 'custom@example.com', name: 'Custom User', emailVerified: true },
    };
  }
  async link(): Promise<void> {}
}

class DisabledProvider extends AuthProvider {
  readonly id = 'disabled.one';
  readonly type = 'email_password' as const;
  readonly enabled = false;
  describe() {
    return { id: this.id, label: 'Disabled', type: this.type };
  }
  async verify(): Promise<AuthIdentity> {
    return { providerUserId: 'x', profile: { email: 'x@x.com', name: 'x' } };
  }
  async link(): Promise<void> {}
}

class NoDescribeProvider extends AuthProvider {
  readonly id = 'nodesc.one';
  readonly type = 'email_password' as const;
  readonly enabled = true;
  async verify(): Promise<AuthIdentity> {
    return { providerUserId: 'x', profile: { email: 'x@x.com', name: 'x' } };
  }
  async link(): Promise<void> {}
}

// =================== 工具 ===================

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

function makeStoredToken(rawToken: string, userId: string, expired = false) {
  const expiresAt = new Date();
  if (expired) expiresAt.setDate(expiresAt.getDate() - 1);
  else expiresAt.setDate(expiresAt.getDate() + 7);
  return {
    token: sha256(rawToken),
    userId,
    expiresAt,
    user: { id: userId, email: `${userId}@x.com`, role: 'student', name: 'User', deletedAt: null as Date | null },
  };
}

// =================== 测试 ===================

describe('AuthService', () => {
  let service: AuthService;
  let providers: AuthProvider[];

  beforeEach(async () => {
    jest.clearAllMocks();
    // 重置所有 mock 实现
    Object.values(mockPrisma).forEach((model: any) => {
      if (typeof model === 'object' && model !== null) {
        Object.values(model).forEach((fn: any) => {
          if (typeof fn?.mockReset === 'function') fn.mockReset();
        });
      }
    });
    mockJwtService.sign.mockReset();
    mockJwtService.sign.mockImplementation((p: any) => `jwt.${p.sub}.${p.role}`);
    mockJwtService.verify.mockReset();
    mockJwtService.verify.mockReturnValue({
      purpose: 'oauth-state',
      providerId: 'oauth.google',
    });
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.authProvider.findMany.mockResolvedValue([]);

    providers = [
      new StubEmailPasswordProvider(),
      new StubGoogleProvider(),
      new StubCustomProvider(),
      new DisabledProvider(),
      new NoDescribeProvider(),
    ];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AUTH_PROVIDERS, useValue: providers },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // =============================================================
  // authenticate — 调度
  // =============================================================

  describe('authenticate(providerId, credentials)', () => {
    it('email_password provider → verify + upsert + issue tokens', async () => {
      // 新 user 路径: provider account 不存在, email 也不存在 → 创建 user + account
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'u1',
        email: 'u@example.com',
        name: 'User',
        role: 'student',
      });
      mockPrisma.userProviderAccount.create.mockResolvedValueOnce({ id: 'pa1' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u1' });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt1' });

      const result = await service.authenticate('email_password', {
        email: 'u@example.com',
        password: 'pw',
        mode: 'register',
      });

      expect(result.accessToken).toMatch(/^jwt\.u1\.student$/);
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
      expect(result.user).toEqual({
        id: 'u1',
        email: 'u@example.com',
        name: 'User',
        role: 'student',
        passwordResetRequired: false,
      });
      // 验证调用了 user.update (lastLoginAt)
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { lastLoginAt: expect.any(Date) },
        }),
      );
    });

    it('oauth.google provider → verify 返回 oauth identity → upsert 新 user', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'u2',
        email: 'g@example.com',
        name: 'G User',
        role: 'student',
      });
      mockPrisma.userProviderAccount.create.mockResolvedValueOnce({ id: 'pa2' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u2' });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt2' });

      const result = await service.authenticate('oauth.google', {
        code: 'oauth-code',
        state: 'signed-oauth-state',
      });

      expect(result.user.email).toBe('g@example.com');
      // OAuth 用户没有本地密码，不应被临时密码修改流程锁住。
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: '',
            passwordResetRequired: false,
            avatarUrl: 'https://x/a.png',
          }),
        }),
      );
    });

    it('custom.basic provider → verify 返回 identity → upsert 新 user (无需本地密码重置)', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'u3',
        email: 'custom@example.com',
        name: 'Custom User',
        role: 'student',
      });
      mockPrisma.userProviderAccount.create.mockResolvedValueOnce({ id: 'pa3' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u3' });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt3' });

      const result = await service.authenticate('custom.basic', {});

      expect(result.user.email).toBe('custom@example.com');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordResetRequired: false }),
        }),
      );
    });

    it('未知 providerId → UnauthorizedException', async () => {
      await expect(
        service.authenticate('does.not.exist', { foo: 'bar' }),
      ).rejects.toThrow(UnauthorizedException);
      // 不应触发任何 prisma 调用
      expect(mockPrisma.userProviderAccount.findUnique).not.toHaveBeenCalled();
    });

    it('disabled provider → UnauthorizedException (即便 provider 存在)', async () => {
      await expect(
        service.authenticate('disabled.one', { foo: 'bar' }),
      ).rejects.toThrow(/not enabled/);
      expect(mockPrisma.userProviderAccount.findUnique).not.toHaveBeenCalled();
    });
  });

  // =============================================================
  // upsertUser 路径 (通过 authenticate 间接覆盖)
  // =============================================================

  describe('upsertUser 路径 (via authenticate)', () => {
    it('已有 provider account → 复用 user, isNewUser=false (不创建新 user)', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce({
        provider: 'oauth.google',
        providerUserId: 'google-sub-123',
        user: {
          id: 'u-existing',
          email: 'existing@x.com',
          name: 'Existing',
          role: 'student',
        },
      });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u-existing' });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt1' });

      const result = await service.authenticate('oauth.google', {
        code: 'c',
        state: 'signed-oauth-state',
      });

      expect(result.user.id).toBe('u-existing');
      // 不应再查 email 找 user
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      // 不应再 create user
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('已解绑的 provider account → 拒绝登录，不会尝试重新创建 account', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce({
        provider: 'oauth.google',
        providerUserId: 'google-sub-123',
        deletedAt: new Date(),
        user: {
          id: 'u-existing', email: 'existing@x.com', name: 'Existing', role: 'student', deletedAt: null,
        },
      });

      await expect(service.authenticate('oauth.google', {
        code: 'c', state: 'signed-oauth-state',
      })).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.userProviderAccount.create).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('绑定的 user 已删除 → 拒绝 OAuth 登录', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce({
        provider: 'oauth.google',
        providerUserId: 'google-sub-123',
        deletedAt: null,
        user: {
          id: 'u-deleted', email: 'deleted@x.com', name: 'Deleted', role: 'student', deletedAt: new Date(),
        },
      });

      await expect(service.authenticate('oauth.google', {
        code: 'c', state: 'signed-oauth-state',
      })).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('provider account 不存在 + 同 email user 存在 → link provider account 到现有 user', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-existing',
        email: 'shared@x.com',
        name: 'Shared',
        role: 'student',
      });
      mockPrisma.userProviderAccount.create.mockResolvedValueOnce({ id: 'pa-new' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u-existing' });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt1' });

      const result = await service.authenticate('oauth.google', {
        code: 'c',
        state: 'signed-oauth-state',
      });

      expect(result.user.id).toBe('u-existing');
      expect(result.user.email).toBe('shared@x.com');
      // 验证 create 了 provider account link (没 create user)
      expect(mockPrisma.userProviderAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u-existing',
            provider: 'oauth.google',
            providerUserId: 'google-sub-123',
          }),
        }),
      );
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('未验证邮箱不能自动绑定到已有 user', async () => {
      const unverifiedOAuth = new StubGoogleProvider();
      jest.spyOn(unverifiedOAuth, 'verify').mockResolvedValueOnce({
        providerUserId: 'unverified-google',
        profile: { email: 'shared@x.com', name: 'Unverified' },
      });
      (service as any).providers.set('oauth.google', unverifiedOAuth);
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-existing', email: 'shared@x.com', name: 'Shared', role: 'student', deletedAt: null,
      });

      await expect(service.authenticate('oauth.google', {
        code: 'c', state: 'signed-oauth-state',
      })).rejects.toThrow(/not verified/);
      expect(mockPrisma.userProviderAccount.create).not.toHaveBeenCalled();
    });
  });

  // =============================================================
  // refresh
  // =============================================================

  describe('refresh(token)', () => {
    it('合法 token → 删旧 + 签发新 (rotation)', async () => {
      const rawToken = 'old-refresh-token';
      const stored = makeStoredToken(rawToken, 'u1');
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(stored);
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt-new' });

      const result = await service.refresh(rawToken);

      // 旧 token 应被 hash 后查 + 删除
      expect(mockPrisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: sha256(rawToken) },
        include: { user: true },
      });
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          token: sha256(rawToken),
          expiresAt: { gte: expect.any(Date) },
        },
      });
      // 发了新 token
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.refreshToken).not.toBe(rawToken);
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token: sha256(result.refreshToken),
            userId: 'u1',
          }),
        }),
      );
    });

    it('token 不在 DB → UnauthorizedException', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.refresh('unknown')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('token 已过期 → UnauthorizedException (即使 hash 命中)', async () => {
      const rawToken = 'expired';
      const stored = makeStoredToken(rawToken, 'u1', true /* expired */);
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(stored);

      await expect(service.refresh(rawToken)).rejects.toThrow(/Invalid refresh token/);
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('user 已删除 → 拒绝 refresh，且不签发新 token', async () => {
      const rawToken = 'deleted-user-token';
      const stored = makeStoredToken(rawToken, 'u1');
      stored.user.deletedAt = new Date();
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(stored);

      await expect(service.refresh(rawToken)).rejects.toThrow(/Invalid refresh token/);
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('token 已轮换 (旧 token reuse) → DB 已无, 走 not found 路径', async () => {
      // 模拟 rotation 后旧 token 已经被删
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.refresh('reused-token')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('空 token → UnauthorizedException (短路, 不查 DB)', async () => {
      await expect(service.refresh('')).rejects.toThrow(/No refresh token/);
      expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });

  // =============================================================
  // login / register 兼容入口
  // =============================================================

  describe('login(dto) 兼容入口', () => {
    it('内部走 email_password provider', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: 'u@example.com',
        name: 'User',
        role: 'student',
      });
      // 同 email 命中 → link provider account
      mockPrisma.userProviderAccount.create.mockResolvedValueOnce({ id: 'pa1' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u1' });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt1' });

      const result = await service.login({ email: 'u@example.com', password: 'pw' });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('logout(token)', () => {
    it('revokes the persisted refresh token', async () => {
      await service.logout('raw-refresh-token');

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: sha256('raw-refresh-token') },
      });
    });

    it('is idempotent when no cookie is present', async () => {
      await service.logout();
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('register(dto) 兼容入口', () => {
    it('只返回 user, 不返回 token (前端需要再走 login)', async () => {
      mockPrisma.userProviderAccount.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'u-new',
        email: 'new@x.com',
        name: 'New',
        role: 'student',
      });
      mockPrisma.userProviderAccount.create.mockResolvedValueOnce({ id: 'pa1' });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'u-new' });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({ id: 'rt1' });

      const result = await service.register({
        email: 'new@x.com',
        password: 'pw1234',
        name: 'New',
      });

      expect(result.user.id).toBe('u-new');
      // register 不暴露 token
      expect((result as any).accessToken).toBeUndefined();
      expect((result as any).refreshToken).toBeUndefined();
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: expect.any(String) },
      });
    });
  });

  // =============================================================
  // listProviders
  // =============================================================

  describe('listProviders()', () => {
    it('只返回 enabled、可描述且有可用浏览器启动流程的 provider', async () => {
      const result = await service.listProviders();

      // 没有 createAuthorizationUrl 的 oauth provider 不能作为可点击能力暴露。
      // disabled.one: enabled=false → 排除
      // nodesc.one: 没 describe → 排除
      const ids = result.map((r) => r.id);
      expect(ids).toEqual(
        expect.arrayContaining(['email_password', 'oauth.google', 'custom.basic']),
      );
      expect(ids).not.toContain('disabled.one');
      expect(ids).not.toContain('nodesc.one');
      expect(result).toHaveLength(3);
    });

    it('返回的 describe 包含 label / type / id', async () => {
      const result = await service.listProviders();
      const email = result.find((r) => r.id === 'email_password');
      expect(email).toEqual(
        expect.objectContaining({ id: 'email_password', label: 'Email', type: 'email_password' }),
      );
    });

    it('使用 CMS 的启用状态和显示文案覆盖已配置 provider', async () => {
      mockPrisma.authProvider.findMany.mockResolvedValue([
        { id: 'email', label: '邮箱登录', icon: 'Mail', isActive: true },
        { id: 'google', label: 'Google Workspace', icon: 'Chrome', isActive: false },
      ]);

      const result = await service.listProviders();

      expect(result.find((item) => item.id === 'email_password')).toEqual(
        expect.objectContaining({ label: '邮箱登录', icon: 'Mail' }),
      );
      expect(result.some((item) => item.id === 'oauth.google')).toBe(false);
    });
  });

  describe('OAuth state flow', () => {
    it('creates a short-lived signed authorization URL', () => {
      mockJwtService.sign.mockReturnValueOnce('signed-state');
      const result = service.createAuthorization('oauth.google');

      expect(result).toEqual({
        providerId: 'oauth.google',
        authorizationUrl:
          'https://accounts.example/authorize?state=signed-state',
        expiresIn: 600,
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'oauth-state',
          providerId: 'oauth.google',
          nonce: expect.any(String),
        }),
        { audience: 'oauth', expiresIn: '10m' },
      );
    });

    it('rejects a callback whose signed state belongs to another provider', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        purpose: 'oauth-state',
        providerId: 'oauth.github',
      });

      await expect(
        service.authenticate('oauth.google', {
          code: 'code',
          state: 'wrong-state',
        }),
      ).rejects.toThrow(/Invalid or expired OAuth state/);
    });

    it('creates a user-bound OAuth link authorization URL', () => {
      mockJwtService.sign.mockReturnValueOnce('signed-link-state');

      expect(service.createLinkAuthorization('user-1', 'oauth.google')).toEqual({
        providerId: 'oauth.google',
        authorizationUrl: 'https://accounts.example/authorize?state=signed-link-state',
        expiresIn: 600,
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'oauth-link-state',
          providerId: 'oauth.google',
          userId: 'user-1',
          nonce: expect.any(String),
        }),
        { audience: 'oauth', expiresIn: '10m' },
      );
    });

    it('links OAuth only when signed state belongs to the authenticated user', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        purpose: 'oauth-link-state',
        providerId: 'oauth.google',
        userId: 'user-1',
      });
      const google = providers.find((provider) => provider.id === 'oauth.google')!;
      const link = jest.spyOn(google, 'link');

      await expect(service.linkIdentity('user-1', 'oauth.google', {
        code: 'oauth-code',
        state: 'signed-link-state',
      })).resolves.toEqual({ linked: true, providerId: 'oauth.google' });
      expect(link).toHaveBeenCalledWith('user-1', {
        code: 'oauth-code',
        state: 'signed-link-state',
      });
    });

    it('rejects OAuth linking state issued for another user', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        purpose: 'oauth-link-state',
        providerId: 'oauth.google',
        userId: 'other-user',
      });

      await expect(service.linkIdentity('user-1', 'oauth.google', {
        code: 'oauth-code',
        state: 'wrong-user-state',
      })).rejects.toThrow(/Invalid or expired OAuth link state/);
    });
  });
});
