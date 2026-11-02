import { Controller, Get, HttpCode, HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AiWorkerHeartbeatService, AiWorkerHealth } from '../ai-jobs/ai-worker-heartbeat.service';

type CheckResult = 'ok' | 'fail' | 'skip';

interface ReadinessResponse {
  status: 'ok' | 'degraded';
  service: string;
  checks: {
    redis: CheckResult;
    mysql: CheckResult;
    minio: CheckResult;
  };
}

interface LivenessResponse {
  status: 'ok';
  service: string;
  uptime: number;
  timestamp: string;
}

/**
 * 健康检查 endpoint
 *
 * - GET /api/v1/health       liveness  (进程是否在跑 — 永远 200, 用于 LB / k8s livenessProbe)
 * - GET /api/v1/health/ready readiness (依赖是否可用 — 503 表示暂时不可用, 用于 k8s readinessProbe)
 *
 * 设计要点 (P0 v1.5.4):
 * - liveness 不查依赖, 避免 redis 临时抖动导致 k8s 杀 pod 重启 (LB 重启会让 throttler
 *   计数清零, 反而更糟). readiness 才查依赖.
 * - readiness 任一 check fail -> 503 ServiceUnavailable, 让上游 LB 摘流量.
 * - minio check 用 HTTP HEAD /minio/health/live (跟 docker-compose healthcheck 同源),
 *   不依赖 SDK 启动开销.
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startedAt = Date.now();

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiWorkerHeartbeat: AiWorkerHeartbeatService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      service: 'secondplanet-api',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ai-worker')
  @HttpCode(HttpStatus.OK)
  aiWorkerHealth(): Promise<AiWorkerHealth> {
    // Deliberately always HTTP 200: this is an alerting/degraded-capability
    // signal and is not part of the site's primary readiness decision.
    return this.aiWorkerHeartbeat.read();
  }

  @Get('ready')
  async readiness(): Promise<ReadinessResponse> {
    const [redisOk, mysqlOk, minioOk] = await Promise.all([
      this.checkRedis(),
      this.checkMysql(),
      this.checkMinio(),
    ]);

    // 'skip' = 没配该依赖 (可选), 视为 OK; 'fail' = 真坏了
    const allOk =
      redisOk !== 'fail' && mysqlOk !== 'fail' && minioOk !== 'fail';
    const body: ReadinessResponse = {
      status: allOk ? 'ok' : 'degraded',
      service: 'secondplanet-api',
      checks: {
        redis: redisOk,
        mysql: mysqlOk,
        minio: minioOk,
      },
    };

    if (!allOk) {
      // readiness 503: 上游 LB 摘流量, 等依赖恢复
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private async checkRedis(): Promise<CheckResult> {
    try {
      const ok = await this.redis.ping();
      return ok ? 'ok' : 'fail';
    } catch {
      return 'fail';
    }
  }

  private async checkMysql(): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (err) {
      this.logger.warn(`mysql health check failed: ${(err as Error).message}`);
      return 'fail';
    }
  }

  private async checkMinio(): Promise<CheckResult> {
    // The SDK may use a public endpoint so presigned URLs work in browsers.
    // Readiness must use the private service endpoint to avoid a proxy startup
    // dependency and public-network hairpinning from inside the container.
    const endpoint =
      this.config.get<string>('MINIO_HEALTH_ENDPOINT') ??
      this.config.get<string>('MINIO_ENDPOINT');
    if (!endpoint) return 'skip';
    const useSsl =
      (this.config.get<string>('MINIO_HEALTH_USE_SSL') ??
        this.config.get<string>('MINIO_USE_SSL')) === 'true';
    const port =
      Number(
        this.config.get<string>('MINIO_HEALTH_PORT') ??
          this.config.get<string>('MINIO_PORT'),
      ) || 9000;
    const proto = useSsl ? 'https' : 'http';
    // /minio/health/live 是 minio 自带 liveness, 跟 docker-compose healthcheck 同源
    const url = `${proto}://${endpoint}:${port}/minio/health/live`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      return res.ok ? 'ok' : 'fail';
    } catch (err) {
      this.logger.warn(`minio health check failed: ${(err as Error).message}`);
      return 'fail';
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
