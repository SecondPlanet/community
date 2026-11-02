import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * 全局 Redis 模块 (P0 v1.5.4 横向扩展)
 *
 * @Global() 让所有 module 不用显式 import 就能 @Inject() RedisService.
 * ThrottlerModule.forRootAsync 跟 HealthModule 是主要 consumer.
 *
 * 注意: ThrottlerStorageRedisService 的 prefix (key 命名空间) 不在 module 层面配,
 * 而是在 app.module.ts 的 ThrottlerModule.forRootAsync useFactory 里读
 * THROTTLER_REDIS_PREFIX env, 因为 prefix 跟 throttler 业务绑死, 跟"通用 redis client"
 * 不是同一概念.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
