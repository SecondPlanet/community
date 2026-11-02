import { AiJobStatus } from '@prisma/client';
import { AiProviderDeadlineJanitorService } from './ai-provider-deadline-janitor.service';

describe('AiProviderDeadlineJanitorService', () => {
  const prisma = {
    aiGenerationJob: { findMany: jest.fn(), updateMany: jest.fn() },
  };
  const config = { get: jest.fn((key: string) => key === 'AI_PROVIDER_USAGE_GRACE_MS' ? 0 : undefined) };

  beforeEach(() => jest.clearAllMocks());

  it('fails a stranded running job whose provider deadline passed', async () => {
    prisma.aiGenerationJob.findMany.mockResolvedValue([
      { id: 'j1', status: AiJobStatus.running },
    ]);
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    const service = new AiProviderDeadlineJanitorService(prisma as never, config as never);
    const now = new Date('2026-08-23T00:00:00.000Z');

    await service.reconcile(now);
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: AiJobStatus.failed,
        errorCode: 'PROVIDER_USAGE_UNKNOWN',
        executionLeaseOwner: null,
      }),
    }));
  });

  it('leaves an already-failed job status untouched', async () => {
    prisma.aiGenerationJob.findMany.mockResolvedValue([
      { id: 'j2', status: AiJobStatus.failed },
    ]);
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    const service = new AiProviderDeadlineJanitorService(prisma as never, config as never);

    await service.reconcile();
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ status: expect.anything() }),
    }));
  });

  it('continues deadline cleanup scheduling while the feature flag is disabled', async () => {
    jest.useFakeTimers();
    const service = new AiProviderDeadlineJanitorService(prisma as never, config as never);
    const reconcile = jest.spyOn(service, 'reconcile').mockResolvedValue(undefined);

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(1_000);
    service.onModuleDestroy();

    expect(reconcile).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
