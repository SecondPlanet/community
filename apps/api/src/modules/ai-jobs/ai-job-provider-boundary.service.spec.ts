import { AiJobStatus, AiJobType } from '@prisma/client';
import { AiJobProviderBoundaryService } from './ai-job-provider-boundary.service';

describe('AiJobProviderBoundaryService', () => {
  const job = {
    id: 'j1', requestKey: 'r1', executionNo: 1,
    type: AiJobType.course_plan, status: AiJobStatus.running,
    executionLeaseOwner: 'worker-1', resultRef: null,
  };
  const deadline = {
    recordProviderRequestStarted: jest.fn(),
  };
  const prisma = {
    aiGenerationJob: { updateMany: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('records provider start before the call and checkpoints the output', async () => {
    deadline.recordProviderRequestStarted.mockResolvedValue({});
    prisma.aiGenerationJob.updateMany.mockResolvedValue({ count: 1 });
    const service = new AiJobProviderBoundaryService(deadline as never, prisma as never);
    const call = jest.fn().mockResolvedValue({ value: 'ok', actualTokens: 42, actualCost: 0.01 });

    await expect(service.run(job as never, call)).resolves.toBe('ok');
    expect(deadline.recordProviderRequestStarted.mock.invocationCallOrder[0])
      .toBeLessThan(call.mock.invocationCallOrder[0]);
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        executionLeaseOwner: 'worker-1',
        resultRef: { equals: expect.anything() },
      }),
      data: expect.objectContaining({
        resultRef: expect.objectContaining({
          checkpointVersion: 1,
          kind: AiJobType.course_plan,
          payload: 'ok',
          usage: { actualTokens: 42, actualCost: '0.01' },
        }),
      }),
    }));
  });

  it('does not checkpoint when the provider call fails', async () => {
    deadline.recordProviderRequestStarted.mockResolvedValue({});
    const service = new AiJobProviderBoundaryService(deadline as never, prisma as never);
    await expect(service.run(job as never, async () => { throw new Error('socket lost'); }))
      .rejects.toThrow('socket lost');
    expect(prisma.aiGenerationJob.updateMany).not.toHaveBeenCalled();
  });

  it('reuses a durable checkpoint after commit failure without another provider call', async () => {
    deadline.recordProviderRequestStarted.mockResolvedValue({});
    let checkpoint: unknown;
    prisma.aiGenerationJob.updateMany.mockImplementation(({ data }) => {
      checkpoint = data.resultRef;
      return Promise.resolve({ count: 1 });
    });
    const service = new AiJobProviderBoundaryService(deadline as never, prisma as never);
    const providerCall = jest.fn().mockResolvedValue({
      value: { title: 'generated' }, actualTokens: 125, actualCost: '0.02',
    });

    await service.run(job as never, providerCall);

    await expect(service.run({ ...job, resultRef: checkpoint } as never, providerCall))
      .resolves.toEqual({ title: 'generated' });
    expect(providerCall).toHaveBeenCalledTimes(1);
    expect(deadline.recordProviderRequestStarted).toHaveBeenCalledTimes(1);
    expect(prisma.aiGenerationJob.updateMany).toHaveBeenCalledTimes(1);
  });

  it('resumes from a stored checkpoint without calling the provider again', async () => {
    const checkpoint = {
      checkpointVersion: 1,
      kind: AiJobType.course_plan,
      payload: { title: 'generated' },
      usage: { actualTokens: 125, actualCost: '0.02' },
    };
    const service = new AiJobProviderBoundaryService(deadline as never, prisma as never);
    const providerCall = jest.fn();

    await expect(service.run({ ...job, resultRef: checkpoint } as never, providerCall))
      .resolves.toEqual({ title: 'generated' });
    expect(providerCall).not.toHaveBeenCalled();
    expect(deadline.recordProviderRequestStarted).not.toHaveBeenCalled();
  });

  it('refuses to persist credential fields in a checkpoint', async () => {
    deadline.recordProviderRequestStarted.mockResolvedValue({});
    const service = new AiJobProviderBoundaryService(deadline as never, prisma as never);
    await expect(service.run(job as never, async () => ({
      value: { prompt: 'secret prompt', apiKey: 'secret' },
      actualTokens: 1,
      actualCost: 0,
    }))).rejects.toMatchObject({ code: 'AI_JOB_CHECKPOINT_FORBIDDEN_FIELD' });
    expect(prisma.aiGenerationJob.updateMany).not.toHaveBeenCalled();
  });
});
