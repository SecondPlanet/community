/**
 * ChatCapabilityService — v1.9-alpha.2 (batch-6 C-09' + A-08)
 *
 * 让 chat 与课程生成网关遵守同一套规则:
 * - BYOK 路径(getUserActive → config) + 当日额度未用完 → 放行
 * - 当日额度用完 → 429 AI_BUDGET_EXCEEDED (前端按 BUDGET_DISABLED 提示)
 * - 没有可用 BYOK 配置 → 503 AI_PROVIDER_NOT_CONFIGURED
 *
 * 社区版没有平台托管 key, 也没有平台预算开关; 按用户配额由 Redis 里的
 * BYOK 日额度守卫负责(不落业务库)。
 *
 * 两个公开方法:
 * - assertChatAllowed(userId): 用于 chat 流/非流路径, 失败抛 HttpException
 *   (503), 让 controller 映射到对应 HTTP 状态码。
 * - getChatCapability(userId): 用于 GET /chat/capabilities, 仅返回
 *   {enabled, reason} 不抛错, 让前端禁用输入框。
 */
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserAiProviderConfigService } from '../ai/user-ai-provider-config.service';
import { AiByokQuotaService } from '../ai-model-gateway/ai-byok-quota.service';

export type ChatCapabilityReason = 'NOT_CONFIGURED' | 'BUDGET_DISABLED';

export interface ChatCapability {
  enabled: boolean;
  reason?: ChatCapabilityReason;
}

@Injectable()
export class ChatCapabilityService {
  constructor(
    private readonly userProviders: UserAiProviderConfigService,
    private readonly quota: AiByokQuotaService,
  ) {}

  /**
   * chat 路径必须在落 user message / RAG 之前调用, 失败抛 HttpException。
   */
  async assertChatAllowed(userId: string): Promise<void> {
    const cap = await this.getChatCapability(userId);
    if (cap.enabled) return;
    if (cap.reason === 'BUDGET_DISABLED') {
      // 对象体带 code 字段, 前端 friendlySendError 直接按 code 走文案分支。
      throw new HttpException(
        { code: 'AI_BUDGET_EXCEEDED', message: 'AI_BUDGET_EXCEEDED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // NOT_CONFIGURED — 没配 BYOK → 503
    throw new ServiceUnavailableException({
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      message: 'AI_PROVIDER_NOT_CONFIGURED',
    });
  }

  /**
   * v1.9-alpha.2 (batch-6 A-08): GET /chat/capabilities 的返回体。
   * 不抛错, 失败状态作为返回值里的 reason。
   */
  async getChatCapability(userId: string): Promise<ChatCapability> {
    const userConfig = await this.userProviders.getUserActive(userId);
    if (!userConfig) return { enabled: false, reason: 'NOT_CONFIGURED' };
    // 用户自己的 key 也有日配额, 用完了就不要再让前端发消息。
    if (await this.quota.isExhausted(userId)) {
      return { enabled: false, reason: 'BUDGET_DISABLED' };
    }
    return { enabled: true };
  }
}
