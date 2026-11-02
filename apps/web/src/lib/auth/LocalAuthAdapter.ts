/**
 * LocalAuthAdapter — Phase 1 默认实现
 *
 * 行为:
 *   - signIn({kind:'local'})  → POST /api/v1/auth/login
 *   - signIn({kind:'oauth-redirect'})  → window.location = /api/v1/auth/<p>/authorize
 *   - refresh                  → POST /api/v1/auth/refresh (cookie 自动带)
 *   - listProviders            → GET /api/v1/auth/providers
 *   - listMyIdentities         → GET /api/v1/auth/identities
 *   - unbindProvider           → DELETE /api/v1/auth/identities/:id
 *
 * 与 api.ts 的关系:
 *   - 所有请求走同一个 axios instance (withCredentials: true,401 自动 refresh)
 *   - 401 由 api.ts 的 response interceptor 处理,这里不重复实现
 */
import { api, refreshSession } from '../api';
import type {
  AuthAdapter,
  AuthSession,
  AuthUser,
  Identity,
  ProviderInfo,
  SignInInput,
} from './types';

/** 后端 /auth/login 响应 */
interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'student' | 'instructor';
    passwordResetRequired?: boolean;
  };
}

/** 后端 /auth/providers 响应 */
interface ProvidersResponse {
  providers: Array<{
    id: string;
    label: string;
    type: 'email_password' | 'oauth';
    iconUrl?: string;
    enabled: boolean;
  }>;
}

export class LocalAuthAdapter implements AuthAdapter {
  async signIn(input: SignInInput): Promise<AuthSession> {
    if (input.kind === 'local') {
      const { data } = await api.post<LoginResponse>('/api/v1/auth/login', {
        email: input.email,
        password: input.password,
      });
      return {
        user: data.user,
        accessToken: data.accessToken,
      };
    }

    if (input.kind === 'oauth-redirect') {
      const { data } = await api.get<{ authorizationUrl: string }>(
        `/api/v1/auth/${encodeURIComponent(input.provider)}/start`,
      );
      window.location.assign(data.authorizationUrl);
      // Navigation normally interrupts this promise; keep a typed fallback for
      // test environments where location.assign is mocked.
      throw new Error('Redirecting to OAuth provider…');
    }

    // exhaustiveness check
    const _exhaustive: never = input;
    throw new Error(`Unknown signIn input: ${JSON.stringify(_exhaustive)}`);
  }

  async signOut(): Promise<void> {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // 静默 — 即使后端失败也要清本地 state
    }
  }

  async refresh(): Promise<AuthSession | null> {
    // 走全站共享的 in-flight 刷新（见 refreshSession 注释）：boot 期间页面上的
    // 查询可能同时收到 401，必须与 401 拦截器共用同一次 POST /auth/refresh。
    const data = await refreshSession();
    if (!data?.accessToken || !data.user) return null;
    return {
      user: data.user as AuthUser,
      accessToken: data.accessToken,
    };
  }

  async listProviders(): Promise<ProviderInfo[]> {
    try {
      const { data } = await api.get<ProvidersResponse>(
        '/api/v1/auth/providers',
      );
      const backend = (data?.providers ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        type: p.type,
        iconUrl: p.iconUrl,
        enabled: p.enabled,
      }));
      return backend;
    } catch {
      // 能力探测失败时隐藏第三方入口，邮箱密码登录仍可独立使用。
      return [];
    }
  }

  /**
   * 列当前用户的 Identity 列表
   *
   * P1 fix: 不再内部调 this.refresh(),改由调用方(AuthProvider)传入 user
   *   - 旧逻辑: AuthProvider mount 时调 refresh + listMyIdentities 内部再调 refresh,
   *     → 同一 page load 触发 2-3 次 /auth/refresh,5/sec 全局限流被快速打爆,
   *     后续 hard reload 全部 429。
   *   - 新逻辑: refresh 只调一次(listProviders 之前 Promise.all),listMyIdentities
   *     复用已拿到的 user。
   *
   * 后端端点已实装，直接返回真实 identity。
   */
  async listMyIdentities(user: { id: string; email: string; name: string } | null): Promise<Identity[]> {
    if (!user) return [];
    const { data } = await api.get<Identity[]>('/api/v1/auth/identities');
    return data;
  }

  /**
   * 解绑 Identity
   *
   * 本地主登录由后端拒绝解绑；第三方 identity 可正常解绑。
   */
  async unbindProvider(identityId: string): Promise<void> {
    await api.delete(`/api/v1/auth/identities/${encodeURIComponent(identityId)}`);
  }
}
