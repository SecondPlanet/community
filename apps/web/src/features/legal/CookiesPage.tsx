import { LegalPage, type LegalSection } from './LegalPage';

const SECTIONS: LegalSection[] = [
  {
    id: 'necessary',
    title: '必要 Cookie',
    content: (
      <p>登录后，服务端使用名为 <code>refresh_token</code> 的 HttpOnly Cookie 轮换短期访问令牌。该 Cookie 的路径限定为认证接口，生产环境使用 Secure，并采用 SameSite=Lax。退出登录时系统会清除该 Cookie。</p>
    ),
  },
  {
    id: 'session-storage',
    title: 'SessionStorage',
    content: (
      <ul>
        <li><code>aicourse.accessToken</code>：当前标签页的短期访问令牌，关闭标签页后由浏览器清除。</li>
        <li><code>webAssistant.currentSessionId</code>：当前 AI 助手会话标识，退出账户时清除。</li>
        <li>OAuth 绑定流程可能暂存待绑定的 Provider 标识，回调完成或失败后清除。</li>
      </ul>
    ),
  },
  {
    id: 'local-storage',
    title: 'LocalStorage',
    content: (
      <p><code>theme</code> 仅用于保存亮色或暗色主题偏好。账户资料、密码和 AI Provider 密钥不会写入 LocalStorage。</p>
    ),
  },
  {
    id: 'not-used',
    title: '当前未使用的类别',
    content: (
      <p>当前代码没有营销 Cookie、第三方广告 Cookie、分析 Cookie、CSRF Token Cookie 或设备指纹 Cookie。本说明不宣称系统会响应 DNT 信号；如以后接入新的浏览器存储，将先更新清单和相应控制。</p>
    ),
  },
  {
    id: 'control',
    title: '如何控制',
    content: (
      <p>您可以在浏览器设置中查看或清除 Cookie 与本地存储。清除 <code>refresh_token</code> 或 SessionStorage 会结束或要求重新建立登录会话；清除 <code>theme</code> 只会重置显示主题。</p>
    ),
  },
];

export function CookiesPage() {
  return (
    <LegalPage
      eyebrow="/ Privacy · Browser Storage"
      title="Cookie 与本地存储说明"
      subtitle="当前 Web 客户端实际使用的浏览器存储清单"
      lastUpdated="2026-08-12"
      sections={SECTIONS}
    />
  );
}
