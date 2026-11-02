/**
 * ProviderButtons — 6 宫格第三方登录按钮网格
 *
 * 登录/注册页传入后端 GET /auth/providers 的结果：已配置的 OAuth
 * provider 可点击，未配置项保持灰度。调用方也可强制全部禁用。
 *
 * 设计:
 *   - 灰度灰底 + 锁定图标,hover 不变
 *   - 已启用按钮由调用方启动真实 OAuth 跳转
 */
import { Lock } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ProviderInfo } from '../../lib/auth/types';

export interface ProviderButtonsProps {
  /** 强制全部禁用 */
  grayscale?: boolean;
  /** 后端能力列表；只渲染第三方 provider，不渲染 email_password */
  providers: ProviderInfo[];
  /** 点击已启用的 provider */
  onProviderClick?: (providerId: string, label: string) => void;
  className?: string;
}

interface ProviderDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

function GoogleIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function WechatIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#07C160"
        d="M8.69 4C4.97 4 2 6.5 2 9.6c0 1.74.99 3.3 2.53 4.32-.07.27-.45 1.55-.49 1.74-.06.27.1.27.21.2.09-.06 1.41-.95 1.85-1.25.84.16 1.72.25 2.59.27-.13-.45-.2-.92-.2-1.4 0-2.96 2.85-5.36 6.37-5.36.13 0 .26.01.39.02C14.62 5.5 11.92 4 8.69 4Zm-2.4 2.83a.86.86 0 1 1 0 1.72.86.86 0 0 1 0-1.72Zm5.13 0a.86.86 0 1 1 0 1.72.86.86 0 0 1 0-1.72Z"
      />
      <path
        fill="#07C160"
        d="M22 14.34c0-2.6-2.6-4.71-5.8-4.71s-5.81 2.11-5.81 4.71c0 2.61 2.6 4.72 5.81 4.72.71 0 1.39-.11 2.03-.31.18.1 1.18.71 1.27.78.13.08.28.04.24-.14-.03-.13-.34-1.18-.4-1.43 1.59-.81 2.66-2.2 2.66-3.62Zm-7.6-1.1a.71.71 0 1 1 0-1.42.71.71 0 0 1 0 1.42Zm3.6 0a.71.71 0 1 1 0-1.42.71.71 0 0 1 0 1.42Z"
      />
    </svg>
  );
}

function WecomIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1A8C80"
        d="M5.5 2C3 2 1 4 1 6.5S3 11 5.5 11c.5 0 1-.07 1.5-.2-.4-.7-.6-1.5-.6-2.3 0-1 .3-1.9.8-2.7C6.6 4.6 5.5 4 5.5 4Zm13 0C16 2 14 4 14 6.5S16 11 18.5 11c.5 0 1-.07 1.5-.2-.4-.7-.6-1.5-.6-2.3 0-1 .3-1.9.8-2.7C19.6 4.6 18.5 4 18.5 4Z"
      />
      <path
        fill="#1A8C80"
        d="M18.5 8c-3 0-5.5 2-5.5 4.5S15.5 17 18.5 17c.4 0 .8-.04 1.2-.12l1.4.62-.4-1.32c.4-.55.8-1.18.8-1.68 0-2.5-2.5-4.5-5.5-4.5Z"
      />
    </svg>
  );
}

function FeishuIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#00D6B9"
        d="M5.5 2C3 2 1 4 1 6.5v.5l11.5 8v6c0 .5.5 1 1 1h.5c.5 0 1-.5 1-1v-6l8-5.5V6.5C23 4 21 2 18.5 2h-13Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}

// Icons are presentation assets; provider labels and enabled state always come
// from GET /auth/providers (which is joined with CMS auth_providers metadata).
const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  'oauth.google': <GoogleIcon />,
  'oauth.github': <GitHubIcon />,
  wechat: <WechatIcon />,
  wecom: <WecomIcon />,
  feishu: <FeishuIcon />,
  apple: <AppleIcon />,
};

export function ProviderButtons({
  grayscale = true,
  providers,
  onProviderClick,
  className,
}: ProviderButtonsProps) {
  const displayedProviders = providers
    .filter((provider) => provider.type !== 'email_password')
    .map((provider): ProviderDef => ({
      id: provider.id,
      label: provider.label,
      icon: PROVIDER_ICONS[provider.id] ?? <Lock className="h-6 w-6" />,
      enabled: provider.enabled,
    }));

  if (displayedProviders.length === 0) return null;

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {displayedProviders.map((p) => {
        const disabled = grayscale || !p.enabled;
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onProviderClick?.(p.id, p.label)}
            title={
              disabled
                ? grayscale ? '账号绑定暂未开放' : '该登录方式未配置'
                : `用 ${p.label} 登录`
            }
            aria-label={disabled ? `${p.label} 暂不可用` : `用 ${p.label} 登录`}
            className={cn(
              'relative flex flex-col items-center gap-1.5 p-3 rounded-lg',
              'border border-neutral-200 bg-neutral-0',
              'dark:border-neutral-200 dark:bg-neutral-100',
              'transition-all duration-150',
              !disabled &&
                'hover:border-[#171717] hover:-translate-y-px hover:shadow-md',
              disabled &&
                'opacity-50 cursor-not-allowed',
            )}
          >
            {disabled && (
              <span
                className="absolute top-1.5 right-1.5 text-neutral-400"
                aria-hidden="true"
              >
                <Lock className="h-3 w-3" />
              </span>
            )}
            {p.icon}
            <span className="text-xs font-medium text-neutral-900 dark:text-neutral-900">
              {p.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
