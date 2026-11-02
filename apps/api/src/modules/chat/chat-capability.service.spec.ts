/**
 * ChatCapabilityService — 社区版 (BYOK only)
 *
 * 3 个状态覆盖:
 * 1) BYOK 配置存在 + 额度没用完 → enabled=true
 * 2) BYOK 配置存在 + 当日额度用完 → enabled=false, reason=BUDGET_DISABLED
 * 3) 没有 BYOK 配置 → enabled=false, reason=NOT_CONFIGURED
 *
 * assertChatAllowed 抛错映射:
 * - BUDGET_DISABLED → 429 AI_BUDGET_EXCEEDED (HttpException)
 * - NOT_CONFIGURED → 503 AI_PROVIDER_NOT_CONFIGURED (ServiceUnavailableException)
 */
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatCapabilityService } from './chat-capability.service';

describe('ChatCapabilityService', () => {
  let userProviders: any;
  let quota: any;
  let svc: ChatCapabilityService;

  beforeEach(() => {
    userProviders = {
      getUserActive: jest.fn().mockResolvedValue(null),
    };
    quota = {
      isExhausted: jest.fn().mockResolvedValue(false),
    };
    svc = new ChatCapabilityService(userProviders, quota);
  });

  describe('getChatCapability', () => {
    it('BYOK 配置存在 + 额度未用完 → enabled=true', async () => {
      userProviders.getUserActive.mockResolvedValue({ provider: 'openai', apiKey: 'k' });
      const cap = await svc.getChatCapability('u-1');
      expect(cap).toEqual({ enabled: true });
      expect(quota.isExhausted).toHaveBeenCalledWith('u-1');
    });

    it('BYOK 配置存在 + 当日额度用完 → enabled=false, reason=BUDGET_DISABLED', async () => {
      userProviders.getUserActive.mockResolvedValue({ provider: 'openai', apiKey: 'k' });
      quota.isExhausted.mockResolvedValue(true);
      const cap = await svc.getChatCapability('u-1');
      expect(cap).toEqual({ enabled: false, reason: 'BUDGET_DISABLED' });
    });

    it('没有 BYOK 配置 → enabled=false, reason=NOT_CONFIGURED', async () => {
      userProviders.getUserActive.mockResolvedValue(null);
      const cap = await svc.getChatCapability('u-1');
      expect(cap).toEqual({ enabled: false, reason: 'NOT_CONFIGURED' });
    });
  });

  describe('assertChatAllowed', () => {
    it('放行: enabled=true 不抛错', async () => {
      userProviders.getUserActive.mockResolvedValue({ provider: 'openai', apiKey: 'k' });
      await expect(svc.assertChatAllowed('u-1')).resolves.toBeUndefined();
    });

    it('拒绝: BUDGET_DISABLED → 429 HttpException({code, message})', async () => {
      userProviders.getUserActive.mockResolvedValue({ provider: 'openai', apiKey: 'k' });
      quota.isExhausted.mockResolvedValue(true);
      let captured: unknown;
      try {
        await svc.assertChatAllowed('u-1');
      } catch (e) {
        captured = e;
      }
      expect(captured).toBeInstanceOf(HttpException);
      const ex = captured as HttpException;
      expect(ex.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = ex.getResponse() as { code?: string; message?: string };
      expect(body.code).toBe('AI_BUDGET_EXCEEDED');
      expect(body.message).toBe('AI_BUDGET_EXCEEDED');
    });

    it('拒绝: NOT_CONFIGURED → 503 ServiceUnavailableException({code, message})', async () => {
      userProviders.getUserActive.mockResolvedValue(null);
      let captured: unknown;
      try {
        await svc.assertChatAllowed('u-1');
      } catch (e) {
        captured = e;
      }
      expect(captured).toBeInstanceOf(ServiceUnavailableException);
      const ex = captured as ServiceUnavailableException;
      expect(ex.getStatus()).toBe(503);
      const body = ex.getResponse() as { code?: string; message?: string };
      expect(body.code).toBe('AI_PROVIDER_NOT_CONFIGURED');
      expect(body.message).toBe('AI_PROVIDER_NOT_CONFIGURED');
    });
  });
});
