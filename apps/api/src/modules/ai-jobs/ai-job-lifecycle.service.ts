import { Injectable } from '@nestjs/common';
import { AiGenerationJob } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiJobLifecycleHooks, AiJobProcessingError } from './ai-job-processor';
import { AiJobSemaphore } from './ai-job-semaphore';

@Injectable()
export class AiJobLifecycleService extends AiJobLifecycleHooks {
  constructor(
    private readonly semaphore: AiJobSemaphore,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async acquireAttempt(job: AiGenerationJob, attemptId: string): Promise<void> {
    if (!(await this.semaphore.acquire(job.userId, attemptId))) {
      throw new AiJobProcessingError(
        'AI_USER_CONCURRENCY_LIMIT',
        true,
        'The user already has the maximum number of AI jobs running',
      );
    }
  }

  async heartbeatAttempt(job: AiGenerationJob, attemptId: string): Promise<boolean> {
    return this.semaphore.acquire(job.userId, attemptId);
  }

  async releaseAttempt(job: AiGenerationJob, attemptId: string): Promise<void> {
    await this.semaphore.release(job.userId, attemptId);
  }
}
