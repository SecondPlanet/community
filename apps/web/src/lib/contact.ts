/**
 * contact.ts — 社区版联系入口
 *
 * 企业版的「企业咨询」表单已从社区版移除。购买咨询、订单付款/退款协助、
 * 账号申诉、内容受限反馈等需要人工处理的场景统一走这里:
 *   - 配了 VITE_PUBLIC_CONTACT_EMAIL → mailto(带 subject/body 业务上下文)
 *   - 没配 → 社区 GitHub Issue(README 公布的社区反馈渠道)
 *
 * 返回的是 href(mailto: 或 https:),渲染处要用 <a> 而不是 react-router 的 <Link>。
 */
const CONTACT_EMAIL = import.meta.env.VITE_PUBLIC_CONTACT_EMAIL?.trim() ?? '';

export const contactEmail = CONTACT_EMAIL;

export function contactHref(subject?: string, body?: string): string {
  if (!CONTACT_EMAIL) return 'https://github.com/SecondPlanet/community/issues';
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return `mailto:${CONTACT_EMAIL}${query ? `?${query}` : ''}`;
}
