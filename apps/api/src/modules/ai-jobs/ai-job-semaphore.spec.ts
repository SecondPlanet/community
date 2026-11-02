import { InMemoryAiJobSemaphore } from './ai-job-semaphore';

describe('InMemoryAiJobSemaphore', () => {
  it('limits a user to two holders and releases capacity', async () => {
    const semaphore = new InMemoryAiJobSemaphore(2);
    await expect(semaphore.acquire('u1', 'a1')).resolves.toBe(true);
    await expect(semaphore.acquire('u1', 'a2')).resolves.toBe(true);
    await expect(semaphore.acquire('u1', 'a3')).resolves.toBe(false);
    await semaphore.release('u1', 'a1');
    await expect(semaphore.acquire('u1', 'a3')).resolves.toBe(true);
  });

  it('treats renewal by the same holder as idempotent', async () => {
    const semaphore = new InMemoryAiJobSemaphore(1);
    await expect(semaphore.acquire('u1', 'a1')).resolves.toBe(true);
    await expect(semaphore.acquire('u1', 'a1')).resolves.toBe(true);
    await expect(semaphore.acquire('u1', 'a2')).resolves.toBe(false);
  });
});
