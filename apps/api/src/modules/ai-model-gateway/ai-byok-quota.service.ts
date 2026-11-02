import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

/** 与被删掉的预算账本保持一致的默认日额度 (0 / 负数 = 不限)。 */
const DEFAULT_DAILY_BYOK_TOKENS = 500_000;

/** 粗略估算一次调用的最坏 token 数 (输入按 4 字符/token)。 */
export function estimateAiTokens(prompt: string, maxOutputTokens: number): number {
  return Math.ceil(prompt.length / 4) + maxOutputTokens;
}

/**
 * 按用户 BYOK 日配额守卫。
 *
 * 社区版没有平台预算账本 (已删), 但仍然要防止
 * 单个用户把自己的 key 打爆: 计数放在 Redis, 当天过期, 不落业务库。
 *
 * 语义与被删掉的预算账本一致:
 * - 每个用户每个自然日 (UTC) 一个 token 额度;
 * - 请求前按最坏情况预占, 超额直接 429 `AI_BUDGET_EXCEEDED`;
 * - `isExhausted` 供 capabilities 这类只读提示接口使用。
 */
@Injectable()
export class AiByokQuotaService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /** 预占最坏情况 token; 超额抛 429 AI_BUDGET_EXCEEDED。 */
  async reserve(userId: string, tokens: number): Promise<void> {
    const limit = this.dailyLimit();
    const amount = Math.max(0, Math.round(tokens));
    const allowed = await this.redis.getClient().eval(
      `local used = tonumber(redis.call('GET', KEYS[1]) or '0')
       local limit = tonumber(ARGV[1])
       if limit <= 0 or used + tonumber(ARGV[2]) <= limit then
         redis.call('INCRBY', KEYS[1], ARGV[2])
         redis.call('PEXPIREAT', KEYS[1], ARGV[3])
         return 1
       end
       return 0`,
      1,
      this.key(userId),
      limit,
      amount,
      this.dayEndMs(),
    );
    if (Number(allowed) !== 1) {
      throw new HttpException(
        {
          code: 'AI_BUDGET_EXCEEDED',
          message: 'AI_BUDGET_EXCEEDED',
          reason: 'USER_DAILY_TOKENS',
          retryAfter: this.secondsUntilNextDay(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** 只读判断: 用户今天的额度是否已经用完。 */
  async isExhausted(userId: string): Promise<boolean> {
    const limit = this.dailyLimit();
    if (limit <= 0) return false;
    const used = Number(await this.redis.getClient().get(this.key(userId))) || 0;
    return used >= limit;
  }

  private dailyLimit(): number {
    const configured = Number(this.config.get<number>('AI_USER_DAILY_BYOK_TOKENS'));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DAILY_BYOK_TOKENS;
  }

  private key(userId: string): string {
    const prefix = this.config.get<string>('AI_BYOK_QUOTA_PREFIX') || 'sp';
    return `${prefix}:ai-byok-quota:${userId}:${new Date().toISOString().slice(0, 10)}`;
  }

  private secondsUntilNextDay(): number {
    return Math.max(1, Math.ceil((this.dayEndMs() - Date.now()) / 1000));
  }

  private dayEndMs(): number {
    const now = new Date();
    return Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
  }
}
