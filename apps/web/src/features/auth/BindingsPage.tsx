/**
 * BindingsPage — 账号绑定 sub-page (P0-3)
 *
 * 路径: /dashboard/settings/bindings
 *
 * 来自 mock-auth.html 底部 "账号绑定 / 解绑管理" 段:
 *   - 顶部:已绑定的 Identity 列表(provider 图标 + 邮箱 + 绑于 + 解除按钮)
 *   - 中部:已配置且未绑定的 OAuth provider，可直接发起绑定
 *   - 底部:"至少保留一种登录方式" 提示
 *
 * API 端点(spec §9.3):
 *   - GET    /api/v1/auth/identities
 *   - GET    /api/v1/auth/:providerId/link/start
 *   - POST   /api/v1/auth/:providerId/link/callback
 *   - DELETE /api/v1/auth/identities/:id
 *
 * identities 查询和解绑均走真实后端；该页面必须经过 AuthGuard。
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail,
  Lock,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ProviderButtons } from '../../components/auth/ProviderButtons';
import { useToast } from '../../components/auth/Toast';
import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError, extractErrorMessage } from '../../lib/apiError';
import { useLocaleDate } from '../../hooks/useLocaleDate';
import { api } from '../../lib/api';
import { contactHref } from '../../lib/contact';
import type { Identity, ProviderInfo } from '../../lib/auth/types';
import { usePageSettings, useI18n, pickPage } from '../../lib/cms';

function providerMetaFromCapabilities(
  providers: ProviderInfo[],
): Record<string, { label: string; icon: React.ReactNode }> {
  return Object.fromEntries(providers.map((provider) => [
    provider.id,
    {
      label: provider.label,
      icon: provider.type === 'email_password'
        ? <Mail className="h-5 w-5" />
        : <span className="font-bold text-sm">{provider.label.charAt(0)}</span>,
    },
  ]));
}

export function BindingsPage() {
  const { user, identities, providers, isAuthenticating, bindProvider, unbindProvider, signOut } = useAuth();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  // P0 (audit 2026-07-24): 改用 ConfirmDialog, 跟 OrdersPage / NotificationsPage
  // 风格一致 (弃用 window.confirm — 不能 i18n, 不能定制 variant)
  const [confirmUnbind, setConfirmUnbind] = useState<Identity | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const passwordChangeRequired = params.get('change-password') === 'required';

  const displayedIdentities: Identity[] = identities;

  const providerMeta = providerMetaFromCapabilities(providers);
  const { t } = useI18n();
  const { formatDate: formatLocaleDate } = useLocaleDate();
  // 沿用之前 "yyyy.MM.dd" 形式(跟 mock 一致) — zh-CN 默认 toLocaleDateString 给的是 "/"
  const formatDate = (iso?: string | null) =>
    formatLocaleDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
  const { data: pageData } = usePageSettings('auth', ['h1_bindings']);
  const bindingsH1 = pickPage(pageData, 'h1_bindings', 'zh-CN', t('auth.h1_bindings', '绑定第三方账号,登录更便捷'));

  // P2-fix (2026-10-16): 首次登录强制改密码 — 加显眼 banner, 避免用户以为 dashboard 坏了
  const changePasswordBanner = passwordChangeRequired ? (
    <div role="alert" aria-live="polite" className="mb-4 border-2 border-warning-500 bg-warning-100 p-4 flex items-start gap-3">
      <svg className="w-6 h-6 shrink-0 text-warning-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
      <div className="flex-1">
        <h3 className="font-bold text-sm text-neutral-900">首次登录, 请先修改默认密码</h3>
        <p className="mt-1 text-xs text-neutral-600">为了账号安全, 管理员分配的初始密码必须在首次登录后立即修改。完成修改后您将自动跳转到您的学习中心。</p>
      </div>
    </div>
  ) : null;

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <Skeleton variant="text" className="h-8 w-64" />
          <Skeleton variant="rectangle" className="h-32 w-full rounded-lg" />
          <Skeleton variant="rectangle" className="h-32 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // 未登录时硬重定向到登录页(带 ?next= 登录后回弹)
  // 原 EmptyState + 按钮改为 <Navigate>, 避免给未登录访客看到 "请先登录" 卡片
  if (!user) {
    return <Navigate to="/auth/login?from=/dashboard/settings/bindings" replace />;
  }

  const handleUnbind = async (id: Identity) => {
    if (id.provider === 'email_password') {
      showToast(t('auth.toast.local_primary', '本地账号是主登录,无法解绑'), 'warning');
      return;
    }
    setBusyId(id.id);
    try {
      await unbindProvider(id.id);
      showToast(t('auth.toast.unbind', '已解绑'), 'success');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('auth.toast.unbind_fail', '解绑失败');
      showToast(msg, 'error', 4000);
    } finally {
      setBusyId(null);
    }
  };

  // ConfirmDialog 触发: 点"解绑"按钮只 setConfirmUnbind, 用户在弹层确认后才真解绑
  const requestUnbind = (id: Identity) => {
    if (id.provider === 'email_password') {
      showToast(t('auth.toast.local_primary', '本地账号是主登录,无法解绑'), 'warning');
      return;
    }
    setConfirmUnbind(id);
  };

  const handleBindClick = async (providerId: string, label: string) => {
    try {
      await bindProvider(providerId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : `${label} 绑定启动失败`, 'error');
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
    if (
      newPassword.length < 12 ||
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/\d/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      showToast('新密码至少 12 位，并包含大小写字母、数字和符号', 'error');
      return;
    }
    setPasswordBusy(true);
    try {
      await api.post('/api/v1/users/me/change-password', {
        currentPassword,
        newPassword,
      });
      showToast('密码已修改，请重新登录', 'success');
      await signOut();
      navigate('/auth/login', { replace: true });
    } catch (err) {
      showToast(extractErrorMessage(err, '密码修改失败'), 'error');
    } finally {
      setPasswordBusy(false);
    }
  };

  const nonPrimaryCount = displayedIdentities.filter(
    (i) => !i.isPrimary,
  ).length;
  const totalCount = displayedIdentities.length;
  const displayUser = user;
  const linkedProviders = new Set(displayedIdentities.map((identity) => identity.provider));
  const bindableProviders = providers.filter(
    (provider) => provider.type === 'oauth' && provider.enabled && !linkedProviders.has(provider.id),
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to="/profile"
          className="mb-6 inline-flex min-h-[44px] items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" /> 返回个人中心
        </Link>
        {/* P2-fix (2026-10-16): 首次登录强制改密码 banner */}
        {changePasswordBanner}
        {/* Header */}
        <header className="text-center mb-10">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-xp-100 text-xp-500">
            已登录用户 · 账号绑定管理
          </span>
          <h1 className="mt-3 text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-900">
            {bindingsH1}
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-600">
            {t('auth.bindings.path', '设置页路径:')}
            <code className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-100 font-mono text-xs mx-1">
              /dashboard/settings/bindings
            </code>
          </p>
        </header>

        {user && (
          <Card variant="outlined" padding="md" className="mb-8">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-[#171717] text-white flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-neutral-900 dark:text-neutral-900">修改登录密码</h2>
                <p className="text-xs text-neutral-600 dark:text-neutral-600 mt-1">
                  {passwordChangeRequired
                    ? '当前使用的是临时密码，完成修改后才能继续使用账号。'
                    : '修改后会吊销所有设备的刷新会话，需要重新登录。'}
                </p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="grid gap-4 md:grid-cols-3">
              <Input
                label="当前密码"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <Input
                label="新密码"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <Input
                label="确认新密码"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" variant="primary" isLoading={passwordBusy}>
                  保存新密码
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* 已绑定列表 */}
        <Card variant="outlined" padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 dark:bg-neutral-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-neutral-900 dark:text-neutral-900">
              已绑定的登录方式
            </h2>
            <span className="text-xs text-neutral-600 dark:text-neutral-600">
              {t('auth.bindings.count', '{count} 种 · 至少保留 1 种').replace('{count}', String(totalCount))}
            </span>
          </div>

          {displayedIdentities.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<ShieldCheck className="h-6 w-6" />}
                title={t('auth.identity.empty.title', '还没有绑定任何登录方式')}
                description={`${displayUser.email} 还没有绑定任何第三方登录方式`}
              />
            </div>
          ) : (
            <ul role="list" className="divide-y divide-neutral-200">
              {displayedIdentities.map((id) => {
                const meta = providerMeta[id.provider] ?? {
                  label: id.provider,
                  icon: <Lock className="h-5 w-5" />,
                };
                const isPrimary = !!id.isPrimary;
                return (
                  <li
                    key={id.id}
                    className="px-6 py-4 flex items-center gap-4"
                  >
                    <div
                      className={
                        isPrimary
                          ? 'w-10 h-10 rounded-lg bg-[#171717] text-neutral-0 flex items-center justify-center'
                          : 'w-10 h-10 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-600'
                      }
                    >
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-neutral-900 dark:text-neutral-900 truncate">
                          {isPrimary
                            ? meta.label
                            : `${meta.label} · ${id.displayName ?? id.email ?? id.providerUserId ?? id.id}`}
                        </span>
                        {isPrimary && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-success-100 text-success-500">
                            主登录
                          </span>
                        )}
                      </div>
                      {id.lastUsedAt && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-600 mt-0.5">
                          上次使用 {formatDate(id.lastUsedAt)}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 font-mono hidden sm:block">
                      绑定于 {formatDate(id.linkedAt)}
                    </div>
                    {isPrimary ? (
                      <span className="text-xs text-neutral-400 hidden sm:inline">
                        无法解绑
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => requestUnbind(id)}
                        isLoading={busyId === id.id}
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        className="text-danger-500 hover:bg-danger-100"
                      >
                        解绑
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 添加已配置且尚未绑定的 OAuth provider */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-900 mb-3">
            添加新的登录方式
          </h2>
          {bindableProviders.length > 0 ? (
            <ProviderButtons
              grayscale={false}
              providers={bindableProviders}
              onProviderClick={handleBindClick}
            />
          ) : (
            <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
              当前没有尚未绑定的 OAuth 登录方式。管理员配置 Google 或 GitHub 后会自动显示在这里。
            </p>
          )}
          <p className="mt-3 text-[10px] text-neutral-400">
            登录方式由后台认证配置与部署凭据共同决定；未完成凭据配置的方式不会展示。
          </p>
        </section>

        {/* 安全提示 */}
        <div className="mt-8 p-4 rounded-lg bg-warning-100 border border-warning-500/20 flex gap-3">
          <AlertTriangle
            className="w-5 h-5 text-warning-500 flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-900">
              {nonPrimaryCount === 0
                ? t('auth.identity.keep_one', '至少保留一种登录方式')
                : t('auth.identity.warning_title', '安全提醒')}
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-600">
              {t('auth.identity.warning_desc', '解绑会立即吊销对应 provider 的 refresh token。')} 如发现异常登录，请
              <a
                href={contactHref('账号安全协助', '发现异常登录，请协助撤销所有设备。')}
                className="text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white"
              >
                联系支持团队
              </a>
              协助撤销所有设备。
            </p>
          </div>
        </div>

        {/* Refresh 按钮 — 让用户能拉最新 identities */}
        <div className="mt-6 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.reload()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* P0 (audit 2026-07-24): 二次确认走 ConfirmDialog 跟全项目一致 */}
      <ConfirmDialog
        open={!!confirmUnbind}
        onClose={() => setConfirmUnbind(null)}
        onConfirm={async () => {
          if (confirmUnbind) await handleUnbind(confirmUnbind);
        }}
        title={t('auth.unbind.confirm_title', '确认解绑?')}
        description={
          confirmUnbind
            ? t(
                'auth.unbind.confirm_desc',
                `解绑 ${providerMeta[confirmUnbind.provider]?.label ?? confirmUnbind.provider} 后,你将无法再用此账号登录。`,
              )
            : ''
        }
        variant="warning"
        confirmText={t('auth.unbind.confirm_btn', '确认解绑')}
      />
    </div>
  );
}
