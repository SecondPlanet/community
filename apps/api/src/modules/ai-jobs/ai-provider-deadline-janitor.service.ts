import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Provider deadline reconciler.
 *
 * 社区版没有平台预算账本, 但仍要把"provider 请求已发出却没有回音"的
 * 任务收敛掉, 否则它会永远停在 running。
 */
@Injectable()
export class AiProviderDeadlineJanitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiProviderDeadlineJanitorService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = Number(this.config.get<number>('AI_JOB_DISPATCH_INTERVAL_MS')) || 1_000;
    this.timer = setInterval(() => void this.reconcile().catch((error) => {
      this.logger.error(`AI provider deadline reconciliation failed: ${String(error)}`);
    }), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile(now = new Date()): Promise<void> {
    const configuredGrace = Number(this.config.get<number>('AI_PROVIDER_USAGE_GRACE_MS'));
    const graceMs = Number.isFinite(configuredGrace) ? configuredGrace : 30_000;
    const deadlineCutoff = new Date(now.getTime() - graceMs);
    const unknown = await this.prisma.aiGenerationJob.findMany({
      where: {
        providerRequestStartedAt: { not: null },
        providerRequestFinishedAt: null,
        providerRequestDeadlineAt: { lte: deadlineCutoff },
        status: { in: [AiJobStatus.running, AiJobStatus.failed, AiJobStatus.cancelled] },
      },
      select: { id: true, status: true },
      take: 100,
    });
    for (const job of unknown) {
      await this.prisma.aiGenerationJob.updateMany({
        where: { id: job.id, providerRequestFinishedAt: null },
        data: {
          providerRequestFinishedAt: now,
          ...(job.status === AiJobStatus.running
            ? {
                status: AiJobStatus.failed,
                finishedAt: now,
                errorCode: 'PROVIDER_USAGE_UNKNOWN',
                errorMessage: 'Provider response was not observed before its deadline',
              }
            : {}),
          executionLeaseOwner: null,
          executionLeaseExpiresAt: null,
          heartbeatAt: null,
        },
      });
    }
  }
}
