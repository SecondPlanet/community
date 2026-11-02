import {
  BadRequestException,
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './auth.dto';
import { AuthProvider, AuthCredentials } from './providers/auth-provider.types';

/**
 * AuthService - 重构后
 *
 * 之前（126 行）: register / login / refresh 全部 hardcode email+password
 * 现在：调度层 + 业务层分离
 *   - verify 逻辑委托给 AuthProvider（email_password / oauth.google / oauth.github ...）
 *   - 这里只负责：
 *     1. 拿 provider identity 后 upsert User + UserProviderAccount
 *     2. 签发 / 轮换 access + refresh token
 *     3. 验证 refresh token
 *
 * 保留的安全逻辑（不重写，来自 commit b05bad7）：
 *   - SHA-256 哈希 refresh token（不存原文）
 *   - CSPRNG randomBytes(32) 生成 refresh token
 *   - refresh token rotation（删旧发新）
 */
export const AUTH_PROVIDERS = 'AUTH_PROVIDERS';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly providers: Map<string, AuthProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(AUTH_PROVIDERS) providers: AuthProvider[],
  ) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
  }

  /**
   * 通用登录入口：根据 provider id 调度
   * 之前的 register/login 端点会传 providerId="email_password" + mode
   * 新的 oauth 端点会传 providerId="oauth.google" + code
   */
  async authenticate(providerId: string, credentials: AuthCredentials) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new UnauthorizedException(`Unknown provider: ${providerId}`);
    }
    if (!provider.enabled) {
      throw new UnauthorizedException(`Provider ${providerId} is not enabled`);
    }
    if (!(await this.isCmsProviderActive(providerId))) {
      throw new UnauthorizedException(`Provider ${providerId} is not enabled`);
    }
    if (provider.type === 'oauth') {
      this.verifyOAuthState(providerId, credentials.state);
    }

    // 1. 让 provider 验证凭据 → 标准化 identity
    const identity = await provider.verify(credentials);

    // 2. upsert user + provider account
    const { user } = await this.upsertUser(provider.id, identity);

    // 3. 记录 last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 4. 签发 tokens
    return this.generateTokens(user);
  }

  /**
   * 把 provider identity 映射到 user
   * 规则：
   *   - 先查 UserProviderAccount（provider + providerUserId 唯一索引）
   *   - 命中 → 返回 user
   *   - 不命中 → 用 identity.profile.email 查 user,合并 provider account
   *   - 还不命中 → 创建 user + provider account
   */
  private async upsertUser(providerId: string, identity: Awaited<ReturnType<AuthProvider['verify']>>) {
    // 先看 provider account 是不是已经绑过
    const existingAccount = await this.prisma.userProviderAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: providerId,
          providerUserId: identity.providerUserId,
        },
      },
      include: { user: true },
    });

    if (existingAccount?.deletedAt || existingAccount?.user.deletedAt) {
      // The compound unique key remains reserved after unlinking. Do not
      // silently revive an identity that the user explicitly removed.
      throw new UnauthorizedException('Identity is not available');
    }

    if (existingAccount) {
      return { user: existingAccount.user, isNewUser: false };
    }

    // 找一下有没有同 email 的 user（可能先用 email/password 注册过,现在用 google 登录）
    const existingUser = await this.prisma.user.findUnique({
      where: { email: identity.profile.email },
    });

    if (existingUser) {
      if (existingUser.deletedAt) {
        throw new UnauthorizedException('Account is disabled');
      }
      // Linking a third-party identity to an existing account solely by email
      // is safe only when that provider attests that the email is verified.
      if (providerId !== 'email_password' && !identity.profile.emailVerified) {
        throw new UnauthorizedException('OAuth email is not verified');
      }
      await this.prisma.userProviderAccount.create({
        data: {
          userId: existingUser.id,
          provider: providerId,
          providerUserId: identity.providerUserId,
          profile: (identity.profile.raw as any) ?? undefined,
        },
      });
      this.logger.log(
        `Linked new provider "${providerId}" to existing user ${existingUser.id} (${existingUser.email})`,
      );
      return { user: existingUser, isNewUser: false };
    }

    // 完全新用户
    const newUser = await this.prisma.user.create({
      data: {
        email: identity.profile.email,
        name: identity.profile.name,
        avatarUrl: identity.profile.avatarUrl,
        // OAuth/SSO 用户没有本地密码，不应被临时密码修改流程锁住。
        // 后续如需本地密码，可通过显式绑定 email_password provider 添加。
        passwordHash: '',
        passwordResetRequired: false,
      },
    });
    await this.prisma.userProviderAccount.create({
      data: {
        userId: newUser.id,
        provider: providerId,
        providerUserId: identity.providerUserId,
        profile: (identity.profile.raw as any) ?? undefined,
      },
    });
    this.logger.log(`Created new user ${newUser.id} from provider "${providerId}"`);
    return { user: newUser, isNewUser: true };
  }

  async refresh(token: string) {
    if (!token) {
      throw new UnauthorizedException('No refresh token');
    }

    // Security: 只存 hash,验证时先 hash 再查
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: this.hashToken(token) },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date() || stored.user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotation 必须原子消费旧 token。并发 refresh 中只能有一个请求成功，
    // 避免两个请求都先 findUnique 后各自签出新 token。
    const consumed = await this.prisma.refreshToken.deleteMany({
      where: {
        token: this.hashToken(token),
        expiresAt: { gte: new Date() },
      },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.generateTokens(stored.user);
  }

  /** 旧 login 端点兼容：直接走 email_password provider */
  async login(dto: LoginDto) {
    return this.authenticate('email_password', { ...dto, mode: 'login' });
  }

  /** 旧 register 端点兼容 */
  async register(dto: { email: string; password: string; name: string }) {
    const result = await this.authenticate('email_password', { ...dto, mode: 'register' });
    // 注册端点契约不返回 token（前端随后自动登录），因此撤销 authenticate
    // 内部创建的 refresh token，避免数据库积累客户端永远拿不到的有效 token。
    await this.prisma.refreshToken.deleteMany({
      where: { token: this.hashToken(result.refreshToken) },
    });
    return { user: result.user };
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;
    await this.prisma.refreshToken.deleteMany({
      where: { token: this.hashToken(token) },
    });
  }

  /** 列出可用的登录 provider（前端 LoginPage 渲染按钮用） */
  async listProviders() {
    const providers = await this.getCmsProviderRows();
    return Array.from(this.providers.values())
      .filter((p) =>
        p.enabled &&
        p.describe &&
        this.isCmsRowActive(p.id, providers) &&
        // The current browser flow can start email/password and OAuth only.
        (p.type === 'email_password' ||
          (p.type === 'oauth' && typeof p.createAuthorizationUrl === 'function')),
      )
      .map((p) => {
        const description = p.describe!();
        const row = providers.get(this.cmsProviderId(p.id));
        return {
          ...description,
          ...(row?.label ? { label: row.label } : {}),
          ...(row?.icon ? { icon: row.icon } : {}),
          enabled: p.enabled,
        };
      });
  }

  private cmsProviderId(providerId: string): string {
    if (providerId === 'email_password') return 'email';
    if (providerId.startsWith('oauth.')) return providerId.slice('oauth.'.length);
    return providerId;
  }

  private async getCmsProviderRows(): Promise<Map<string, { label?: string; icon?: string; isActive: boolean }>> {
    const model = (this.prisma as any).authProvider;
    if (!model?.findMany) return new Map();
    const rows = await model.findMany({
      select: { id: true, label: true, icon: true, isActive: true },
    });
    return new Map(rows.map((row: any) => [row.id, row]));
  }

  private isCmsRowActive(
    providerId: string,
    rows: Map<string, { label?: string; icon?: string; isActive: boolean }>,
  ): boolean {
    const row = rows.get(this.cmsProviderId(providerId));
    // Missing CMS metadata must not take down a configured login method.
    return row?.isActive ?? true;
  }

  private async isCmsProviderActive(providerId: string): Promise<boolean> {
    const rows = await this.getCmsProviderRows();
    return this.isCmsRowActive(providerId, rows);
  }

  async listIdentities(userId: string) {
    const accounts = await this.prisma.userProviderAccount.findMany({
      where: { userId, deletedAt: null },
      orderBy: { linkedAt: 'asc' },
    });
    return accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      providerUserId: account.providerUserId,
      email: account.email ?? undefined,
      displayName: account.displayName ?? undefined,
      linkedAt: account.linkedAt.toISOString(),
      lastUsedAt: account.lastUsedAt.toISOString(),
      isPrimary: account.isPrimary || account.provider === 'email_password',
    }));
  }

  async unlinkIdentity(userId: string, identityId: string) {
    const account = await this.prisma.userProviderAccount.findFirst({
      where: { id: identityId, userId, deletedAt: null },
    });
    if (!account) throw new UnauthorizedException('Identity not found');
    if (account.provider === 'email_password' || account.isPrimary) {
      throw new BadRequestException('Primary login identity cannot be removed');
    }
    await this.prisma.userProviderAccount.update({
      where: { id: identityId },
      data: { deletedAt: new Date() },
    });
  }

  createAuthorization(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider?.enabled || !provider.createAuthorizationUrl) {
      throw new BadRequestException('OAuth provider is not available');
    }
    const state = this.jwtService.sign(
      {
        purpose: 'oauth-state',
        providerId,
        nonce: randomBytes(16).toString('hex'),
      },
      { audience: 'oauth', expiresIn: '10m' },
    );
    return {
      providerId,
      authorizationUrl: provider.createAuthorizationUrl(state),
      expiresIn: 600,
    };
  }

  createLinkAuthorization(userId: string, providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider?.enabled || provider.type !== 'oauth' || !provider.createAuthorizationUrl) {
      throw new BadRequestException('OAuth provider is not available');
    }
    const state = this.jwtService.sign(
      {
        purpose: 'oauth-link-state',
        providerId,
        userId,
        nonce: randomBytes(16).toString('hex'),
      },
      { audience: 'oauth', expiresIn: '10m' },
    );
    return {
      providerId,
      authorizationUrl: provider.createAuthorizationUrl(state),
      expiresIn: 600,
    };
  }

  async linkIdentity(userId: string, providerId: string, credentials: AuthCredentials) {
    const provider = this.providers.get(providerId);
    if (!provider?.enabled || provider.type !== 'oauth') {
      throw new BadRequestException('OAuth provider is not available');
    }
    this.verifyOAuthLinkState(userId, providerId, credentials.state);
    await provider.link(userId, credentials);
    return { linked: true, providerId };
  }

  private verifyOAuthState(providerId: string, state: unknown) {
    if (typeof state !== 'string' || !state) {
      throw new UnauthorizedException('Missing OAuth state');
    }
    try {
      const payload = this.jwtService.verify<{
        purpose?: string;
        providerId?: string;
      }>(state, { audience: 'oauth' });
      if (
        payload.purpose !== 'oauth-state' ||
        payload.providerId !== providerId
      ) {
        throw new Error('state mismatch');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
  }

  private verifyOAuthLinkState(userId: string, providerId: string, state: unknown) {
    if (typeof state !== 'string' || !state) {
      throw new UnauthorizedException('Missing OAuth state');
    }
    try {
      const payload = this.jwtService.verify<{
        purpose?: string;
        providerId?: string;
        userId?: string;
      }>(state, { audience: 'oauth' });
      if (
        payload.purpose !== 'oauth-link-state' ||
        payload.providerId !== providerId ||
        payload.userId !== userId
      ) {
        throw new Error('state mismatch');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth link state');
    }
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    passwordResetRequired?: boolean;
  }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = randomBytes(32).toString('hex');

    const refreshExpires = new Date();
    refreshExpires.setDate(refreshExpires.getDate() + 7);

    // Security: 只存 hash
    // Bug fix: 之前没 await, 导致 refresh token 可能还没入库就被 verify,
    // 表现为 "Invalid refresh token" 401. 这里 await 保证 db 写入完成.
    await this.prisma.refreshToken.create({
      data: {
        token: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: refreshExpires,
      },
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordResetRequired: Boolean(user.passwordResetRequired),
      },
    };
  }

  // Security: 只存 hash
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
