/**
 * AuthAdapter 抽象 — spec §9.4
 *
 * 设计目标:
 *   - 前端业务代码不感知底层用 local / oidc / hosted
 *   - 邮箱密码和 OAuth 都通过同一后端适配器完成
 *   - signIn 走 discriminated union 区分 local 表单 / oauth 跳转 / oauth 回调
 *
 * 与 zustand authStore 的关系:
 *   - authStore 管 accessToken 内存 + user 持久化
 *   - Adapter 是业务入口,内部用 api.ts 调后端
 *   - AuthProvider Context 在它们上面再包一层,加 React 状态 + 401 拦截
 */
import type { AuthUser } from '../../stores/authStore';

export type { AuthUser };

/** 第三方登录身份(对应后端 Identity 表) */
export interface Identity {
  id: string;
  provider: string;
  /** provider 视角的用户 id (Google sub / GitHub id / 微信 openid 等) */
  providerUserId?: string;
  /** 第三方账号邮箱(若 provider 返回) */
  email?: string;
  /** 第三方账号展示名 */
  displayName?: string;
  /** ISO 时间字符串 */
  linkedAt: string;
  lastUsedAt?: string;
  /** 简单标记是否主登录 (provider === 'local' 或第一个绑的) */
  isPrimary?: boolean;
}

/** 后端 GET /auth/providers 返回的 provider 描述符 */
export interface ProviderInfo {
  id: string;
  label: string;
  type: 'email_password' | 'oauth';
  iconUrl?: string;
  /** 由后端 AUTH_PROVIDERS 与对应凭据共同决定 */
  enabled: boolean;
}

/** signIn 入参的 discriminated union */
export type SignInInput =
  | { kind: 'local'; email: string; password: string }
  | { kind: 'oauth-redirect'; provider: string };

/** 登录/refresh 成功后返回的会话 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

/**
 * AuthAdapter 抽象接口 — 所有实现必须实现
 *
 * 401 拦截:实现内部不需要处理 401 — 由 api.ts 的 axios interceptor 调
 * `refresh()` 兜底;refresh 失败时,onUnauthorized 回调(由 AuthProvider 注入)
 * 触发 setUser(null) + 跳 login
 */
export interface AuthAdapter {
  /** 登录入口(local 表单 / oauth 跳转) */
  signIn(input: SignInInput): Promise<AuthSession>;

  /** 登出 — revoke refresh + 清 cookie + 清本地 state */
  signOut(): Promise<void>;

  /**
   * 用 httpOnly cookie 里的 refresh token 拿新 access
   * Phase 1 兼做"当前 session 探测" — 200 说明有 session,401 说明没
   * 返回 null 表示未登录
   */
  refresh(): Promise<AuthSession | null>;

  /** 列出后端启用的 provider 列表(给按钮网格用) */
  listProviders(): Promise<ProviderInfo[]>;

  /**
   * 列当前用户的所有 Identity(provider 绑定的)
   * 后端 spec §9.3: GET /auth/identities
   *
   * P1 fix: 接受 user 参数(由 AuthProvider 从 session 传入),不再内部调
   *   refresh()。原因:旧实现 listMyIdentities 自己再 refresh 一次,
   *   跟 AuthProvider boot 的 refresh 重复 → 全局 5/sec 限流被打爆,
   *   hard reload 全部 429。
   *
   * LocalAuthAdapter 直接调用真实后端端点。
   */
  listMyIdentities(user: AuthUser | null): Promise<Identity[]>;

  /** 解绑某个 Identity — 后端 DELETE /auth/identities/:id */
  unbindProvider(identityId: string): Promise<void>;
}
