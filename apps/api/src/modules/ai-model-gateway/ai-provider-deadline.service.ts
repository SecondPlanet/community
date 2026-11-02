import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Provider 请求 deadline 记账。
 *
 * 社区版没有平台预算账本, 但仍需要在 provider 请求发出时固定 deadline,
 * 让超时任务能被 reconciler 标记为失败(而不是永远停在 running)。
 */
@Injectable()
export class AiProviderDeadlineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Atomically fixes the provider deadline on first invocation. */
  async recordProviderRequestStarted(jobId: string, startedAt = new Date()) {
    if (!jobId.trim()) throw new BadRequestException('jobId is required');
    const deadlineAt = new Date(
      startedAt.getTime() + (this.config.get<number>('AI_PROVIDER_TIMEOUT_MS') ?? 60_000),
    );
    await this.prisma.aiGenerationJob.updateMany({
      where: { id: jobId, providerRequestStartedAt: null },
      data: {
        providerRequestStartedAt: startedAt,
        providerRequestDeadlineAt: deadlineAt,
      },
    });
    const job = await this.prisma.aiGenerationJob.findUnique({
      where: { id: jobId },
      select: {
        providerRequestStartedAt: true,
        providerRequestDeadlineAt: true,
      },
    });
    if (!job) throw new ConflictException('AI_JOB_NOT_FOUND');
    if (!job.providerRequestStartedAt || !job.providerRequestDeadlineAt) {
      throw new ConflictException('AI_PROVIDER_DEADLINE_NOT_RECORDED');
    }
    return job;
  }
}
