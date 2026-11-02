import { ConfigService } from '@nestjs/config';
import { AiEnqueueStatus, AiJobStatus, AiJobType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiJobDispatcherService } from './ai-job-dispatcher.service';
import { InMemoryAiJobQueue } from './in-memory-ai-job-queue';

describe('AiJobDispatcherService', () => {
  const prisma = {
    aiGenerationJob: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, number | boolean> = {
        AI_PERSONAL_COURSES_ENABLED: false,
        AI_JOB_ENQUEUE_LEASE_MS: 30_000,
        AI_JOB_RECONCILE_AGE_MS: 60_000,
      };
      return values[key];
    }),
  };
  let queue: InMemoryAiJobQueue;
  let service: AiJobDispatcherService;

  beforeEach(() => {
    jest.clearAllMocks();
    queue = new InMemoryAiJobQueue();
    service = new AiJobDispatcherService(
      prisma as unknown as PrismaService,
      queue,
      config as unknown as ConfigService,
    );
  });

  it('uses the DB id as an idempotent queue job id', async () => {
    await queue.add({ id: 'job-1', type: AiJobType.course_plan });
    await queue.add({ id: 'job-1', type: AiJobType.course_plan });

    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get('job-1')).toEqual({
      id: 'job-1',
      type: AiJobType.course_plan,
    });
  });

  it('leases a pending outbox row, adds it, then marks it enqueued', async () => {
    prisma.aiGenerationJob.findMany.mockResolvedValue([
      { id: 'job-1', type: AiJobType.course_plan },
    ]);
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.dispatchPending(new Date('2026-08-22T00:00:00Z')))
      .resolves.toBe(1);

    expect(queue.jobs.has('job-1')).toBe(true);
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'job-1',
          enqueueStatus: AiEnqueueStatus.pending,
        }),
        data: expect.objectContaining({
          enqueueStatus: AiEnqueueStatus.enqueued,
          enqueueLeaseOwner: null,
          enqueueLeaseExpiresAt: null,
        }),
      }),
    );
  });

  it('re-adds an enqueued/queued DB job missing from Redis', async () => {
    prisma.aiGenerationJob.findMany.mockResolvedValue([
      { id: 'missing-job', type: AiJobType.lesson_content },
    ]);

    await expect(service.reconcileMissing(new Date('2026-08-22T00:02:00Z')))
      .resolves.toBe(1);

    expect(queue.jobs.get('missing-job')).toEqual({
      id: 'missing-job',
      type: AiJobType.lesson_content,
    });
    expect(prisma.aiGenerationJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AiJobStatus.queued,
          enqueueStatus: AiEnqueueStatus.enqueued,
        }),
      }),
    );
  });

  it('does not add a second copy when reconciliation finds the Redis job', async () => {
    await queue.add({ id: 'job-1', type: AiJobType.course_plan });
    prisma.aiGenerationJob.findMany.mockResolvedValue([
      { id: 'job-1', type: AiJobType.course_plan },
    ]);

    await expect(service.reconcileMissing()).resolves.toBe(0);
    expect(queue.addCalls).toHaveLength(1);
  });

  it('returns an expired pre-provider execution to queued and clears its lease', async () => {
    prisma.aiGenerationJob.updateMany.mockResolvedValueOnce({ count: 1 });
    const now = new Date('2026-08-22T00:03:00Z');

    await expect(service.reconcileExpiredExecutions(now)).resolves.toBe(1);
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: AiJobStatus.running,
        executionLeaseExpiresAt: { lte: now },
        providerRequestStartedAt: null,
      },
      data: expect.objectContaining({
        status: AiJobStatus.queued,
        queueAttempts: { increment: 1 },
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        heartbeatAt: null,
        errorCode: 'WORKER_LEASE_EXPIRED',
      }),
    });
  });

  it('keeps lease reconciliation active while disabled without enqueueing work', async () => {
    jest.useFakeTimers();
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(1_000);
    await service.onModuleDestroy();

    expect(prisma.aiGenerationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: AiJobStatus.running,
        providerRequestStartedAt: null,
      }),
    }));
    expect(prisma.aiGenerationJob.findMany).not.toHaveBeenCalled();
    expect(queue.addCalls).toHaveLength(0);
    jest.useRealTimers();
  });
});
