import { AiGenerationJob, Prisma } from '@prisma/client';

export interface AiJobProcessorContext {
  heartbeat(): Promise<boolean>;
  isCancellationRequested(): Promise<boolean>;
  runProviderRequest<T>(
    call: () => Promise<import('./ai-job-provider-boundary.service').AiProviderResult<T>>,
  ): Promise<T>;
}

export interface AiJobProcessingResult {
  commit(tx: Prisma.TransactionClient): Promise<Prisma.InputJsonValue | null>;
}

export abstract class AiJobProcessor {
  abstract process(
    job: AiGenerationJob,
    context: AiJobProcessorContext,
  ): Promise<AiJobProcessingResult>;

  async finalFailure(_job: AiGenerationJob, _error: unknown): Promise<void> {}
}

export class AiJobProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'AiJobProcessingError';
  }
}

export class UnsupportedAiJobProcessor extends AiJobProcessor {
  async process(): Promise<AiJobProcessingResult> {
    throw new AiJobProcessingError(
      'PROCESSOR_NOT_CONFIGURED',
      false,
      'No AI content processor is configured',
    );
  }
}

export abstract class AiJobLifecycleHooks {
  async acquireAttempt(_job: AiGenerationJob, _attemptId: string): Promise<void> {}
  async heartbeatAttempt(_job: AiGenerationJob, _attemptId: string): Promise<boolean> {
    return true;
  }
  async releaseAttempt(_job: AiGenerationJob, _attemptId: string): Promise<void> {}
  async finalFailure(
    _job: AiGenerationJob,
    _error: unknown,
  ): Promise<void> {}
  async cancelled(_job: AiGenerationJob): Promise<void> {}
}

export class NoopAiJobLifecycleHooks extends AiJobLifecycleHooks {}
