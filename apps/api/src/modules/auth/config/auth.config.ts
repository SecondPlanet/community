/**
 * Auth 抽象层 - 配置驱动
 *
 * Frank 的硬要求：providers 列表来自 config / env，不 hardcode 在代码里
 *
 * env 约定（已写好 .env.example 提示，运行时缺关键配置会 fail-fast）：
 *   AUTH_PROVIDERS=email_password                    # 逗号分隔，要启用的 provider id
 *   AUTH_OAUTH_GOOGLE_CLIENT_ID=...                  # provider 各自的具体配置
 *   AUTH_OAUTH_GOOGLE_CLIENT_SECRET=...
 *   AUTH_OAUTH_GITHUB_CLIENT_ID=...
 *   AUTH_OAUTH_GITHUB_CLIENT_SECRET=...
 *
 * 新增 provider 的步骤（验证"可插拔"）：
 *   1. 写一个 implements AuthProvider 的类
 *   2. 在下面 PROVIDER_FACTORIES 加一行
 *   3. 在 .env 启用，完事
 */

export interface AuthConfig {
  /** 当前启用的 provider id 列表（来自 AUTH_PROVIDERS env） */
  enabledProviders: string[];
  /** 具体的 provider 配置，按 provider id 索引 */
  providers: Record<string, Record<string, unknown>>;
}

/** Provider 工厂：provider id -> 读取该 provider 配置的方式 */
type ProviderConfigLoader = () => Record<string, unknown> | null;

const PROVIDER_FACTORIES: Record<string, ProviderConfigLoader> = {
  email_password: () => {
    // email_password 永远 enable,只读 bcrypt cost 用于将来动态调整
    return {
      bcryptRounds: parseInt(process.env.AUTH_BCRYPT_ROUNDS ?? '12', 10),
    };
  },

  'oauth.google': () => {
    const clientId = process.env.AUTH_OAUTH_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.AUTH_OAUTH_GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.AUTH_OAUTH_GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return null;
    return {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ['openid', 'email', 'profile'],
    };
  },

  'oauth.github': () => {
    const clientId = process.env.AUTH_OAUTH_GITHUB_CLIENT_ID;
    const clientSecret = process.env.AUTH_OAUTH_GITHUB_CLIENT_SECRET;
    const redirectUri = process.env.AUTH_OAUTH_GITHUB_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return null;
    return {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ['read:user', 'user:email'],
    };
  },
};

/** 解析 env,返回 auth config;启动期 fail-fast */
export function loadAuthConfig(): AuthConfig {
  const enabled = (process.env.AUTH_PROVIDERS ?? 'email_password')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const providers: Record<string, Record<string, unknown>> = {};
  const missing: string[] = [];

  for (const providerId of enabled) {
    const loader = PROVIDER_FACTORIES[providerId];
    if (!loader) {
      throw new Error(
        `[auth.config] Unknown provider id "${providerId}". ` +
          `Add it to PROVIDER_FACTORIES in auth.config.ts first.`,
      );
    }
    const cfg = loader();
    if (cfg === null) {
      missing.push(providerId);
      continue;
    }
    providers[providerId] = cfg;
  }

  if (missing.length > 0) {
    throw new Error(
      `[auth.config] Providers enabled but missing required env config: ${missing.join(', ')}. ` +
        `Check the env vars listed in auth.config.ts.`,
    );
  }

  return { enabledProviders: enabled, providers };
}

/** provider id 是否启用（运行期检查用） */
export function isProviderEnabled(config: AuthConfig, providerId: string): boolean {
  return config.enabledProviders.includes(providerId);
}
