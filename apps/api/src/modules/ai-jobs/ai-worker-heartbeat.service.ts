import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

export interface AiWorkerHealth {
  status: 'ok' | 'degraded' | 'disabled';
  lastHeartbeatAt: string | null;
  ageMs: number | null;
  thresholdMs: number;
  reason?: 'missing' | 'stale' | 'redis_unavailable';
}
@Injectable()
export class AiWorkerHeartbeatService {
  private timer?: NodeJS.Timeout;
  private workerId?: string;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async start(workerId: string): Promise<void> {
    if (this.timer) return;
    this.workerId = workerId;
    await this.write();
    this.timer = setInterval(
      () => void this.write().catch(() => undefined),
      this.intervalMs,
    );
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async read(now = Date.now()): Promise<AiWorkerHealth> {
    const thresholdMs = this.ttlMs;
    if (this.config.get<boolean>('AI_PERSONAL_COURSES_ENABLED') !== true) {
      return {
        status: 'disabled',
        lastHeartbeatAt: null,
        ageMs: null,
        thresholdMs,
      };
    }

    let raw: string | null;
    try {
      raw = await this.redis.getClient().get(this.key);
    } catch {
      return {
        status: 'degraded',
        lastHeartbeatAt: null,
        ageMs: null,
        thresholdMs,
        reason: 'redis_unavailable',
      };
    }
    if (!raw) {
      return {
        status: 'degraded',
        lastHeartbeatAt: null,
        ageMs: null,
        thresholdMs,
        reason: 'missing',
      };
    }

    try {
      const value = JSON.parse(raw) as { timestamp: string };
      const timestamp = new Date(value.timestamp);
      const ageMs = now - timestamp.getTime();
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > thresholdMs) {
        return {
          status: 'degraded',
          lastHeartbeatAt: Number.isNaN(timestamp.getTime())
            ? null
            : timestamp.toISOString(),
          ageMs: Number.isFinite(ageMs) ? ageMs : null,
          thresholdMs,
          reason: 'stale',
        };
      }
      return {
        status: 'ok',
        lastHeartbeatAt: timestamp.toISOString(),
        ageMs,
        thresholdMs,
      };
    } catch {
      return {
        status: 'degraded',
        lastHeartbeatAt: null,
        ageMs: null,
        thresholdMs,
        reason: 'stale',
      };
    }
  }

  private async write(): Promise<void> {
    if (!this.workerId) return;
    await this.redis.getClient().set(
      this.key,
      JSON.stringify({ workerId: this.workerId, timestamp: new Date().toISOString() }),
      'PX',
      this.ttlMs,
    );
  }

  private get key(): string {
    const prefix = this.config.get<string>('AI_JOB_QUEUE_PREFIX') ?? 'aicourse';
    return `${prefix}:ai-worker:heartbeat`;
  }

  private get intervalMs(): number {
    return Number(this.config.get<number>('AI_WORKER_HEARTBEAT_INTERVAL_MS')) || 10_000;
  }

  private get ttlMs(): number {
    return Number(this.config.get<number>('AI_WORKER_HEARTBEAT_TTL_MS')) || 30_000;
  }
}
