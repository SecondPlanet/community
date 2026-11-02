/**
 * cms.safeNavPath.test.ts — 锁住 nav path 白名单行为,防 XSS 回归
 *
 * P0 安全加固 2026-07-23: 之前 Layout.tsx 把 CMS path 直接绑 href,
 * admin 被 compromise 后可塞 javascript:alert(1) / data:text/html 触发 XSS。
 * safeNavPath() 在 lib/cms.ts 统一过滤, 这里锁行为。
 */
import { describe, it, expect } from 'vitest';
import { safeNavPath } from './cms';

describe('safeNavPath — nav path 白名单 (P0 2026-07-23)', () => {
  it('内部 / 路由放行', () => {
    expect(safeNavPath('/courses')).toBe('/courses');
    expect(safeNavPath('/admin/dashboard')).toBe('/admin/dashboard');
    expect(safeNavPath('/')).toBe('/');
  });

  it('http(s) 外部 URL 放行', () => {
    expect(safeNavPath('https://secondplanet.local')).toBe('https://secondplanet.local');
    expect(safeNavPath('http://example.com/foo')).toBe('http://example.com/foo');
  });

  it('javascript: 协议降级为 #', () => {
    expect(safeNavPath('javascript:alert(1)')).toBe('#');
    expect(safeNavPath('JAVASCRIPT:alert(1)')).toBe('#');
    expect(safeNavPath('JavaScript:fetch("/steal")')).toBe('#');
  });

  it('data: 协议降级为 #', () => {
    expect(safeNavPath('data:text/html,<script>alert(1)</script>')).toBe('#');
  });

  it('vbscript: 协议降级为 #', () => {
    expect(safeNavPath('vbscript:msgbox(1)')).toBe('#');
  });

  it('协议相对 URL (//foo) 降级为 #', () => {
    // //foo.com 是协议相对 URL,会被浏览器当 https 解析,有 phishing 风险
    expect(safeNavPath('//evil.com/path')).toBe('#');
  });

  it('mailto: / tel: 放行', () => {
    expect(safeNavPath('mailto:foo@bar.example')).toBe('mailto:foo@bar.example');
    expect(safeNavPath('tel:+8613800000000')).toBe('tel:+8613800000000');
  });

  it('锚点放行', () => {
    expect(safeNavPath('#section')).toBe('#section');
  });

  it('空 / 非字符串 / 异常值降级为 #', () => {
    expect(safeNavPath('')).toBe('#');
    expect(safeNavPath(null)).toBe('#');
    expect(safeNavPath(undefined)).toBe('#');
    expect(safeNavPath(123)).toBe('#');
    expect(safeNavPath({})).toBe('#');
  });

  it('trim 前后空白', () => {
    expect(safeNavPath('  /courses  ')).toBe('/courses');
    expect(safeNavPath('  javascript:alert(1)  ')).toBe('#');
  });
});
