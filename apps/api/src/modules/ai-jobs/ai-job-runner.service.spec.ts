import { ConfigService } from '@nestjs/config';
import {
  AiEnqueueStatus,
  AiJobStatus,
  AiJobType,
  LearningProjectStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AiJobLifecycleHooks,
  AiJobProcessingError,
  AiJobProcessor,
} from './ai-job-processor';
import { AiJobRunnerService } from './ai-job-runner.service';
import { AiJobProviderBoundaryService } from './ai-job-provider-boundary.service';

describe('AiJobRunnerService', () => {
  const prisma = {
    aiGenerationJob: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const processor = { process: jest.fn(), finalFailure: jest.fn() };
  const hooks = {
    acquireAttempt: jest.fn(),
    releaseAttempt: jest.fn(),
    finalFailure: jest.fn(),
    cancelled: jest.fn(),
    heartbeatAttempt: jest.fn(),
  };
  const providerBoundary = { run: jest.fn() };
  const config = {
    get: jest.fn((key: string): number | boolean | undefined => {
      if (key === 'AI_PERSONAL_COURSES_ENABLED') return true;
      if (key === 'AI_JOB_EXECUTION_LEASE_MS') return 30_000;
      if (key === 'AI_JOB_HEARTBEAT_INTERVAL_MS') return 10_000;
      return undefined;
    }),
  };
  let service: AiJobRunnerService;

  const job = {
    id: 'job-1',
    userId: 'user-1',
    projectId: 'project-1',
    type: AiJobType.course_plan,
    status: AiJobStatus.running,
    enqueueStatus: AiEnqueueStatus.enqueued,
    cancelRequestedAt: null,
    project: { status: LearningProjectStatus.ready },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'AI_PERSONAL_COURSES_ENABLED') return true;
      if (key === 'AI_JOB_EXECUTION_LEASE_MS') return 30_000;
      if (key === 'AI_JOB_HEARTBEAT_INTERVAL_MS') return 10_000;
      return undefined;
    });
    hooks.acquireAttempt.mockResolvedValue(undefined);
    hooks.releaseAttempt.mockResolvedValue(undefined);
    hooks.finalFailure.mockResolvedValue(undefined);
    hooks.cancelled.mockResolvedValue(undefined);
    hooks.heartbeatAttempt.mockResolvedValue(true);
    processor.finalFailure.mockResolvedValue(undefined);
    service = new AiJobRunnerService(
      prisma as unknown as PrismaService,
      processor as unknown as AiJobProcessor,
      hooks as unknown as AiJobLifecycleHooks,
      config as unknown as ConfigService,
      providerBoundary as unknown as AiJobProviderBoundaryService,
    );
  });

  it('does not claim or call a provider for a Redis job delivered after the feature flag is disabled', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'AI_PERSONAL_COURSES_ENABLED' ? false : undefined,
    );

    await expect(
      service.run('already-enqueued-job', { attemptNumber: 1, maxAttempts: 3 }),
    ).resolves.toBe('noop');
    expect(prisma.aiGenerationJob.updateMany).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
    expect(providerBoundary.run).not.toHaveBeenCalled();
  });

  it('treats a succeeded replay as a no-op', async () => {
    prisma.aiGenerationJob.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce({
      status: AiJobStatus.succeeded,
    });

    await expect(
      service.run('job-1', { attemptNumber: 2, maxAttempts: 3 }),
    ).resolves.toBe('noop');
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('moves running back to queued for a retryable non-final attempt', async () => {
    const error = new AiJobProcessingError('PROVIDER_TIMEOUT', true, 'timeout');
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce(job);
    processor.process.mockRejectedValueOnce(error);

    await expect(
      service.run('job-1', { attemptNumber: 1, maxAttempts: 3 }),
    ).rejects.toBe(error);

    expect(prisma.aiGenerationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiJobStatus.queued,
          queueAttempts: { increment: 1 },
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          heartbeatAt: null,
        }),
      }),
    );
    expect(hooks.finalFailure).not.toHaveBeenCalled();
    expect(hooks.releaseAttempt).toHaveBeenCalledWith(job, expect.any(String));
  });

  it('marks the last attempt failed and runs final cleanup hooks', async () => {
    const error = new Error('provider down');
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce(job);
    processor.process.mockRejectedValueOnce(error);

    await expect(
      service.run('job-1', { attemptNumber: 3, maxAttempts: 3 }),
    ).rejects.toBe(error);

    expect(prisma.aiGenerationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiJobStatus.failed,
          finishedAt: expect.any(Date),
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          heartbeatAt: null,
        }),
      }),
    );
    expect(hooks.finalFailure).toHaveBeenCalledWith(job, error);
    expect(processor.finalFailure).toHaveBeenCalledWith(job, error);
    expect(hooks.releaseAttempt).toHaveBeenCalledWith(job, expect.any(String));
  });

  it('still cleans the budget when business failure cleanup throws', async () => {
    const providerError = new Error('provider down');
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce(job);
    processor.process.mockRejectedValueOnce(providerError);
    processor.finalFailure.mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(service.run('job-1', { attemptNumber: 3, maxAttempts: 3 }))
      .rejects.toThrow('cleanup failed');
    expect(hooks.finalFailure).toHaveBeenCalledWith(job, providerError);
    expect(hooks.releaseAttempt).toHaveBeenCalledWith(job, expect.any(String));
  });

  it('does not run failure cleanup after losing the execution lease', async () => {
    const providerError = new Error('provider down');
    prisma.aiGenerationJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce(job);
    processor.process.mockRejectedValueOnce(providerError);

    await expect(service.run('job-1', { attemptNumber: 3, maxAttempts: 3 }))
      .rejects.toBe(providerError);
    expect(processor.finalFailure).not.toHaveBeenCalled();
    expect(hooks.finalFailure).not.toHaveBeenCalled();
  });

  it('maps a nonretryable provider error to a final failure', async () => {
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce(job);
    const fatal = new AiJobProcessingError('AI_STRUCTURED_OUTPUT_INVALID', false, 'invalid');
    processor.process.mockRejectedValueOnce(fatal);

    await expect(service.run('job-1', { attemptNumber: 1, maxAttempts: 3 }))
      .rejects.toMatchObject({ code: 'AI_STRUCTURED_OUTPUT_INVALID', retryable: false });
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AiJobStatus.failed }) }),
    );
    expect(hooks.finalFailure).toHaveBeenCalled();
  });

  it('does not strand the running lease when attempt acquisition fails', async () => {
    const error = new Error('semaphore unavailable');
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce(job);
    hooks.acquireAttempt.mockRejectedValueOnce(error);

    await expect(
      service.run('job-1', { attemptNumber: 1, maxAttempts: 3 }),
    ).rejects.toBe(error);

    expect(prisma.aiGenerationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiJobStatus.queued,
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
        }),
      }),
    );
    expect(hooks.releaseAttempt).not.toHaveBeenCalled();
  });

  it('cancels before invoking a processor when the project is archived', async () => {
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiGenerationJob.findUnique.mockResolvedValueOnce({
      ...job,
      project: { status: LearningProjectStatus.archived },
    });

    await expect(
      service.run('job-1', { attemptNumber: 1, maxAttempts: 3 }),
    ).resolves.toBe('cancelled');
    expect(processor.process).not.toHaveBeenCalled();
    expect(hooks.cancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
    );
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiJobStatus.cancelled,
          enqueueStatus: AiEnqueueStatus.cancelled,
        }),
      }),
    );
  });
});
