import { LegalPage, type LegalSection } from './LegalPage';

// Keep this page aligned with capabilities that are actually available in the
// product. Commercial terms for a paid engagement are agreed in the separate
// written contract produced through the platform's contact channel.
const SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    title: '适用范围',
    content: (
      <p>
        本说明适用于 SecondPlanet 当前提供的课程浏览、账户登录、学习进度、笔记、评价、黑客松、AI 助手和证书验证功能。使用具体功能时，还应遵守页面展示的操作规则。
      </p>
    ),
  },
  {
    id: 'account',
    title: '账户与安全',
    content: (
      <>
        <p>用户应提供可用的邮箱并妥善保管密码。平台可能按管理员配置开放邮箱密码或 OAuth 登录；未在登录页显示的方式不代表已经可用。</p>
        <p>当前版本没有自助账户注销和两步验证入口。如需更正、导出或删除账户资料，请通过平台公布的联系渠道提交请求，由维护者核验身份后处理。</p>
      </>
    ),
  },
  {
    id: 'learning',
    title: '学习、AI 与证书',
    content: (
      <>
        <p>课程、学位与活动内容以对应详情页的当前信息为准。证书仅在系统记录满足相应完成条件后签发；证书不等同于国家职业资格或学历学位。</p>
        <p>AI 助手的输出可能不准确，也不构成法律、医疗、财务或其他专业意见。用户应自行核验重要结论，不得提交违法、侵权或包含无必要敏感信息的内容。</p>
      </>
    ),
  },
  {
    id: 'commercial',
    title: '付费服务',
    content: (
      <>
        <p><strong>当前公开版本未开放在线支付、在线退款和电子发票申请。</strong>付费课程或学位的页面会引导至平台的联系渠道，不会在站内收取款项。</p>
        <p>采购、付款、退款、发票和交付范围以双方另行确认的书面合同或订单为准；本页面不虚构支付渠道或到账时限。</p>
      </>
    ),
  },
  {
    id: 'content',
    title: '内容与使用限制',
    content: (
      <ul>
        <li>不得未经授权复制、转售或公开传播受保护的课程内容。</li>
        <li>不得攻击服务、绕过权限、批量抓取非公开数据或干扰其他用户。</li>
        <li>用户对其提交的评论、笔记、作品和资料的合法性负责。</li>
      </ul>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalPage
      eyebrow="/ Service · Current Capabilities"
      title="服务与使用说明"
      subtitle="与当前系统真实能力一致；付费采购以双方书面合同为准"
      lastUpdated="2026-08-12"
      sections={SECTIONS}
    />
  );
}
