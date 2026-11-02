import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueEvents, UnrecoverableError, Worker } from 'bullmq';
import { AI_JOB_QUEUE_NAME, AiJobQueuePayload } from './ai-job-queue';
import { AiJobRunnerService } from './ai-job-runner.service';
import { AiJobProcessingError } from './ai-job-processor';
import { AiWorkerHeartbeatService } from './ai-worker-heartbeat.service';
import { randomUUID } from 'crypto';

@Injectable()
export class AiJobWorkerRuntimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AiJobWorkerRuntimeService.name);
  private worker?: Worker<AiJobQueuePayload>;
  private queueEvents?: QueueEvents;

  constructor(
    private readonly runner: AiJobRunnerService,
    private readonly config: ConfigService,
    private readonly heartbeat: AiWorkerHeartbeatService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (
      this.config.get<boolean>('AI_JOB_WORKER_ENABLED') !== true ||
      this.config.get<boolean>('AI_PERSONAL_COURSES_ENABLED') !== true
    ) return;
    const prefix = this.config.get<string>('AI_JOB_QUEUE_PREFIX') ?? 'aicourse';
    const connection = () => ({
      host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(this.config.get<string>('REDIS_PORT')) || 6379,
      db: Number(this.config.get<string>('REDIS_DB')) || 0,
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    });

    this.queueEvents = new QueueEvents(AI_JOB_QUEUE_NAME, {
      connection: connection(),
      prefix,
    });
    this.worker = new Worker<AiJobQueuePayload>(
      AI_JOB_QUEUE_NAME,
      async (bullJob) => {
        try {
          await this.runner.run(bullJob.data.id, {
            attemptNumber: bullJob.attemptsMade + 1,
            maxAttempts: bullJob.opts.attempts ?? 1,
          });
        } catch (error) {
          if (error instanceof AiJobProcessingError && !error.retryable) {
            throw new UnrecoverableError(error.message);
          }
          throw error;
        }
      },
      {
        connection: connection(),
        prefix,
        concurrency: Number(this.config.get<number>('AI_JOB_CONCURRENCY')) || 2,
      },
    );
    this.worker.on('error', (error) =>
      this.logger.error(`AI worker error: ${error.message}`),
    );
    this.queueEvents.on('failed', ({ jobId, failedReason }) =>
      this.logger.warn(`AI queue job ${jobId} failed: ${failedReason}`),
    );
    await Promise.all([this.worker.waitUntilReady(), this.queueEvents.waitUntilReady()]);
    await this.heartbeat.start(`ai-worker:${randomUUID()}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await this.worker.close();
    this.heartbeat.stop();
    if (this.queueEvents) await this.queueEvents.close();
  }
}
