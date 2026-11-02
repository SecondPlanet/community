import { LegalPage, type LegalSection } from './LegalPage';

const SECTIONS: LegalSection[] = [
  {
    id: 'collect',
    title: '系统实际处理的信息',
    content: (
      <ul>
        <li>账户资料：邮箱、昵称、头像、角色与加密后的密码。</li>
        <li>学习数据：报名、课时完成状态、笔记、评价、积分、徽章和证书。</li>
        <li>互动数据：通知、联系请求、黑客松团队与作品、AI 助手会话。</li>
        <li>安全与运维数据：登录身份、刷新会话及服务日志。</li>
      </ul>
    ),
  },
  {
    id: 'purpose',
    title: '处理目的',
    content: (
      <p>上述信息用于登录鉴权、提供学习功能、同步进度、生成与验证证书、回复咨询、保障服务安全以及排查故障。平台不会把不存在的支付、设备指纹或自动化风控能力写成已经启用。</p>
    ),
  },
  {
    id: 'ai',
    title: 'AI 服务',
    content: (
      <p>只有在管理员或用户配置并启用 AI Provider 后，相关请求才会由服务端发送给所选 Provider。用户不应在提示词中提交身份证号、支付信息、密码、密钥或其他无必要敏感信息。用户保存的 Provider 密钥由服务端加密存储，不写入浏览器本地存储。</p>
    ),
  },
  {
    id: 'public-certificate',
    title: '公开证书验证',
    content: (
      <p>证书持有人分享序列号后，任何获得该序列号的人都可以访问公开验证页，查看证书是否有效及验证接口返回的证书字段。请仅在需要验证时分享序列号。</p>
    ),
  },
  {
    id: 'storage',
    title: '存储与保留',
    content: (
      <p>数据存储位置和保留期限取决于实际部署配置与适用合同。当前代码没有统一的“30 天删除”“90 天自动清理”或固定云区域保证，因此本页面不作此类虚假承诺。需要删除、更正或导出个人信息时，请提交联系申请并完成身份核验。</p>
    ),
  },
  {
    id: 'browser',
    title: '浏览器存储',
    content: (
      <p>系统使用必要 Cookie 维持刷新会话，使用 SessionStorage 保存当前标签页的访问令牌与临时会话，使用 LocalStorage 保存主题偏好。详情见《Cookie 与本地存储说明》。</p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="/ Privacy · Actual Data Use"
      title="隐私与数据使用说明"
      subtitle="仅描述当前系统真实处理的数据与可用控制"
      lastUpdated="2026-08-12"
      sections={SECTIONS}
    />
  );
}
