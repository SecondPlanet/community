import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, TriangleAlert } from 'lucide-react';
import { AuthShell } from '../../components/auth/AuthShell';
import { api } from '../../lib/api';
import {
  consumeOAuthLink,
  isOAuthLinkState,
  providerFromOAuthState,
} from '../../lib/auth/oauthCallback';
import { useAuthStore, type AuthUser } from '../../stores/authStore';

interface OAuthCallbackResponse {
  accessToken: string;
  user: AuthUser;
}

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useAuthStore((state) => state.user);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const providerError = params.get('error_description') || params.get('error');
    const code = params.get('code');
    const state = params.get('state');
    const provider = state ? providerFromOAuthState(state) : null;
    const markedAsLink = provider ? consumeOAuthLink(provider) : false;
    const isLinkCallback = Boolean(
      provider && state && (markedAsLink || isOAuthLinkState(state, provider)),
    );

    if (providerError) {
      setError(`第三方授权未完成：${providerError}`);
      return;
    }
    if (!code || !state || !provider) {
      setError('OAuth 回调参数无效或已过期，请重新登录');
      return;
    }

    const endpoint = isLinkCallback
      ? `/api/v1/auth/${encodeURIComponent(provider)}/link/callback`
      : `/api/v1/auth/${encodeURIComponent(provider)}/callback`;

    void api
      .post<OAuthCallbackResponse | { linked: true; providerId: string }>(endpoint, { code, state })
      .then(({ data }) => {
        if (isLinkCallback) {
          navigate('/dashboard/settings/bindings?linked=success', { replace: true });
          return;
        }
        const loginData = data as OAuthCallbackResponse;
        useAuthStore.getState().setAuth(loginData.user, loginData.accessToken);
        const target = loginData.user.passwordResetRequired
          ? '/dashboard/settings/bindings?change-password=required'
          : loginData.user.role === 'admin' ? '/admin' : '/';
        navigate(target, { replace: true });
      })
      .catch((err: unknown) => {
        const message = (err as { response?: { data?: { message?: string } } })
          ?.response?.data?.message;
        setError(message || (isLinkCallback ? '第三方账号绑定失败，请返回设置页重试' : '第三方登录失败，请返回登录页重试'));
      });
  }, [navigate, params]);

  return (
    <AuthShell>
      <div className="py-8 text-center">
        {error ? (
          <>
            <TriangleAlert className="mx-auto h-10 w-10 text-danger-500" />
            <h1 className="mt-4 text-xl font-bold">第三方登录失败</h1>
            <p className="mt-2 text-sm text-neutral-600">{error}</p>
            <Link
              to={currentUser ? '/dashboard/settings/bindings' : '/auth/login'}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[#171717] px-5 py-2.5 text-sm font-semibold text-white"
            >
              返回
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin" />
            <h1 className="mt-4 text-xl font-bold">正在完成第三方授权</h1>
            <p className="mt-2 text-sm text-neutral-600">请稍候，不要关闭此页面</p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
