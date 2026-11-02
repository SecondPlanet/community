import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiWorkerHeartbeatService } from '../ai-jobs/ai-worker-heartbeat.service';

/**
 * HealthController 单测
 *
 * 覆盖:
 * - /health (liveness) 永远 200, 不查依赖
 * - /health/ready (readiness) redis + mysql + minio 全 OK -> 200
 * - /health/ready 任一依赖 fail -> 503 ServiceUnavailableException
 *
 * Mock 策略: 三个依赖 (RedisService / PrismaService / ConfigService) 都是 service 对象,
 * 注入到 controller 构造函数, 没有走 TestingModule. minio check 用 fetch 调真实 URL,
 * 这里用 happy path (endpoint=localhost:9000, fetch 被 jsdom 不支持时可能抛, 我们
 * 显式覆盖 case 让 fetch 返回预期).
 *
 * P0 2026-07-27 横向扩展: 投资人 demo 故事点 — readiness endpoint 是 LB / k8s
 * livenessProbe 的核心, 必须真的 503 (而不是 200 + body 写 fail).
 */

describe('HealthController', () => {
  let controller: HealthController;
  let redisPing: jest.Mock;
  let prismaQueryRaw: jest.Mock;
  let configGet: jest.Mock;
  let fetchSpy: jest.SpyInstance;
  let aiWorkerRead: jest.Mock;

  beforeEach(() => {
    redisPing = jest.fn().mockResolvedValue(true);
    prismaQueryRaw = jest.fn().mockResolvedValue([{ '1': 1 }]);
    configGet = jest.fn((key: string) => {
      if (key === 'MINIO_HEALTH_ENDPOINT') return 'minio';
      if (key === 'MINIO_HEALTH_PORT') return '9000';
      if (key === 'MINIO_HEALTH_USE_SSL') return 'false';
      if (key === 'MINIO_ENDPOINT') return 'localhost';
      if (key === 'MINIO_PORT') return '9000';
      if (key === 'MINIO_USE_SSL') return 'false';
      return undefined;
    });

    const redis = { ping: redisPing } as unknown as RedisService;
    const prisma = { $queryRaw: prismaQueryRaw } as unknown as PrismaService;
    const config = { get: configGet } as unknown as ConfigService;
    aiWorkerRead = jest.fn().mockResolvedValue({
      status: 'ok',
      lastHeartbeatAt: '2026-08-22T00:00:00.000Z',
      ageMs: 1_000,
      thresholdMs: 30_000,
    });

    controller = new HealthController(
      redis,
      prisma,
      config,
      { read: aiWorkerRead } as unknown as AiWorkerHeartbeatService,
    );

    // 默认 fetch OK
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── /health (liveness) ──────────────────────────────────────────────

  describe('GET /health (liveness)', () => {
    it('case 200: 永远返 200, 不查任何依赖', async () => {
      const res = controller.liveness();
      expect(res.status).toBe('ok');
      expect(res.service).toBe('secondplanet-api');
      expect(typeof res.uptime).toBe('number');
      expect(typeof res.timestamp).toBe('string');
      // liveness 不查 redis / mysql / minio
      expect(redisPing).not.toHaveBeenCalled();
      expect(prismaQueryRaw).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ── /health/ready (readiness) ──────────────────────────────────────

  describe('GET /health/ready (readiness)', () => {
    it('case 200: 全部依赖 OK -> 返 { status: "ok", checks: { redis: "ok", mysql: "ok", minio: "ok" } }', async () => {
      const res = await controller.readiness();

      expect(res.status).toBe('ok');
      expect(res.checks).toEqual({
        redis: 'ok',
        mysql: 'ok',
        minio: 'ok',
      });
      // 每个 check 都被实际调过
      expect(redisPing).toHaveBeenCalledTimes(1);
      expect(prismaQueryRaw).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // readiness 走内部服务地址，不依赖公开代理或公网回环。
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://minio:9000/minio/health/live');
    });

    it('case 503: redis ping 失败 -> 抛 ServiceUnavailableException, body 标记 redis: "fail"', async () => {
      redisPing.mockResolvedValueOnce(false);

      let body: any;
      try {
        await controller.readiness();
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceUnavailableException);
        body = (e as ServiceUnavailableException).getResponse();
      }
      expect(body.status).toBe('degraded');
      expect(body.checks.redis).toBe('fail');
      // 其它两个是 ok
      expect(body.checks.mysql).toBe('ok');
      expect(body.checks.minio).toBe('ok');
    });

    it('case 503: mysql $queryRaw 失败 -> 抛 503, checks.mysql = "fail"', async () => {
      prismaQueryRaw.mockRejectedValueOnce(new Error('connection refused'));

      let body: any;
      try {
        await controller.readiness();
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceUnavailableException);
        body = (e as ServiceUnavailableException).getResponse();
      }
      expect(body.checks.mysql).toBe('fail');
      expect(body.checks.redis).toBe('ok');
    });

    it('case 503: minio fetch 失败 -> 抛 503, checks.minio = "fail"', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

      let body: any;
      try {
        await controller.readiness();
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceUnavailableException);
        body = (e as ServiceUnavailableException).getResponse();
      }
      expect(body.checks.minio).toBe('fail');
    });

    it('case 503: minio fetch 抛 network error -> 抛 503, checks.minio = "fail"', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException);
    });

    it('MINIO_ENDPOINT 缺省时, minio check 返 "skip", 不影响 overall 200', async () => {
      // 重建一个 controller, 让 config.get('MINIO_ENDPOINT') 返 undefined
      const cfg2 = { get: jest.fn(() => undefined) } as unknown as ConfigService;
      const ctrl2 = new HealthController(
        { ping: jest.fn().mockResolvedValue(true) } as any,
        { $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]) } as any,
        cfg2,
        { read: aiWorkerRead } as any,
      );
      const res = await ctrl2.readiness();
      expect(res.checks.minio).toBe('skip');
      expect(res.status).toBe('ok');
    });
  });

  describe('GET /health/ai-worker', () => {
    it('returns degraded AI status without throwing or changing main readiness', async () => {
      aiWorkerRead.mockResolvedValueOnce({
        status: 'degraded',
        lastHeartbeatAt: null,
        ageMs: null,
        thresholdMs: 30_000,
        reason: 'missing',
      });

      await expect(controller.aiWorkerHealth()).resolves.toEqual(
        expect.objectContaining({ status: 'degraded', reason: 'missing' }),
      );
      await expect(controller.readiness()).resolves.toEqual(
        expect.objectContaining({ status: 'ok' }),
      );
    });
  });
});
