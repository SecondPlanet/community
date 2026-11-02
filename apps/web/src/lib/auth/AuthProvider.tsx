/**
 * AuthProvider — spec §9.4 React 上下文实现
 *
 * Context 暴露:
 *   { user, identities, providers, signIn, signOut, bindProvider, unbindProvider, isAuthenticating }
 *
 * 启动流程:
 *   1. 用 adapter.refresh() 探活 (httpOnly cookie 决定是否有 session)
 *      - 200 → 拿到 user + accessToken,setAuth
 *      - 401 → user = null (未登录)
 *   2. 并行 GET /auth/providers 拉按钮网格数据
 *   3. 完成后 isAuthenticating = false
 *
 * 401 拦截:
 *   - api.ts 的 axios response interceptor 已经处理 401 → refresh
 *   - 这里用 onUnauthorized 回调接 refresh 失败通知 → setUser(null) + 跳 /auth/login
 *
 * LocalAuthAdapter 同时负责邮箱密码和后端配置驱动的 OAuth 跳转。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
// 注意:AuthProvider 自身放在 BrowserRouter 外层(顺序 QueryClient → AuthProvider → Router),
//      所以这里**不能**调 useLocation / useNavigate(否则会 throw "useLocation() may be used only in the context of a <Router>")。
//      AuthGuard 是单独组件,只在路由元素里用,所以可以在它里面用 useLocation。
//      AuthProvider 自身只用 store / api,跟 router 无关。
import { LocalAuthAdapter } from './LocalAuthAdapter';
import api, { getAccessToken, setAccessToken } from '../api';
import { useAuthStore } from '../../stores/authStore';
import type {
  AuthAdapter,
  AuthSession,
  AuthUser,
  Identity,
  ProviderInfo,
  SignInInput,
} from './types';
import { clearOAuthLink, markOAuthLink } from './oauthCallback';
import { AuthContext, useAuth, type AuthContextValue } from './AuthContext';

function createAdapter(): AuthAdapter {
  return new LocalAuthAdapter();
}

type AuthBootResult = {
  session: AuthSession | null;
  providers: ProviderInfo[];
};

// React StrictMode 在开发环境会执行 effect 的 setup → cleanup → setup。
// 共享进行中的启动请求，避免同一页面加载重复访问 providers/users/me/refresh，
// 从而触发限流或 refresh-token 轮换竞态。请求结束后清空，不缓存会话结果。
let authBootPromise: Promise<AuthBootResult> | null = null;

function bootAuth(adapter: AuthAdapter): Promise<AuthBootResult> {
  if (authBootPromise) return authBootPromise;

  authBootPromise = (async () => {
    // provider 列表只影响 OAuth 按钮展示，不是会话成立的前提。
    // 限流或短暂网络失败时降级为空列表，不能清除已经验证成功的用户。
    const providerPromise = adapter.listProviders().catch(() => [] as ProviderInfo[]);
    let session: AuthSession | null = null;

    if (getAccessToken()) {
      try {
        const { data: restoredUser } = await api.get<AuthUser>('/api/v1/users/me');
        const restoredToken = getAccessToken();
        if (restoredToken) {
          session = { user: restoredUser, accessToken: restoredToken };
        }
      } catch {
        // access token 已失效时，axios interceptor 会先尝试 refresh；若仍失败，
        // 再由下面的 adapter.refresh() 做一次明确的会话探活。
      }
    }

    if (!session) {
      session = await adapter.refresh();
    }

    return { session, providers: await providerPromise };
  })().finally(() => {
    authBootPromise = null;
  });

  return authBootPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [identities, setIdentities] = useState<Identity[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  const adapterRef = useRef<AuthAdapter>(createAdapter());
  const adapter = adapterRef.current;

  /**
   * 启动:探活 + 拉 providers + 拉 identities
   *
   * 优先用 sessionStorage 中仍有效的 access token 恢复 user，只有 token
   * 不存在或失效时才轮换 refresh cookie。这样 hard reload 不会因为 refresh
   * cookie 被浏览器策略拦截或并发轮换而误登出。
   *
   * P1 fix: 顺序
   *   1) refresh() 一次 (Promise.all + listProviders 并发,不重复 refresh)
   *   2) 如果 session 拿到 → setAuth(user, token) 写到 store
   *   3) listMyIdentities 复用已拿到的 user,不再内部 refresh (旧实现每次 list 又
   *      refresh 一次 → 5/sec 全局限流被打爆 → 后续 hard reload 全部 429)
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { session, providers: providerList } = await bootAuth(adapter);
        if (cancelled) return;
        let activeUser: AuthUser | null = null;
        if (session) {
          setAuth(session.user, session.accessToken);
          activeUser = session.user;
        } else {
          // refresh 失败 (401 = 未登录) — 但如果 store 已经有 user (上次登录遗留),
          // 保留 user, 仅清 identities (避免每次 mount 把已登录用户踢出)
          // 这样 ProtectedRoute 不会误判, Layout 头像也不会消失
          // 真正的 logout 由 clearAuth() 主动调 (退出按钮)
          if (!useAuthStore.getState().user) {
            clearAuth();
          }
          activeUser = useAuthStore.getState().user;
        }
        // Identity 列表是增强信息，不能因该端点短暂失败而清除已建立的登录会话。
        try {
          const idents = await adapter.listMyIdentities(activeUser);
          if (!cancelled) setIdentities(idents);
        } catch (identityError) {
          if (!cancelled) setIdentities([]);
          // eslint-disable-next-line no-console
          console.warn('[AuthProvider] identities load failed:', identityError);
        }
        setProviders(providerList);
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn('[AuthProvider] boot failed:', err);
        clearAuth();
        setIdentities([]);
      } finally {
        if (!cancelled) setIsAuthenticating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅 mount 时跑一次 — adapter / store 在整个 provider 生命周期稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** signIn 入口 */
  const signIn = useCallback(
    async (input: SignInInput) => {
      const session = await adapter.signIn(input);
      setAuth(session.user, session.accessToken);
      // 登录后立即拉 identities(传入 user,不再内部 refresh)
      try {
        const idents = await adapter.listMyIdentities(session.user);
        setIdentities(idents);
      } catch {
        /* ignore */
      }
      return session;
    },
    [adapter, setAuth],
  );

  /**
   * signOut — revoke refresh + 清本地 state
   *
   * 不直接 navigate — 组件代码可以自己做 SPA 跳转(window.location 也行)
   * 留出灵活度:Layout 的"退出登录"按钮可能要留在原页,而 LoginPage 完成后
   * 调 signOut 再 navigate('/')
   */
  const signOut = useCallback(async () => {
    await adapter.signOut();
    setAccessToken(null);
    clearAuth();
    setIdentities([]);
  }, [adapter, clearAuth]);

  /**
   * bindProvider — starts the configured OAuth authorization flow.
   */
  const bindProvider = useCallback(
    async (provider: string) => {
      const p = providers.find((x) => x.id === provider);
      if (!p?.enabled) {
        throw new Error(
          `Provider "${provider}" 未启用`,
        );
      }
      const { data } = await api.get<{ authorizationUrl: string }>(
        `/api/v1/auth/${encodeURIComponent(provider)}/link/start`,
      );
      markOAuthLink(provider);
      try {
        window.location.assign(data.authorizationUrl);
      } catch (error) {
        clearOAuthLink();
        throw error;
      }
    },
    [providers],
  );

  /** unbindProvider */
  const unbindProvider = useCallback(
    async (identityId: string) => {
      await adapter.unbindProvider(identityId);
      setIdentities((prev) => prev.filter((i) => i.id !== identityId));
    },
    [adapter],
  );

  // 401 拦截由 api.ts 的 response interceptor 兜底(refresh + 跳 login)
  // AuthProvider 这里不重复实现,避免双跳

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      identities,
      providers,
      signIn,
      signOut,
      updateUser,
      bindProvider,
      unbindProvider,
      isAuthenticating,
    }),
    [
      user,
      identities,
      providers,
      signIn,
      signOut,
      updateUser,
      bindProvider,
      unbindProvider,
      isAuthenticating,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * AuthGuard — 路由级守卫
 *
 * 用法:
 *   <Route element={<AuthGuard><SettingsLayout /></AuthGuard>} />
 *
 * 行为:
 *   - isAuthenticating: 显示 Skeleton,不闪跳 login
 *   - !user: 跳 /auth/login?from=<current>
 *   - requireAdmin && role !== admin: 跳 /
 */
export function AuthGuard({
  children,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, isAuthenticating } = useAuth();
  const location = useLocation();

  if (isAuthenticating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="w-full max-w-md p-6 space-y-3">
          <div className="h-6 w-32 rounded-md bg-neutral-200 dark:bg-neutral-200 animate-pulse" />
          <div className="h-4 w-full rounded-md bg-neutral-200 dark:bg-neutral-200 animate-pulse" />
          <div className="h-4 w-3/4 rounded-md bg-neutral-200 dark:bg-neutral-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    const from = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/auth/login?from=${from}`} replace />;
  }

  if (
    user.passwordResetRequired &&
    location.pathname !== '/dashboard/settings/bindings'
  ) {
    return <Navigate to="/dashboard/settings/bindings?change-password=required" replace />;
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
