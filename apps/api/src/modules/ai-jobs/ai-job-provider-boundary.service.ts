import { Injectable } from '@nestjs/common';
import {
  AiGenerationJob,
  AiJobStatus,
  Prisma,
} from '@prisma/client';
import { AiProviderDeadlineService } from '../ai-model-gateway/ai-provider-deadline.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiJobProcessingError } from './ai-job-processor';

export interface AiProviderResult<T> {
  value: T;
  actualTokens: number;
  actualCost: Prisma.Decimal | string | number;
}

interface AiProviderOutputCheckpoint {
  checkpointVersion: 1;
  kind: AiGenerationJob['type'];
  payload: Prisma.JsonValue;
  usage: {
    actualTokens: number;
    actualCost: string;
  };
}

@Injectable()
export class AiJobProviderBoundaryService {
  constructor(
    private readonly deadline: AiProviderDeadlineService,
    private readonly prisma: PrismaService,
  ) {}

  async run<T>(job: AiGenerationJob, call: () => Promise<AiProviderResult<T>>): Promise<T> {
    const checkpoint = this.readCheckpoint(job);
    if (checkpoint) {
      return checkpoint.payload as T;
    }

    await this.deadline.recordProviderRequestStarted(job.id);
    const result = await call();
    const stored = this.createCheckpoint(job, result);
    const checkpointed = await this.prisma.aiGenerationJob.updateMany({
      where: {
        id: job.id,
        status: AiJobStatus.running,
        executionLeaseOwner: job.executionLeaseOwner,
        resultRef: { equals: Prisma.DbNull },
      },
      data: {
        resultRef: stored as unknown as Prisma.InputJsonValue,
        providerRequestFinishedAt: new Date(),
      },
    });
    if (checkpointed.count !== 1) {
      throw new AiJobProcessingError(
        'AI_JOB_CHECKPOINT_LOST_LEASE',
        true,
        'Provider output could not be checkpointed by the active execution lease',
      );
    }
    return stored.payload as T;
  }

  private readCheckpoint(job: AiGenerationJob): AiProviderOutputCheckpoint | null {
    if (job.resultRef === null) return null;
    const value = job.resultRef;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.invalidCheckpoint();
    }
    const checkpoint = value as Record<string, Prisma.JsonValue>;
    const usage = checkpoint.usage;
    if (
      checkpoint.checkpointVersion !== 1 ||
      checkpoint.kind !== job.type ||
      !('payload' in checkpoint) ||
      !usage || typeof usage !== 'object' || Array.isArray(usage) ||
      typeof usage.actualTokens !== 'number' || !Number.isInteger(usage.actualTokens) || usage.actualTokens < 0 ||
      typeof usage.actualCost !== 'string' || !/^\d+(?:\.\d+)?$/.test(usage.actualCost)
    ) {
      this.invalidCheckpoint();
    }
    this.assertNoSecrets(value);
    return checkpoint as unknown as AiProviderOutputCheckpoint;
  }

  private createCheckpoint<T>(
    job: AiGenerationJob,
    result: AiProviderResult<T>,
  ): AiProviderOutputCheckpoint {
    if (!Number.isInteger(result.actualTokens) || result.actualTokens < 0) {
      throw new AiJobProcessingError('AI_JOB_CHECKPOINT_INVALID', false, 'Provider token usage is invalid');
    }
    const actualCost = String(result.actualCost);
    if (!/^\d+(?:\.\d+)?$/.test(actualCost)) {
      throw new AiJobProcessingError('AI_JOB_CHECKPOINT_INVALID', false, 'Provider cost usage is invalid');
    }
    let payload: Prisma.JsonValue;
    try {
      const serialized = JSON.stringify(result.value);
      if (serialized === undefined) this.invalidCheckpoint();
      payload = JSON.parse(serialized) as Prisma.JsonValue;
    } catch (error) {
      if (error instanceof AiJobProcessingError) throw error;
      this.invalidCheckpoint();
    }
    this.assertNoSecrets(payload!);
    return {
      checkpointVersion: 1,
      kind: job.type,
      payload: payload!,
      usage: { actualTokens: result.actualTokens, actualCost },
    };
  }

  private assertNoSecrets(value: Prisma.JsonValue): void {
    if (Array.isArray(value)) {
      value.forEach((item) => this.assertNoSecrets(item));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:api[-_]?key(?:enc)?|authorization|credentials?)$/i.test(key)) {
        throw new AiJobProcessingError(
          'AI_JOB_CHECKPOINT_FORBIDDEN_FIELD',
          false,
          `Provider checkpoint contains forbidden field: ${key}`,
        );
      }
      if (child !== undefined) this.assertNoSecrets(child);
    }
  }

  private invalidCheckpoint(): never {
    throw new AiJobProcessingError('AI_JOB_CHECKPOINT_INVALID', false, 'Provider output checkpoint is invalid');
  }
}
