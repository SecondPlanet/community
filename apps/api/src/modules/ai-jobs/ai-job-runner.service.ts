import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiEnqueueStatus,
  AiGenerationJob,
  AiJobStatus,
  LearningProjectStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiJobProviderBoundaryService } from './ai-job-provider-boundary.service';
import {
  AiJobLifecycleHooks,
  AiJobProcessingError,
  AiJobProcessor,
} from './ai-job-processor';

export interface AiJobAttempt {
  attemptNumber: number;
  maxAttempts: number;
}

export type AiJobRunOutcome = 'succeeded' | 'cancelled' | 'noop';

@Injectable()
export class AiJobRunnerService {
  private readonly workerId = `worker:${randomUUID()}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: AiJobProcessor,
    private readonly hooks: AiJobLifecycleHooks,
    private readonly config: ConfigService,
    private readonly providerBoundary: AiJobProviderBoundaryService,
  ) {}

  async run(jobId: string, attempt: AiJobAttempt): Promise<AiJobRunOutcome> {
    // Defense in depth for jobs that were already present in Redis when the
    // deploy-time kill switch was turned off. Leave the DB job queued so the
    // dispatcher can reconcile it after a deliberate re-enable.
    if (this.config.get<boolean>('AI_PERSONAL_COURSES_ENABLED') !== true) {
      return 'noop';
    }
    const now = new Date();
    const leaseExpiresAt = new Date(
      now.getTime() + this.numberConfig('AI_JOB_EXECUTION_LEASE_MS', 30_000),
    );
    const claimed = await this.prisma.aiGenerationJob.updateMany({
      where: {
        id: jobId,
        OR: [
          { status: AiJobStatus.queued },
          {
            status: AiJobStatus.running,
            OR: [
              { executionLeaseOwner: this.workerId },
              { executionLeaseExpiresAt: { lte: now } },
            ],
          },
        ],
      },
      data: {
        status: AiJobStatus.running,
        enqueueStatus: AiEnqueueStatus.enqueued,
        enqueueLeaseOwner: null,
        enqueueLeaseExpiresAt: null,
        executionLeaseOwner: this.workerId,
        executionLeaseExpiresAt: leaseExpiresAt,
        heartbeatAt: now,
        ...(attempt.attemptNumber === 1 ? { startedAt: now } : {}),
        errorCode: null,
        errorMessage: null,
      },
    });

    if (claimed.count !== 1) return this.replayOutcome(jobId);
    const job = await this.prisma.aiGenerationJob.findUnique({
      where: { id: jobId },
      include: { project: { select: { status: true } } },
    });
    if (!job) return 'noop';

    if (
      job.cancelRequestedAt ||
      job.project.status === LearningProjectStatus.archived
    ) {
      await this.markCancelled(job.id);
      await this.hooks.cancelled(job);
      return 'cancelled';
    }

    let timer: NodeJS.Timeout | undefined;
    let attemptAcquired = false;
    const attemptId = `${job.id}:${attempt.attemptNumber}:${randomUUID()}`;
    try {
      await this.hooks.acquireAttempt(job, attemptId);
      attemptAcquired = true;
      timer = setInterval(
        () => void this.heartbeatAttempt(job, attemptId).catch(() => undefined),
        this.numberConfig('AI_JOB_HEARTBEAT_INTERVAL_MS', 10_000),
      );
      timer.unref();

      const result = await this.processor.process(job, {
        heartbeat: () => this.heartbeatAttempt(job, attemptId),
        isCancellationRequested: () => this.isCancellationRequested(job.id),
        runProviderRequest: (call) => this.providerBoundary.run(job, call),
      });

      const outcome = await this.prisma.$transaction(async (tx) => {
        const current = await tx.aiGenerationJob.findUnique({
          where: { id: job.id },
          include: { project: { select: { status: true } } },
        });
        if (
          !current ||
          current.status !== AiJobStatus.running ||
          current.executionLeaseOwner !== this.workerId
        ) {
          return 'noop' as const;
        }
        if (
          current.cancelRequestedAt ||
          current.project.status === LearningProjectStatus.archived
        ) {
          await tx.aiGenerationJob.update({
            where: { id: job.id },
            data: this.cancelledData(),
          });
          return 'cancelled' as const;
        }

        const resultRef = await result.commit(tx);
        await tx.aiGenerationJob.update({
          where: { id: job.id },
          data: {
            status: AiJobStatus.succeeded,
            progress: 100,
            resultRef: resultRef ?? Prisma.JsonNull,
            finishedAt: new Date(),
            executionLeaseOwner: null,
            executionLeaseExpiresAt: null,
            heartbeatAt: null,
          },
        });
        return 'succeeded' as const;
      });
      if (outcome === 'cancelled') await this.hooks.cancelled(job);
      return outcome;
    } catch (error) {
      await this.handleFailure(job, attempt, error);
      throw error;
    } finally {
      if (timer) clearInterval(timer);
      if (attemptAcquired) await this.hooks.releaseAttempt(job, attemptId);
    }
  }

  private async handleFailure(
    job: AiGenerationJob,
    attempt: AiJobAttempt,
    error: unknown,
  ): Promise<void> {
    const retryable =
      !(error instanceof AiJobProcessingError) || error.retryable;
    const final = !retryable || attempt.attemptNumber >= attempt.maxAttempts;
    const errorCode =
      error instanceof AiJobProcessingError ? error.code : 'AI_JOB_FAILED';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!final) {
      await this.prisma.aiGenerationJob.updateMany({
        where: {
          id: job.id,
          status: AiJobStatus.running,
          executionLeaseOwner: this.workerId,
        },
        data: {
          status: AiJobStatus.queued,
          queueAttempts: { increment: 1 },
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          heartbeatAt: null,
          errorCode,
          errorMessage,
        },
      });
      return;
    }

    const failed = await this.prisma.aiGenerationJob.updateMany({
      where: {
        id: job.id,
        status: AiJobStatus.running,
        executionLeaseOwner: this.workerId,
      },
      data: {
        status: AiJobStatus.failed,
        queueAttempts: { increment: 1 },
        finishedAt: new Date(),
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        heartbeatAt: null,
        errorCode,
        errorMessage,
      },
    });
    if (failed.count !== 1) return;
    try {
      await this.processor.finalFailure?.(job, error);
    } finally {
      await this.hooks.finalFailure(job, error);
    }
  }

  private async replayOutcome(jobId: string): Promise<AiJobRunOutcome> {
    const current = await this.prisma.aiGenerationJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return current?.status === AiJobStatus.cancelled ? 'cancelled' : 'noop';
  }

  private async heartbeat(jobId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.aiGenerationJob.updateMany({
      where: {
        id: jobId,
        status: AiJobStatus.running,
        executionLeaseOwner: this.workerId,
      },
      data: {
        heartbeatAt: now,
        executionLeaseExpiresAt: new Date(
          now.getTime() + this.numberConfig('AI_JOB_EXECUTION_LEASE_MS', 30_000),
        ),
      },
    });
    return result.count === 1;
  }

  private async heartbeatAttempt(job: AiGenerationJob, attemptId: string): Promise<boolean> {
    const [dbLease, semaphoreLease] = await Promise.all([
      this.heartbeat(job.id),
      this.hooks.heartbeatAttempt(job, attemptId),
    ]);
    return dbLease && semaphoreLease;
  }

  private async isCancellationRequested(jobId: string): Promise<boolean> {
    const job = await this.prisma.aiGenerationJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        cancelRequestedAt: true,
        project: { select: { status: true } },
      },
    });
    return (
      !job ||
      job.status === AiJobStatus.cancelled ||
      !!job.cancelRequestedAt ||
      job.project.status === LearningProjectStatus.archived
    );
  }

  private async markCancelled(jobId: string): Promise<void> {
    await this.prisma.aiGenerationJob.updateMany({
      where: {
        id: jobId,
        status: AiJobStatus.running,
        executionLeaseOwner: this.workerId,
      },
      data: this.cancelledData(),
    });
  }

  private cancelledData() {
    return {
      status: AiJobStatus.cancelled,
      enqueueStatus: AiEnqueueStatus.cancelled,
      finishedAt: new Date(),
      executionLeaseOwner: null,
      executionLeaseExpiresAt: null,
      heartbeatAt: null,
    };
  }

  private numberConfig(key: string, fallback: number): number {
    return Number(this.config.get<number>(key)) || fallback;
  }
}
