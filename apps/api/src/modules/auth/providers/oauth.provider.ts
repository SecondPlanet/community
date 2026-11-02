import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthProvider, AuthIdentity, AuthCredentials } from './auth-provider.types';

/**
 * OAuth Provider (Google / GitHub / 通用)
 *
 * 工作流：
 *   1. 前端跳转 provider authorize URL（带 client_id / scope / redirect_uri / state）
 *   2. 用户授权后 provider 回调到 redirect_uri，带 code
 *   3. 前端拿 code 调后端 /auth/oauth/:provider/callback
 *   4. 后端用 code 换 access_token，调 provider /userinfo
 *   5. 拿到标准化 profile，匹配到 UserProviderAccount 或创建新 user
 *
 * 这一层只负责"用 code 换 token + 调 /userinfo + 标准化 identity"
 * 调度（拿 token / 写 DB）交给 AuthService
 *
 * Frank 的硬要求：可插拔。下面代码已经把 google 和 github 的具体差异抽到 config,
 * 同一份代码两个 provider 都能跑。
 */
@Injectable()
export class OAuthProvider extends AuthProvider {
  readonly id: string; // e.g. "oauth.google"
  readonly type = 'oauth' as const;
  readonly enabled: boolean;
  private readonly logger = new Logger(OAuthProvider.name);

  // provider-specific 的 /token 和 /userinfo 端点
  private static readonly ENDPOINTS: Record<string, { token: string; userinfo: string }> = {
    'oauth.google': {
      token: 'https://oauth2.googleapis.com/token',
      userinfo: 'https://www.googleapis.com/oauth2/v3/userinfo',
    },
    'oauth.github': {
      token: 'https://github.com/login/oauth/access_token',
      userinfo: 'https://api.github.com/user',
    },
  };
  private static readonly AUTHORIZE_ENDPOINTS: Record<string, string> = {
    'oauth.google': 'https://accounts.google.com/o/oauth2/v2/auth',
    'oauth.github': 'https://github.com/login/oauth/authorize',
  };

  constructor(
    id: string,
    private readonly config: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      scopes: string[];
    },
    private readonly prisma: PrismaService,
  ) {
    super();
    this.id = id;
    this.enabled = true;
  }

  async verify(credentials: AuthCredentials): Promise<AuthIdentity> {
    const { code } = credentials as { code: string };
    if (!code) {
      throw new UnauthorizedException('Missing OAuth code');
    }

    const endpoints = OAuthProvider.ENDPOINTS[this.id];
    if (!endpoints) {
      throw new UnauthorizedException(`Unsupported OAuth provider: ${this.id}`);
    }

    // 1. code -> access_token
    const tokenRes = await fetch(endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      this.logger.error(`Token exchange failed with HTTP ${tokenRes.status}`);
      throw new UnauthorizedException('OAuth token exchange failed');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException('OAuth did not return access_token');
    }

    // 2. access_token -> userinfo
    const userRes = await fetch(endpoints.userinfo, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });

    if (!userRes.ok) {
      throw new UnauthorizedException('Failed to fetch OAuth user info');
    }

    // 3. 标准化 identity（不同 provider 的 userinfo 字段不同）
    const raw = await userRes.json();
    if (this.id === 'oauth.github') {
      // /user.email may be absent or private; only /user/emails exposes
      // GitHub's verification status. The configured user:email scope is required.
      raw.email = await this.fetchGitHubVerifiedEmail(tokenData.access_token);
    }
    return this.normalize(this.id, raw);
  }

  /**
   * 把不同 provider 的 userinfo 响应标准化成 AuthIdentity
   * - google: { sub, email, name, picture }
   * - github: { id, login, name, email, avatar_url, ... }
   */
  private normalize(providerId: string, raw: any): AuthIdentity {
    if (providerId === 'oauth.google') {
      if (!raw.email || raw.email_verified !== true) {
        throw new UnauthorizedException('Google account has no verified email');
      }
      return {
        providerUserId: String(raw.sub),
        profile: {
          email: raw.email,
          emailVerified: true,
          name: raw.name ?? raw.email.split('@')[0],
          avatarUrl: raw.picture,
          raw,
        },
      };
    }

    if (providerId === 'oauth.github') {
      if (!raw.email) {
        throw new UnauthorizedException('GitHub account has no verified email');
      }
      const email = raw.email;
      return {
        providerUserId: String(raw.id),
        profile: {
          email,
          emailVerified: true,
          name: raw.name ?? raw.login,
          avatarUrl: raw.avatar_url,
          raw,
        },
      };
    }

    throw new UnauthorizedException(`No normalizer for ${providerId}`);
  }

  private async fetchGitHubVerifiedEmail(accessToken: string): Promise<string> {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new UnauthorizedException('Failed to fetch GitHub email addresses');
    }
    const emails = (await response.json()) as Array<{
      email?: string;
      verified?: boolean;
      primary?: boolean;
    }>;
    const email = emails.find((entry) => entry.primary && entry.verified)?.email
      ?? emails.find((entry) => entry.verified)?.email;
    if (!email) {
      throw new UnauthorizedException('GitHub account has no verified email');
    }
    return email;
  }

  /**
   * link OAuth 到现有 user
   * 不需要新 token,直接拿现有的 userId 写 UserProviderAccount
   */
  async link(userId: string, credentials: AuthCredentials): Promise<void> {
    const identity = await this.verify(credentials);
    const existing = await this.prisma.userProviderAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: this.id,
          providerUserId: identity.providerUserId,
        },
      },
    });
    if (existing && existing.userId !== userId) {
      throw new UnauthorizedException('This OAuth account is already linked to another user');
    }
    const accountData = {
      email: identity.profile.email,
      displayName: identity.profile.name,
      profile: identity.profile.raw as any,
      deletedAt: null,
      lastUsedAt: new Date(),
    };
    if (existing) {
      await this.prisma.userProviderAccount.update({
        where: { id: existing.id },
        data: {
          ...accountData,
          linkedAt: existing.deletedAt ? new Date() : existing.linkedAt,
        },
      });
    } else {
      await this.prisma.userProviderAccount.create({
        data: {
          userId,
          provider: this.id,
          providerUserId: identity.providerUserId,
          ...accountData,
        },
      });
    }
  }

  describe() {
    const label = this.id === 'oauth.google' ? 'Google' : this.id === 'oauth.github' ? 'GitHub' : this.id;
    return { id: this.id, label, type: this.type };
  }

  createAuthorizationUrl(state: string): string {
    const endpoint = OAuthProvider.AUTHORIZE_ENDPOINTS[this.id];
    if (!endpoint) {
      throw new UnauthorizedException(`Unsupported OAuth provider: ${this.id}`);
    }
    const url = new URL(endpoint);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.config.scopes.join(' '));
    url.searchParams.set('state', state);
    if (this.id === 'oauth.google') {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'select_account');
    }
    return url.toString();
  }
}
