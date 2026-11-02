import { Module } from '@nestjs/common';
import { AiJobQueue } from './ai-job-queue';
import { BullMqAiJobQueue } from './bullmq-ai-job-queue.service';
import { AiJobDispatcherService } from './ai-job-dispatcher.service';
import { AiWorkerHeartbeatService } from './ai-worker-heartbeat.service';
import { AiProviderDeadlineJanitorService } from './ai-provider-deadline-janitor.service';

@Module({
  providers: [
    BullMqAiJobQueue,
    { provide: AiJobQueue, useExisting: BullMqAiJobQueue },
    AiJobDispatcherService,
    AiWorkerHeartbeatService,
    AiProviderDeadlineJanitorService,
  ],
  exports: [AiJobQueue, AiJobDispatcherService, AiWorkerHeartbeatService, AiProviderDeadlineJanitorService],
})
export class AiJobsModule {}
