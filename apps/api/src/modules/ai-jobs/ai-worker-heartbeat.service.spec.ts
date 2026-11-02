import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { AiWorkerHeartbeatService } from './ai-worker-heartbeat.service';

describe('AiWorkerHeartbeatService', () => {
  const client = { get: jest.fn(), set: jest.fn() };
  const redis = { getClient: jest.fn(() => client) };
  const values: Record<string, unknown> = {
    AI_PERSONAL_COURSES_ENABLED: true,
    AI_JOB_QUEUE_PREFIX: 'test',
    AI_WORKER_HEARTBEAT_INTERVAL_MS: 10_000,
    AI_WORKER_HEARTBEAT_TTL_MS: 30_000,
  };
  const config = { get: jest.fn((key: string) => values[key]) };
  let service: AiWorkerHeartbeatService;

  beforeEach(() => {
    jest.clearAllMocks();
    values.AI_PERSONAL_COURSES_ENABLED = true;
    service = new AiWorkerHeartbeatService(
      redis as unknown as RedisService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => service.stop());

  it('writes a TTL heartbeat immediately when the worker starts', async () => {
    client.set.mockResolvedValue('OK');
    await service.start('worker-1');

    expect(client.set).toHaveBeenCalledWith(
      'test:ai-worker:heartbeat',
      expect.stringContaining('worker-1'),
      'PX',
      30_000,
    );
  });

  it('reports a fresh heartbeat as healthy', async () => {
    client.get.mockResolvedValue(
      JSON.stringify({ timestamp: '2026-08-22T00:00:00.000Z' }),
    );
    await expect(
      service.read(new Date('2026-08-22T00:00:10.000Z').getTime()),
    ).resolves.toEqual({
      status: 'ok',
      lastHeartbeatAt: '2026-08-22T00:00:00.000Z',
      ageMs: 10_000,
      thresholdMs: 30_000,
    });
  });

  it('reports missing/stale heartbeats as degraded and disabled feature as disabled', async () => {
    client.get.mockResolvedValueOnce(null);
    await expect(service.read()).resolves.toEqual(
      expect.objectContaining({ status: 'degraded', reason: 'missing' }),
    );

    client.get.mockResolvedValueOnce(
      JSON.stringify({ timestamp: '2026-08-21T23:00:00.000Z' }),
    );
    await expect(
      service.read(new Date('2026-08-22T00:00:00.000Z').getTime()),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'degraded', reason: 'stale' }),
    );

    values.AI_PERSONAL_COURSES_ENABLED = false;
    await expect(service.read()).resolves.toEqual(
      expect.objectContaining({ status: 'disabled' }),
    );
  });
});
