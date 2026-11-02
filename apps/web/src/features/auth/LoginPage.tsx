/**
 * LoginPage — 登录页(P0-2)
 *
 * 设计参考 review/mocks/mock-auth.html
 *   - 双 tab(登录 / 注册),URL 路由:/auth/login 和 /auth/register 各自独立
 *   - 第三方按钮由后端 provider 能力动态启用
 *   - 邮箱 + 密码
 *   - "继续即同意服务条款" footer
 *   - 错误:行内 error + 顶部 toast
 *   - react-hook-form + zod 校验
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '../../lib/zodResolver';
import { Seo } from '../../components/Seo';
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ProviderButtons } from '../../components/auth/ProviderButtons';
import { AuthShell, AuthTabSwitcher } from '../../components/auth/AuthShell';
import { useToast } from '../../components/auth/Toast';
import { useAuth } from '../../lib/auth/AuthContext';
import { extractErrorMessage } from '../../lib/apiError';
import { usePageSettings, useI18n, pickPage } from '../../lib/cms';
import { useWebAssistantStore } from '../../stores/webAssistantStore';

const loginSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
  // 登录不预检长度(注册要求 12 位, 但旧账号可能更短, 实际校验交给服务端)
  password: z.string().min(1, '请输入密码'),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  // v1.9-alpha.1 (B-02): 优先读 navigate state.from (Layout FAB / mobile AI tab
  // 会传 'web-assistant'),回退到 URL ?from=。URL ?from 必须是 / 开头的同源路径。
  const stateFrom = (location.state as { from?: string } | null)?.from;
  const requestedFrom = stateFrom || params.get('from');
  const from =
    requestedFrom?.startsWith('/') && !requestedFrom.startsWith('//')
      ? requestedFrom
      : '/';
  const openWebAssistant = useWebAssistantStore((s) => s.openDrawer);
  const { signIn, user, providers, isAuthenticating } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const hasThirdPartyProviders = providers.some((provider) => provider.type !== 'email_password');

  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // 已登录用户访问 /auth/login 自动重定向
  // P0 2026-07-24 修复: admin role 也跳 /admin (而非 from 默认 /)
  // — 之前 from 默认 '/', admin 登录后/已登录访问 login 页都停在首页看不出身份差异
  useEffect(() => {
    if (!isAuthenticating && user) {
      const target = user.passwordResetRequired
        ? '/dashboard/settings/bindings?change-password=required'
        : user.role === 'admin' ? '/admin' : from;
      navigate(target, { replace: true });
    }
  }, [isAuthenticating, user, from, navigate]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const session = await signIn({
        kind: 'local',
        email: values.email,
        password: values.password,
      });
      showToast('登录成功', 'success');
      // P0 2026-07-24 修复: admin 登录后默认跳 /admin (而非 /)
      // — 之前 from 默认 '/', admin 登录后停在首页看不出身份差异
      const target = session.user.passwordResetRequired
        ? '/dashboard/settings/bindings?change-password=required'
        : session.user.role === 'admin' ? '/admin' : from;
      // v1.9-alpha.1 (B-02): 登录后恢复"打开 AI 助手"意图 (UX-AUDIT C-08)。
      // 'web-assistant' 是字符串 sentinel,不是路由 — 不参与 navigate,只触发 drawer。
      if (stateFrom === 'web-assistant') {
        openWebAssistant();
      }
      navigate(target, { replace: true });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, '登录失败,请检查邮箱或密码');
      setSubmitError(msg);
      showToast(msg, 'error', 4000);
    }
  });

  const handleProviderClick = (providerId: string, label: string) => {
    void signIn({ kind: 'oauth-redirect', provider: providerId }).catch((err) => {
      if (err instanceof Error && err.message === 'Redirecting to OAuth provider…') return;
      showToast(`${label} 登录启动失败，请稍后重试`, 'error', 4000);
    });
  };

  // 启动期骨架(避免白屏)
  if (isAuthenticating) {
    return (
      <AuthShell>
        <div className="space-y-6">
          <Skeleton variant="text" className="h-8 w-32" />
          <Skeleton variant="text" className="h-4 w-64" />
          <Skeleton variant="rectangle" className="h-32 w-full rounded-lg" />
          <Skeleton variant="text" count={2} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTabSwitcher
        current="login"
        loginHref="/auth/login"
        registerHref="/auth/register"
      />

      {/* CMS-driven copy (page_settings.auth.{h1_login, sub_login}) */}
      <AuthHeader page="login" />

      {hasThirdPartyProviders && (
        <>
          <section className="mt-6">
            <ProviderButtons
              grayscale={false}
              providers={providers}
              onProviderClick={handleProviderClick}
            />
            <p className="mt-2 text-[10px] text-center text-neutral-400">
              {t('auth.merged_hint', '已登录过此平台?系统会自动合并到你的账号')}
            </p>
          </section>
          <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-200" />
            <span>或使用邮箱</span>
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-200" />
          </div>
        </>
      )}

      {/* 邮箱密码表单 */}
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {submitError && (
          <p role="alert" className="flex items-center gap-2 border border-red-700 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
          </p>
        )}
        <Input
          label="邮箱"
          type="email"
          placeholder={t('auth.placeholder.email', 'you@company.com')}
          autoComplete="email"
          required
          fullWidth
          leftIcon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="login-password"
              className="text-sm font-medium text-neutral-900 dark:text-neutral-900"
            >
              密码<span className="text-danger-500 ml-1">*</span>
            </label>
            <Link
              to="/auth/forgot"
              className="text-xs text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white"
            >
              {t('auth.forgot', '忘记密码?')}
            </Link>
          </div>
          <Input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            placeholder={t('auth.placeholder.password', '••••••••')}
            autoComplete="current-password"
            required
            fullWidth
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="p-1 -mr-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
            error={errors.password?.message}
            {...register('password')}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          leftIcon={!isSubmitting ? <LogIn className="h-4 w-4" /> : undefined}
        >
          登录
        </Button>
      </form>

      {/* 切换链接 */}
      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-600">
        {t('auth.no_account', '还没有账号?')}{' '}
        <Link
          to="/auth/register"
          className="text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white font-medium"
        >
          {t('auth.signup_link', '免费注册 →')}
        </Link>
      </p>

      {/* 法律 */}
      <p className="mt-4 text-center text-[10px] text-neutral-400">
        {t('auth.legal_prefix', '继续即表示你同意我们的')}{' '}
        <a href="/terms" className="underline hover:text-neutral-600">
          {t('auth.legal.terms', '服务条款')}
        </a>{' '}
        {t('auth.legal_and', '和')}{' '}
        <a href="/privacy" className="underline hover:text-neutral-600">
          {t('auth.legal.privacy', '隐私政策')}
        </a>
      </p>
    </AuthShell>
  );
}

/**
 * AuthHeader — 共享给 LoginPage / RegisterPage 的 CMS-driven h1 + sub
 * 用 page_settings.auth.{h1_login|sub_login|h1_register|sub_register}
 * fallback 跟原硬编码值一致
 */
function AuthHeader({ page }: { page: 'login' | 'register' }) {
  const { data } = usePageSettings('auth', page === 'login' ? ['h1_login', 'sub_login'] : ['h1_register', 'sub_register']);
  const { t } = useI18n();
  const h1 = pickPage(
    data,
    page === 'login' ? 'h1_login' : 'h1_register',
    'zh-CN',
    t(page === 'login' ? 'auth.title.login' : 'auth.title.register', page === 'login' ? '欢迎回来' : '创建账号'),
  );
  const sub = pickPage(
    data,
    page === 'login' ? 'sub_login' : 'sub_register',
    'zh-CN',
    t(page === 'login' ? 'auth.sub_login' : 'auth.sub_register', page === 'login' ? '继续你的 AI 时代学习路径' : '注册后立即开始学习 AI 课程'),
  );
  return (
    <header>
      <Seo
        title={h1}
        description={sub}
        path="/auth/login"
      />
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-900">{h1}</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-600">{sub}</p>
    </header>
  );
}
