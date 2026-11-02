/**
 * NetworkErrorPage — 网络错误 (offline / timeout / DNS 失败)
 *
 * 触发场景 (来自 audit-web-ux-long.md:54 缺口):
 *   - navigator.onLine === false (offline)
 *   - Failed to fetch / Network Error / ERR_NETWORK
 *   - 请求超时 (ECONNABORTED)
 *   - VPN / 代理 / DNS 污染
 *
 * 设计:
 *   - 共用 ErrorShell,跟 404 / 403 / 500 风格统一
 *   - 监听 online/offline 事件,网络恢复时自动提示用户「已恢复,点重试」
 *   - 「重试」按钮
 *   - 「网络诊断」footer: 给非技术用户的检查清单
 *
 * 用法:
 *   if (isError && isNetworkError(error)) {
 *     return <NetworkErrorPage onRetry={refetch} />;
 *   }
 *
 *   或作为兜底:
 *   <ErrorBoundary type="network" onReset={refetch}>
 *     <SomePage />
 *   </ErrorBoundary>
 */
import { useEffect, useState } from 'react';
import { ErrorShell, ActionButton } from './ErrorShell';
import { I18nText } from '../../components/I18nText';
import { RefreshCw, Home, WifiOff, Wifi, CheckCircle2 } from 'lucide-react';

interface NetworkErrorPageProps {
  onRetry?: () => void;
}

export function NetworkErrorPage({ onRetry }: NetworkErrorPageProps) {
  // 初始固定为「网络错」状态,不要从 navigator.onLine 读初值:
  //   - jsdom / 真实浏览器都经常 navigator.onLine 撒谎(VPN/代理/proxy 场景)
  //   - 既然用户进到这页,说明网络已经出问题了
  //   - 只有显式收到 online 事件才转「已恢复」,更稳
  // 设计: 事件驱动的状态机,组件本身不主动检测
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <ErrorShell
      className="min-h-screen"
      eyebrow={isOnline ? '/ ONLINE' : '/ OFFLINE'}
      code={isOnline ? 'NET' : 'OFF'}
      title={
        <span className="flex items-center gap-3">
          {isOnline ? (
            <CheckCircle2
              className="w-8 h-8 md:w-10 md:h-10 text-emerald-400"
              aria-hidden="true"
            />
          ) : (
            <WifiOff className="w-8 h-8 md:w-10 md:h-10" aria-hidden="true" />
          )}
          <I18nText
            k={isOnline ? 'error.network.title.recovered' : 'error.network.title'}
            default={isOnline ? 'Connection Recovered' : 'Network Error'}
          />
        </span>
      }
      description={
        isOnline ? (
          <I18nText
            k="error.network.desc.recovered"
            default="网络已恢复。点击「重试」重新加载页面。"
          />
        ) : (
          <I18nText
            k="error.network.desc"
            default="无法连接到服务器。请检查你的网络连接,然后重试。"
          />
        )
      }
      actions={
        <>
          {/* 主 CTA: 重试 */}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-between gap-6 bg-[#171717] text-white px-6 py-4 font-black uppercase tracking-wider text-sm hover:bg-[#262626] transition-colors min-h-[48px]"
          >
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <I18nText k="error.network.cta.retry" default="Try Again" />
            </span>
          </button>
          <ActionButton to="/" variant="secondary" showIcon={false} ariaLabel="返回首页">
            <Home className="w-4 h-4" aria-hidden="true" />
            <I18nText k="error.network.cta.home" default="Back To Home" />
          </ActionButton>
        </>
      }
      footer={
        <div className="text-sm text-[#666666]">
          {/* 网络诊断清单 — 兜底场景的提示 */}
          <div className="flex items-center gap-2 mb-3 font-black uppercase text-[10px] tracking-[0.3em] text-[#171717]">
            <Wifi className="w-4 h-4" aria-hidden="true" />
            <I18nText k="error.network.diag" default="/ Troubleshooting" />
          </div>
          <ol className="space-y-2 list-decimal list-inside mb-4 leading-relaxed">
            <li>
              <I18nText
                k="error.network.diag.1"
                default="检查 WiFi / 移动数据是否已开启"
              />
            </li>
            <li>
              <I18nText
                k="error.network.diag.2"
                default="关闭 VPN / 代理 / 防火墙,再试一次"
              />
            </li>
            <li>
              <I18nText
                k="error.network.diag.3"
                default="如果企业内网限制,切换到手机 4G/5G 热点"
              />
            </li>
            <li>
              <I18nText
                k="error.network.diag.4"
                default="仍无法解决?等待 1-2 分钟再重试,可能是临时波动"
              />
            </li>
          </ol>
          {/* 当前状态指示 */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-black uppercase tracking-wider border ${
              isOnline
                ? 'border-emerald-500/40 bg-emerald-50 text-emerald-700'
                : 'border-red-500/40 bg-red-50 text-red-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
              aria-hidden="true"
            />
            {isOnline ? (
              <I18nText k="error.network.status.online" default="Browser: Online" />
            ) : (
              <I18nText k="error.network.status.offline" default="Browser: Offline" />
            )}
          </div>
        </div>
      }
    />
  );
}
