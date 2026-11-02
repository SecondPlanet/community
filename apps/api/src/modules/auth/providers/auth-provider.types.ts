/**
 * Auth 抽象层 - 公共类型定义
 *
 * 设计原则（来自 Frank 的硬要求）：
 * - 可插拔：AuthProvider 是 abstract class,新 provider 只要 implement 这 3 个方法就能挂上
 * - 配置驱动：providers 列表来自 auth.config.ts,不是 hardcode
 * - 多 provider：一个 user 可以绑定多个 provider 账号（见 UserProviderAccount model）
 * - 不重复造轮子：现有 EmailPasswordProvider 的安全实现（bcrypt 12 / CSPRNG / SHA-256 hash）
 *   原封不动搬到 provider 里，AuthService 只负责调度
 */

/** Provider 类型枚举（用 string union 而不是 enum，Prisma 友好） */
export type AuthProviderType = 'email_password' | 'oauth';

/** Provider 唯一标识（同一个 type 下可以有多个实例，例如 oauth.google / oauth.github） */
export type AuthProviderId = string; // e.g. "email_password", "oauth.google"

/**
 * Provider verify 后的标准化身份
 * - 来自 email_password: { providerUserId: email, profile: { email, name } }
 * - 来自 oauth:          { providerUserId: oauth.sub, profile: { email, name, avatarUrl } }
 */
export interface AuthIdentity {
  /** 该 provider 内部的 user id（不是我们 User 表的 id） */
  providerUserId: string;
  /** 标准化的 profile，map 到我们 User 表的字段 */
  profile: {
    email: string;
    /** Whether the identity provider has verified ownership of this email. */
    emailVerified?: boolean;
    name: string;
    avatarUrl?: string;
    /** 原始 claims,留作 audit / 后续扩展 */
    raw?: Record<string, unknown>;
  };
}

/** Provider 处理结果 */
export type AuthResult =
  | { kind: 'authenticated'; userId: string; identity: AuthIdentity; isNewUser: boolean }
  | { kind: 'failed'; reason: string };

/**
 * Provider 凭据
 * - email_password: { email, password }
 * - oauth:          { code, state?, redirectUri }（前端拿 code 调后端）
 */
export type AuthCredentials = Record<string, unknown>;

/** 抽象的 AuthProvider */
export abstract class AuthProvider {
  abstract readonly id: AuthProviderId;
  abstract readonly type: AuthProviderType;
  /** provider 是否启用（来自 config） */
  abstract readonly enabled: boolean;

  /**
   * 验证凭据 + 拿到标准化身份
   * 失败的语义：throw UnauthorizedException / ConflictException
   * 成功返回 AuthIdentity（不直接返回 userId,留给 AuthService 做 upsert）
   */
  abstract verify(credentials: AuthCredentials): Promise<AuthIdentity>;

  /**
   * 把 provider 身份 link 到现有 user
   * 用于"用 google 登录后，再绑 email/password"的场景
   */
  abstract link(userId: string, credentials: AuthCredentials): Promise<void>;

  /**
   * 可选：列出登录入口的元信息（前端渲染"用 Google 登录"按钮时用）
   * 不实现的 provider 不暴露给前端
   */
  describe?(): { id: AuthProviderId; label: string; iconUrl?: string; type: AuthProviderType };

  /** OAuth providers can expose a browser authorization URL. */
  createAuthorizationUrl?(state: string): string;
}
