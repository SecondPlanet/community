import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, TriangleAlert } from 'lucide-react';
import { AuthShell } from '../../components/auth/AuthShell';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmation) {
      setError('两次输入的密码不一致');
      return;
    }
    if (
      newPassword.length < 12 ||
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/\d/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setError('密码至少 12 位，并包含大小写字母、数字和符号');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/v1/auth/password-reset/confirm', { token, newPassword });
      setChanged(true);
    } catch (requestError) {
      const message = (requestError as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      setError(message ?? '重置链接无效或已过期');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {changed ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-500" />
          <h1 className="mt-4 text-2xl font-bold">密码已更新</h1>
          <p className="mt-2 text-sm text-neutral-600">旧会话已全部退出，请使用新密码登录。</p>
          <Link
            to="/auth/login"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#171717] px-5 py-2.5 text-sm font-semibold text-white"
          >
            前往登录
          </Link>
        </div>
      ) : !token ? (
        <div className="py-6 text-center">
          <TriangleAlert className="mx-auto h-10 w-10 text-danger-500" />
          <h1 className="mt-4 text-2xl font-bold">重置链接无效</h1>
          <Link to="/auth/forgot" className="mt-6 inline-flex text-sm font-semibold underline">
            重新申请重置邮件
          </Link>
        </div>
      ) : (
        <>
          <header>
            <KeyRound className="h-8 w-8" />
            <h1 className="mt-3 text-2xl font-bold">设置新密码</h1>
            <p className="mt-1 text-sm text-neutral-600">链接只能使用一次，提交成功后所有旧会话都会失效。</p>
          </header>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              type="password"
              label="新密码"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
              fullWidth
            />
            <Input
              type="password"
              label="确认新密码"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
              fullWidth
            />
            {error && <p role="alert" className="text-sm text-danger-500">{error}</p>}
            <Button type="submit" isLoading={busy} fullWidth>确认重置密码</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
