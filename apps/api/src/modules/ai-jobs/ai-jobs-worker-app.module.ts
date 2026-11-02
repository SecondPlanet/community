import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAiPersonalCourseEnv } from '../../config/ai-personal-courses.config';
import { PrismaModule } from '../prisma/prisma.module';
import { AiJobsWorkerModule } from './ai-jobs-worker.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AiModelGatewayModule } from '../ai-model-gateway/ai-model-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateAiPersonalCourseEnv,
    }),
    PrismaModule,
    RedisModule,
    AiModelGatewayModule,
    AiJobsWorkerModule,
  ],
})
export class AiJobsWorkerAppModule {}
