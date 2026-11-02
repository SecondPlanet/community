/**
 * chatErrors — v1.9-alpha.1 (B-03) 抽出后回归测试
 *
 * 覆盖:
 *   - 三个已知错误码返回对应文案
 *   - 未知 code 走 extractErrorMessage fallback
 *   - 非 axios 错(纯 Error)走 fallback
 *   - 后端 message 优先于 code (既有 extractErrorMessage 行为)
 */
import { describe, it, expect } from 'vitest';
import { friendlySendError } from './chatErrors';

describe('friendlySendError (B-03)', () => {
  it('CONTENT_RESTRICTED → 安全策略文案', () => {
    expect(
      friendlySendError({ response: { data: { code: 'CONTENT_RESTRICTED' } } }),
    ).toBe('这条内容触发了安全策略，请换个问法');
  });

  it('AI_BUDGET_EXCEEDED → 额度文案', () => {
    expect(
      friendlySendError({ response: { data: { code: 'AI_BUDGET_EXCEEDED' } } }),
    ).toBe('平台 AI 额度已用完，请联系管理员或稍后再试');
  });

  it('AI_PROVIDER_TIMEOUT → 超时文案', () => {
    expect(
      friendlySendError({ response: { data: { code: 'AI_PROVIDER_TIMEOUT' } } }),
    ).toBe('AI 服务响应超时，请稍后再试');
  });

  it('未知 code 走 fallback (默认 "发送失败,请稍后重试")', () => {
    expect(
      friendlySendError({ response: { data: { code: 'SOMETHING_NEW' } } }),
    ).toBe('发送失败，请稍后重试');
  });

  it('裸 Error → fallback', () => {
    expect(friendlySendError(new Error('网络断了'))).toBe('网络断了');
  });

  it('后端带 message 时优先于 fallback 默认值', () => {
    expect(
      friendlySendError({ response: { data: { code: 'X', message: '具体原因' } } }),
    ).toBe('具体原因');
  });

  it('空对象 → fallback', () => {
    expect(friendlySendError({})).toBe('发送失败，请稍后重试');
  });

  // v1.9-alpha.2 (batch-6 C-09'): 平台 AI 闸门错误码
  it('AI_PLATFORM_BUDGET_DISABLED → 平台关停文案', () => {
    expect(
      friendlySendError({ response: { data: { code: 'AI_PLATFORM_BUDGET_DISABLED' } } }),
    ).toBe('平台 AI 已被管理员临时关闭，请稍后再试或自备 AI Key');
  });

  it('AI_PROVIDER_NOT_CONFIGURED → 未配置文案', () => {
    expect(
      friendlySendError({ response: { data: { code: 'AI_PROVIDER_NOT_CONFIGURED' } } }),
    ).toBe('AI 服务尚未配置，请联系管理员');
  });
});
