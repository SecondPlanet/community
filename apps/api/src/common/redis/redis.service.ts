import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 连接持有者 (P0 v1.5.4 横向扩展)
 *
 * 抽到 common/redis/ 而不是 inline 在 app.module.ts 创建, 因为:
 * 1) ThrottlerStorageRedisService 和 health check 都要复用同一连接 — 避免
 *    app 起来多连一个 (虽然 throttler 自己有 lazy connect, 但运维角度仍不优雅)
 * 2) 单元测试可注入 mock client, 不依赖真 redis (跟 prisma.service 同样套路)
 * 3) 未来 cache / session / pubsub 都可注入同一 client
 *
 * 设计参考 prisma.service (OnModuleInit/OnModuleDestroy 配对), 区别: ioredis
 * 是 lazy-connect, 不会启动时阻塞; onModuleInit 只做 log + 健康检查可选, 不强制 ping
 * (避免 redis 临时不可用拖死 app boot — throttler 自己会在第一次请求时报错暴露).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const host = this.config.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number(this.config.get<string>('REDIS_PORT')) || 6379;
    const db = Number(this.config.get<string>('REDIS_DB')) || 0;
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;

    this.client = new Redis({
      host,
      port,
      db,
      password,
      // 重连: 默认 exponential 即可, 5 次后停 (避免拖死 app)
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.client.on('error', (err) => {
      // ioredis 在断线时频繁 emit error, 限到 warn 级别避免刷屏
      this.logger.warn(`redis error: ${err.message}`);
    });
    this.client.on('connect', () => {
      this.logger.log(`redis connected: ${host}:${port}/db${db}`);
    });
  }

  async onModuleInit() {
    // 不强制 ping, 见 class 注释. lazyConnect=false 的话 ioredis 会自己 connect
    // 我们只是 log 一下 ready 状态 (event-based).
    this.logger.log('RedisService initialized');
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => {
      // quit 在已经 close 的 client 上会抛, 静默吞
    });
  }

  /**
   * 暴露原生 ioredis client, 供 ThrottlerStorageRedisService 等需要 Redis/Cluster 实例的 consumer 注入.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * 健康检查: PING -> PONG. 失败返 false (供 /health/ready 聚合用).
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (err) {
      this.logger.warn(`redis ping failed: ${(err as Error).message}`);
      return false;
    }
  }
}
