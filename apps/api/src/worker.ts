import { NestFactory } from '@nestjs/core';
import { AiJobsWorkerAppModule } from './modules/ai-jobs/ai-jobs-worker-app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AiJobsWorkerAppModule);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
}

void bootstrap();
