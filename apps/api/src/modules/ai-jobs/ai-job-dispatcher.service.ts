import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiEnqueueStatus, AiJobStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiJobQueue } from './ai-job-queue';

@Injectable()
export class AiJobDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiJobDispatcherService.name);
  private readonly dispatcherId = `dispatcher:${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AiJobQueue,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.numberConfig('AI_JOB_DISPATCH_INTERVAL_MS', 1_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    const deadline = Date.now() + 5_000;
    while (this.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (this.running) this.logger.warn('Timed out draining AI job dispatcher');
  }

  async dispatchPending(now = new Date()): Promise<number> {
    const candidates = await this.prisma.aiGenerationJob.findMany({
      where: {
        status: AiJobStatus.queued,
        enqueueStatus: AiEnqueueStatus.pending,
        AND: [
          { OR: [{ nextEnqueueAt: null }, { nextEnqueueAt: { lte: now } }] },
          {
            OR: [
              { enqueueLeaseExpiresAt: null },
              { enqueueLeaseExpiresAt: { lte: now } },
            ],
          },
        ],
      },
      select: { id: true, type: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    let dispatched = 0;
    for (const candidate of candidates) {
      const leaseExpiresAt = new Date(
        now.getTime() + this.numberConfig('AI_JOB_ENQUEUE_LEASE_MS', 30_000),
      );
      const claimed = await this.prisma.aiGenerationJob.updateMany({
        where: {
          id: candidate.id,
          status: AiJobStatus.queued,
          enqueueStatus: AiEnqueueStatus.pending,
          OR: [
            { enqueueLeaseExpiresAt: null },
            { enqueueLeaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          enqueueLeaseOwner: this.dispatcherId,
          enqueueLeaseExpiresAt: leaseExpiresAt,
        },
      });
      if (claimed.count !== 1) continue;

      try {
        await this.queue.add(candidate);
        await this.prisma.aiGenerationJob.updateMany({
          where: {
            id: candidate.id,
            enqueueStatus: AiEnqueueStatus.pending,
            enqueueLeaseOwner: this.dispatcherId,
          },
          data: {
            enqueueStatus: AiEnqueueStatus.enqueued,
            enqueueLeaseOwner: null,
            enqueueLeaseExpiresAt: null,
            nextEnqueueAt: null,
          },
        });
        dispatched++;
      } catch (error) {
        await this.prisma.aiGenerationJob.updateMany({
          where: { id: candidate.id, enqueueLeaseOwner: this.dispatcherId },
          data: {
            enqueueLeaseOwner: null,
            enqueueLeaseExpiresAt: null,
            nextEnqueueAt: new Date(now.getTime() + 1_000),
          },
        });
        this.logger.warn(`Failed to enqueue AI job ${candidate.id}: ${this.message(error)}`);
      }
    }
    return dispatched;
  }

  async reconcileMissing(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.numberConfig('AI_JOB_RECONCILE_AGE_MS', 60_000),
    );
    const candidates = await this.prisma.aiGenerationJob.findMany({
      where: {
        status: AiJobStatus.queued,
        enqueueStatus: AiEnqueueStatus.enqueued,
        updatedAt: { lte: cutoff },
      },
      select: { id: true, type: true },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });

    let restored = 0;
    for (const candidate of candidates) {
      if (await this.queue.has(candidate.id)) continue;
      await this.queue.add(candidate);
      restored++;
    }
    return restored;
  }

  async reconcileExpiredExecutions(now = new Date()): Promise<number> {
    const result = await this.prisma.aiGenerationJob.updateMany({
      where: {
        status: AiJobStatus.running,
        executionLeaseExpiresAt: { lte: now },
        // Provider-in-flight expiry needs usage/reservation settlement and is
        // intentionally left to the later provider-deadline janitor.
        providerRequestStartedAt: null,
      },
      data: {
        status: AiJobStatus.queued,
        queueAttempts: { increment: 1 },
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        heartbeatAt: null,
        errorCode: 'WORKER_LEASE_EXPIRED',
        errorMessage: 'Worker execution lease expired before provider request',
      },
    });
    return result.count;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcileExpiredExecutions();
      // Lease cleanup must continue while the feature is disabled, but no DB
      // outbox row may be added/re-added to Redis until it is enabled again.
      if (this.config.get<boolean>('AI_PERSONAL_COURSES_ENABLED') === true) {
        await this.dispatchPending();
        await this.reconcileMissing();
      }
    } catch (error) {
      this.logger.error(`AI job dispatch tick failed: ${this.message(error)}`);
    } finally {
      this.running = false;
    }
  }

  private numberConfig(key: string, fallback: number): number {
    return Number(this.config.get<number>(key)) || fallback;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
