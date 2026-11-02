import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Mail, MailWarning } from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthShell } from '../../components/auth/AuthShell';
import { api } from '../../lib/api';
import { extractErrorMessage } from '../../lib/apiError';
import { useAuth } from '../../lib/auth/AuthContext';

export function ForgotPasswordPage() {
  const { isAuthenticating } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capability = useQuery({
    queryKey: ['password-reset-capability'],
    queryFn: async () => {
      const { data } = await api.get<{ enabled: boolean }>('/api/v1/auth/password-reset/capability');
      return data;
    },
    retry: 1,
  });

  if (isAuthenticating || capability.isLoading) {
    return (
      <AuthShell>
        <div className="space-y-6">
          <Skeleton variant="text" className="h-8 w-32" />
          <Skeleton variant="text" className="h-4 w-64" />
          <Skeleton variant="rectangle" className="h-32 w-full" />
        </div>
      </AuthShell>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/v1/auth/password-reset/request', { email });
      setSubmitted(true);
    } catch (requestError) {
      setError(extractErrorMessage(requestError, '重置邮件暂时无法发送，请稍后重试'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <header>
        <h1 className="text-2xl font-bold text-neutral-900">忘记密码</h1>
        <p className="mt-1 text-sm text-neutral-600">通过已验证邮箱设置一个新密码</p>
      </header>

      {submitted ? (
        <Card variant="default" padding="md" className="mt-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-500" />
          <h2 className="mt-3 font-semibold text-neutral-900">请检查你的邮箱</h2>
          <p className="mt-2 text-sm text-neutral-600">
            如果该邮箱对应可用的本地账号，你会收到一封 30 分钟内有效的重置邮件。
          </p>
        </Card>
      ) : capability.data?.enabled ? (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input
            type="email"
            label="邮箱"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            leftIcon={<Mail className="h-4 w-4" />}
            autoComplete="email"
            required
            fullWidth
          />
          {error && <p role="alert" className="text-sm text-danger-500">{error}</p>}
          <Button type="submit" isLoading={busy} fullWidth>发送重置邮件</Button>
        </form>
      ) : (
        <Card variant="default" padding="md" className="mt-6 text-center">
          <MailWarning className="mx-auto h-10 w-10 text-warning-500" />
          <h2 className="mt-3 font-semibold text-neutral-900">请联系平台管理员</h2>
          <p className="mt-2 text-sm text-neutral-600">
            当前环境尚未配置邮件投递。管理员可以生成一次性临时密码，登录后系统会要求立即修改。
          </p>
        </Card>
      )}

      <Link
        to="/auth/login"
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm font-semibold underline underline-offset-2"
      >
        <ArrowLeft className="h-4 w-4" />返回登录
      </Link>
    </AuthShell>
  );
}
