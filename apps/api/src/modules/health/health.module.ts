import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';

/**
 * Health module
 *
 * RedisService 来自全局 RedisModule (不必显式 import).
 * PrismaService 来自全局 PrismaModule (不必显式 import).
 * ConfigService 来自全局 ConfigModule (不必显式 import).
 */
@Module({
  imports: [AiJobsModule],
  controllers: [HealthController],
})
export class HealthModule {}
