import { describe, expect, it } from 'vitest';
import { contactHref } from './contact';

describe('contactHref', () => {
  it('未配置联系邮箱时指向社区 Issue', () => {
    // 测试环境不注入 VITE_PUBLIC_CONTACT_EMAIL,走 GitHub Issue 兜底。
    expect(contactHref()).toBe('https://github.com/SecondPlanet/community/issues');
  });

  it('总是返回一个可用的外部联系入口', () => {
    expect(contactHref('主题', '正文')).toMatch(/^(mailto:|https:\/\/github\.com\/)/);
  });
});
