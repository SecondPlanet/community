import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  AI_JOB_QUEUE_NAME,
  AiJobQueue,
  AiJobQueuePayload,
} from './ai-job-queue';

@Injectable()
export class BullMqAiJobQueue extends AiJobQueue implements OnModuleDestroy {
  private readonly queue: Queue<AiJobQueuePayload>;

  constructor(config: ConfigService) {
    super();
    this.queue = new Queue(AI_JOB_QUEUE_NAME, {
      connection: {
        host: config.get<string>('REDIS_HOST') ?? 'localhost',
        port: Number(config.get<string>('REDIS_PORT')) || 6379,
        db: Number(config.get<string>('REDIS_DB')) || 0,
        password: config.get<string>('REDIS_PASSWORD') || undefined,
        maxRetriesPerRequest: 3,
      },
      prefix: config.get<string>('AI_JOB_QUEUE_PREFIX') ?? 'aicourse',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  async add(payload: AiJobQueuePayload): Promise<void> {
    const existing = await this.queue.getJob(payload.id);
    if (existing) {
      const state = await existing.getState();
      if (!['completed', 'failed', 'unknown'].includes(state)) return;
      await existing.remove().catch(() => undefined);
    }
    await this.queue.add(payload.type, payload, { jobId: payload.id });
  }

  async has(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    return !['completed', 'failed', 'unknown'].includes(state);
  }

  async remove(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
