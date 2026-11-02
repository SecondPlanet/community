import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

export abstract class AiJobSemaphore {
  abstract acquire(userId: string, holderId: string): Promise<boolean>;
  abstract release(userId: string, holderId: string): Promise<void>;
}

@Injectable()
export class RedisAiJobSemaphore extends AiJobSemaphore {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async acquire(userId: string, holderId: string): Promise<boolean> {
    const now = Date.now();
    const ttlMs = this.numberConfig('AI_JOB_SEMAPHORE_TTL_MS', 45_000);
    const result = await this.redis.getClient().eval(
      `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
       if redis.call('ZSCORE', KEYS[1], ARGV[2]) then
         redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
         redis.call('PEXPIRE', KEYS[1], ARGV[4])
         return 1
       end
       if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[5]) then return 0 end
       redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
       redis.call('PEXPIRE', KEYS[1], ARGV[4])
       return 1`,
      1,
      this.key(userId),
      now,
      holderId,
      now + ttlMs,
      ttlMs * 2,
      this.numberConfig('AI_JOB_USER_CONCURRENCY', 2),
    );
    return Number(result) === 1;
  }

  async release(userId: string, holderId: string): Promise<void> {
    await this.redis.getClient().zrem(this.key(userId), holderId);
  }

  private key(userId: string): string {
    const prefix = this.config.get<string>('AI_JOB_QUEUE_PREFIX') || 'aicourse';
    return `${prefix}:ai-job:user-semaphore:${userId}`;
  }

  private numberConfig(key: string, fallback: number): number {
    return Number(this.config.get<number>(key)) || fallback;
  }
}

export class InMemoryAiJobSemaphore extends AiJobSemaphore {
  private readonly holders = new Map<string, Set<string>>();

  constructor(private readonly limit = 2) {
    super();
  }

  async acquire(userId: string, holderId: string): Promise<boolean> {
    const holders = this.holders.get(userId) ?? new Set<string>();
    if (!holders.has(holderId) && holders.size >= this.limit) return false;
    holders.add(holderId);
    this.holders.set(userId, holders);
    return true;
  }

  async release(userId: string, holderId: string): Promise<void> {
    const holders = this.holders.get(userId);
    holders?.delete(holderId);
    if (holders?.size === 0) this.holders.delete(userId);
  }
}
