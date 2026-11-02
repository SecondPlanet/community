/**
 * ForbiddenPage — 403 无权限访问
 *
 * 触发场景 (来自 audit-web-ux-long.md:54 缺口):
 *   - 普通用户访问 /admin (ProtectedRoute 跳 / 但有些深层路由不会)
 *   - 学员访问别人的私有资源 (订单/证书/进度)
 *   - 已停用账号访问需要管理员权限的页面
 *
 * 设计:
 *   - 跟 NotFoundPage 同款黑底硬核风,共用 ErrorShell
 *   - 智能 CTA: 已登录 → "切换账号"; 未登录 → "立即登录"
 *   - 加「联系客服」给用户留出口 (用户被误判时能找到人)
 *
 * 用法 (e.g. admin 私有页直接拒绝):
 *   <Route path="secret" element={<ForbiddenPage />} />
 *
 *   或者从 ErrorBoundary:
 *   <ErrorBoundary type="403">
 *     <AdminSecretPanel />
 *   </ErrorBoundary>
 */
import { useAuthStore } from '../../stores/authStore';
import { contactHref } from '../../lib/contact';
import { ErrorShell, ActionButton } from './ErrorShell';
import { I18nText } from '../../components/I18nText';
import { LogIn, UserCog, Mail, ShieldOff } from 'lucide-react';

export function ForbiddenPage() {
  const user = useAuthStore((s) => s.user);
  const isLoggedIn = !!user;

  return (
    <ErrorShell
      className="min-h-screen"
      eyebrow="/ 403"
      code="403"
      title={
        <span className="flex items-center gap-3">
          <ShieldOff className="w-8 h-8 md:w-10 md:h-10" aria-hidden="true" />
          <I18nText k="error.403.title" default="Access Denied" />
        </span>
      }
      description={
        isLoggedIn ? (
          <I18nText
            k="error.403.desc.logged_in"
            default="你当前账号没有访问该资源的权限。如果是管理员专属页面,请用管理员账号登录;如果仍无法访问,请通过下方入口联系维护者。"
          />
        ) : (
          <I18nText
            k="error.403.desc.anonymous"
            default="访问该资源需要登录账号。请先登录,或切换一个有权限的账号再试。"
          />
        )
      }
      actions={
        <>
          {/* 主 CTA: 已登录 → 切换账号;未登录 → 登录 */}
          {isLoggedIn ? (
            <ActionButton
              to="/auth/login"
              variant="primary"
              showIcon={false}
              ariaLabel="切换账号"
            >
              <UserCog className="w-4 h-4" aria-hidden="true" />
              <I18nText k="error.403.cta.switch" default="Switch Account" />
            </ActionButton>
          ) : (
            <ActionButton
              to="/auth/login"
              variant="primary"
              showIcon={false}
              ariaLabel="立即登录"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <I18nText k="error.403.cta.login" default="Login" />
            </ActionButton>
          )}
          {/* 次 CTA: 回首页 */}
          <ActionButton
            to="/"
            variant="secondary"
            showIcon={false}
            ariaLabel="返回首页"
          >
            <I18nText k="error.403.cta.home" default="Back To Home" />
          </ActionButton>
        </>
      }
      footer={
        <div className="text-sm text-[#666666]">
          <div className="flex items-center gap-2 mb-2 font-black uppercase text-[10px] tracking-[0.3em] text-[#171717]">
            <Mail className="w-4 h-4" aria-hidden="true" />
            <I18nText k="error.403.contact" default="/ Need Help?" />
          </div>
          <p className="mb-2">
            <I18nText
              k="error.403.contact.desc"
              default="如果这是误判 (你的账号应该有权限),请联系客服:"
            />
          </p>
          <a
            href={contactHref('权限问题求助', '访问该资源时提示没有权限，请协助确认。')}
            className="text-[#171717] underline underline-offset-4 hover:text-[#262626] font-bold"
          >
            提交联系申请
          </a>
        </div>
      }
    />
  );
}
