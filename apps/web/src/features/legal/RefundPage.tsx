import { LegalPage, type LegalSection } from './LegalPage';

const SECTIONS: LegalSection[] = [
  {
    id: 'availability',
    title: '当前支付状态',
    content: (
      <p><strong>当前公开版本未开放在线支付和在线退款。</strong>付费内容会引导用户通过平台联系渠道提交购买咨询，不会在本平台内扣款，因此也不存在站内“原路退款”或固定到账时限。</p>
    ),
  },
  {
    id: 'purchase',
    title: '付费采购与退款',
    content: (
      <p>通过平台联系渠道达成的采购，其价格、交付、取消、退款、税费和发票规则以双方签署的合同或订单为唯一依据。请在联系时提供订单或合同编号，由维护者按书面约定处理。</p>
    ),
  },
  {
    id: 'test-data',
    title: '测试数据',
    content: (
      <p>开发和自动化测试环境可能生成标记为 mock 的订单记录，用于验证流程。这些记录不代表真实付款、不得产生对外结算或退款权益，也不应被导入生产业务数据。</p>
    ),
  },
  {
    id: 'contact',
    title: '联系处理',
    content: (
      <p>如发现重复记录、错误开通或合同履约问题，请通过平台联系渠道提交账户邮箱、项目名称和相关编号。请勿在联系内容中提交银行卡号、密码或验证码。</p>
    ),
  },
];

export function RefundPage() {
  return (
    <LegalPage
      eyebrow="/ Commercial · Refund Availability"
      title="付款与退款说明"
      subtitle="当前版本不虚构未接入的支付渠道、退款流程或到账承诺"
      lastUpdated="2026-08-12"
      sections={SECTIONS}
    />
  );
}
