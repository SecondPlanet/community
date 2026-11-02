import { AiJobLifecycleService } from './ai-job-lifecycle.service';

describe('AiJobLifecycleService', () => {
  const job = { id: 'j1', userId: 'u1', requestKey: 'r1', executionNo: 1 } as never;
  const semaphore = { acquire: jest.fn(), release: jest.fn() };
  const prisma = { aiGenerationJob: { findUnique: jest.fn() } };
  let service: AiJobLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiJobLifecycleService(semaphore as never, prisma as never);
  });

  it('acquires and releases the per-user concurrency slot', async () => {
    semaphore.acquire.mockResolvedValue(true);
    await service.acquireAttempt(job, 'a-1');
    expect(semaphore.acquire).toHaveBeenCalledWith('u1', 'a-1');
    await service.releaseAttempt(job, 'a-1');
    expect(semaphore.release).toHaveBeenCalledWith('u1', 'a-1');
  });

  it('rejects a new attempt when the user is at the concurrency limit', async () => {
    semaphore.acquire.mockResolvedValue(false);
    await expect(service.acquireAttempt(job, 'a-1')).rejects.toMatchObject({
      code: 'AI_USER_CONCURRENCY_LIMIT',
    });
  });
});
