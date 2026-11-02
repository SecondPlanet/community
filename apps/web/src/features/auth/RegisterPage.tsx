/**
 * RegisterPage — 注册页(P0-2)
 *
 * 跟 LoginPage 共享 AuthShell / ProviderButtons / 表单模式
 * 字段:姓名 + 邮箱 + 密码 + 确认密码
 * 提交:POST /api/v1/auth/register → 成功后自动登录
 */
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '../../lib/zodResolver';
import { Mail, Lock, Eye, EyeOff, UserPlus, User as UserIcon } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ProviderButtons } from '../../components/auth/ProviderButtons';
import { AuthShell, AuthTabSwitcher } from '../../components/auth/AuthShell';
import { useToast } from '../../components/auth/Toast';
import { useAuth } from '../../lib/auth/AuthContext';
import { extractErrorMessage } from '../../lib/apiError';
import { api } from '../../lib/api';

const registerSchema = z
  .object({
    name: z.string().min(1, '请输入姓名').max(50, '姓名过长'),
    email: z.string().email('请输入有效邮箱'),
    password: z
      .string()
      .min(12, '密码至少 12 位')
      .max(128, '密码最多 128 位')
      .regex(/[a-z]/, '密码必须包含小写字母')
      .regex(/[A-Z]/, '密码必须包含大写字母')
      .regex(/\d/, '密码必须包含数字')
      .regex(/[^A-Za-z0-9]/, '密码必须包含符号'),
    confirmPassword: z.string().min(12, '确认密码至少 12 位'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });
type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { signIn, user, providers, isAuthenticating } = useAuth();
  const { showToast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const hasThirdPartyProviders = providers.some((provider) => provider.type !== 'email_password');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!isAuthenticating && user) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticating, user, navigate]);

  /**
   * 后端 P0-1 实现:
   *   POST /api/v1/auth/register 返 { user } (无 token)
   *   → 客户端调 /auth/login 拿 token + cookie
   *   合并为一个 signIn 流程
   */
  const onSubmit = handleSubmit(async (values) => {
    try {
      // 1) 注册
      await api.post('/api/v1/auth/register', {
        email: values.email,
        password: values.password,
        name: values.name,
      });
      // 2) 自动登录
      await signIn({
        kind: 'local',
        email: values.email,
        password: values.password,
      });
      showToast('注册成功, 欢迎加入!', 'success');
      // C-07 方案 A: 注册成功 → 落地 onboarding 引导页(复用 /ai-courses/new),
      // 由 CreateAiCoursePage 判定是否已有 LearningProject 来跳过 onboarding。
      navigate('/ai-courses/new?onboarding=1', { replace: true });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, '注册失败,请稍后再试');
      showToast(msg, 'error', 4000);
    }
  });

  const handleProviderClick = (providerId: string, label: string) => {
    void signIn({ kind: 'oauth-redirect', provider: providerId }).catch((err) => {
      if (err instanceof Error && err.message === 'Redirecting to OAuth provider…') return;
      showToast(`${label} 注册启动失败，请稍后重试`, 'error', 4000);
    });
  };

  if (isAuthenticating) {
    return (
      <AuthShell>
        <div className="space-y-6">
          <Skeleton variant="text" className="h-8 w-32" />
          <Skeleton variant="text" className="h-4 w-64" />
          <Skeleton variant="rectangle" className="h-32 w-full rounded-lg" />
          <Skeleton variant="text" count={3} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTabSwitcher
        current="register"
        loginHref="/auth/login"
        registerHref="/auth/register"
      />

      <header>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-900">
          创建账号
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-600">
          注册后立即开始学习 AI 课程
        </p>
      </header>

      {hasThirdPartyProviders && (
        <>
          <section className="mt-6">
            <ProviderButtons
              grayscale={false}
              providers={providers}
              onProviderClick={handleProviderClick}
            />
            <p className="mt-2 text-[10px] text-center text-neutral-400">
              已有本平台账号?系统会自动合并到你的账号
            </p>
          </section>
          <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-200" />
            <span>或使用邮箱</span>
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-200" />
          </div>
        </>
      )}

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Input
          label="姓名"
          type="text"
          placeholder="你的姓名"
          autoComplete="name"
          required
          fullWidth
          leftIcon={<UserIcon className="h-4 w-4" />}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="邮箱"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          required
          fullWidth
          leftIcon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="密码"
          type={showPassword ? 'text' : 'password'}
          placeholder="至少 12 位"
          autoComplete="new-password"
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
          hint="需包含大小写字母、数字和符号"
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="确认密码"
          type={showPassword ? 'text' : 'password'}
          placeholder="再输入一次"
          autoComplete="new-password"
          required
          fullWidth
          leftIcon={<Lock className="h-4 w-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          leftIcon={
            !isSubmitting ? <UserPlus className="h-4 w-4" /> : undefined
          }
        >
          创建账号
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-600">
        已有账号?{' '}
        <Link
          to="/auth/login"
          className="text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white font-medium"
        >
          直接登录 →
        </Link>
      </p>

      <p className="mt-4 text-center text-[10px] text-neutral-400">
        继续即表示你同意我们的{' '}
        <a href="/terms" className="underline hover:text-neutral-600">
          服务条款
        </a>{' '}
        和{' '}
        <a href="/privacy" className="underline hover:text-neutral-600">
          隐私政策
        </a>
      </p>
    </AuthShell>
  );
}
