import { z } from 'zod';

/**
 * AI personal-course feature environment (community edition).
 *
 * 所有 AI 调用都是 BYOK: 平台不托管 key, 也没有平台预算账本。
 * 这里只校验作业调度 / 信号量 / 超时等基础设施参数, 以及按用户的
 * BYOK 日 token 额度。
 */

const strictBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return false;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}, z.boolean());

const positiveInteger = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : Number(value)),
    z.number().int().positive(),
  );

const nonNegativeInteger = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : Number(value)),
    z.number().int().nonnegative(),
  );

export interface AiPersonalCoursesConfig {
  enabled: boolean;
  userDailyByokTokens: number;
  providerTimeoutMs: number;
  providerUsageGraceMs: number;
  jobWorkerEnabled: boolean;
  jobConcurrency: number;
  jobDispatchIntervalMs: number;
  jobEnqueueLeaseMs: number;
  jobExecutionLeaseMs: number;
  jobHeartbeatIntervalMs: number;
  jobReconcileAgeMs: number;
  jobQueuePrefix: string;
  workerHeartbeatIntervalMs: number;
  workerHeartbeatTtlMs: number;
  jobUserConcurrency: number;
  jobSemaphoreTtlMs: number;
}

/**
 * Validates and normalizes the AI personal-course environment.
 * The returned object is consumed by Nest ConfigModule, so feature code can use
 * typed values rather than reparsing process.env at every call site.
 */
export function validateAiPersonalCourseEnv(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = z.preprocess(
    (value) => (value === undefined || value === '' ? 'development' : value),
    z.enum(['development', 'test', 'production']),
  ).parse(raw.NODE_ENV);

  try {
    const enabled = strictBoolean.parse(raw.AI_PERSONAL_COURSES_ENABLED);
    const userDailyByokTokens = positiveInteger(500_000).parse(
      raw.AI_USER_DAILY_BYOK_TOKENS,
    );
    const providerTimeoutMs = positiveInteger(60_000).parse(raw.AI_PROVIDER_TIMEOUT_MS);
    const providerUsageGraceMs = nonNegativeInteger(30_000).parse(
      raw.AI_PROVIDER_USAGE_GRACE_MS,
    );
    const jobWorkerEnabled = strictBoolean.parse(raw.AI_JOB_WORKER_ENABLED);
    const jobConcurrency = positiveInteger(2).parse(raw.AI_JOB_CONCURRENCY);
    const jobDispatchIntervalMs = positiveInteger(1_000).parse(
      raw.AI_JOB_DISPATCH_INTERVAL_MS,
    );
    const jobEnqueueLeaseMs = positiveInteger(30_000).parse(
      raw.AI_JOB_ENQUEUE_LEASE_MS,
    );
    const jobExecutionLeaseMs = positiveInteger(30_000).parse(
      raw.AI_JOB_EXECUTION_LEASE_MS,
    );
    const jobHeartbeatIntervalMs = positiveInteger(10_000).parse(
      raw.AI_JOB_HEARTBEAT_INTERVAL_MS,
    );
    const jobReconcileAgeMs = positiveInteger(60_000).parse(
      raw.AI_JOB_RECONCILE_AGE_MS,
    );
    const jobQueuePrefix = z.string().trim().min(1).default('aicourse').parse(
      raw.AI_JOB_QUEUE_PREFIX,
    );
    const workerHeartbeatIntervalMs = positiveInteger(10_000).parse(
      raw.AI_WORKER_HEARTBEAT_INTERVAL_MS,
    );
    const workerHeartbeatTtlMs = positiveInteger(30_000).parse(
      raw.AI_WORKER_HEARTBEAT_TTL_MS,
    );
    const jobUserConcurrency = positiveInteger(2).parse(raw.AI_JOB_USER_CONCURRENCY);
    const jobSemaphoreTtlMs = positiveInteger(45_000).parse(raw.AI_JOB_SEMAPHORE_TTL_MS);

    if (jobHeartbeatIntervalMs >= jobExecutionLeaseMs) {
      throw new Error(
        'AI_JOB_HEARTBEAT_INTERVAL_MS must be lower than AI_JOB_EXECUTION_LEASE_MS',
      );
    }
    if (workerHeartbeatIntervalMs >= workerHeartbeatTtlMs) {
      throw new Error(
        'AI_WORKER_HEARTBEAT_INTERVAL_MS must be lower than AI_WORKER_HEARTBEAT_TTL_MS',
      );
    }
    if (jobHeartbeatIntervalMs >= jobSemaphoreTtlMs) {
      throw new Error(
        'AI_JOB_HEARTBEAT_INTERVAL_MS must be lower than AI_JOB_SEMAPHORE_TTL_MS',
      );
    }

    return {
      ...raw,
      NODE_ENV: nodeEnv,
      AI_PERSONAL_COURSES_ENABLED: enabled,
      AI_USER_DAILY_BYOK_TOKENS: userDailyByokTokens,
      AI_PROVIDER_TIMEOUT_MS: providerTimeoutMs,
      AI_PROVIDER_USAGE_GRACE_MS: providerUsageGraceMs,
      AI_JOB_WORKER_ENABLED: jobWorkerEnabled,
      AI_JOB_CONCURRENCY: jobConcurrency,
      AI_JOB_DISPATCH_INTERVAL_MS: jobDispatchIntervalMs,
      AI_JOB_ENQUEUE_LEASE_MS: jobEnqueueLeaseMs,
      AI_JOB_EXECUTION_LEASE_MS: jobExecutionLeaseMs,
      AI_JOB_HEARTBEAT_INTERVAL_MS: jobHeartbeatIntervalMs,
      AI_JOB_RECONCILE_AGE_MS: jobReconcileAgeMs,
      AI_JOB_QUEUE_PREFIX: jobQueuePrefix,
      AI_WORKER_HEARTBEAT_INTERVAL_MS: workerHeartbeatIntervalMs,
      AI_WORKER_HEARTBEAT_TTL_MS: workerHeartbeatTtlMs,
      AI_JOB_USER_CONCURRENCY: jobUserConcurrency,
      AI_JOB_SEMAPHORE_TTL_MS: jobSemaphoreTtlMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid AI personal-course configuration: ${message}`);
  }
}

export function readAiPersonalCoursesConfig(
  config: Record<string, unknown>,
): AiPersonalCoursesConfig {
  return {
    enabled: config.AI_PERSONAL_COURSES_ENABLED === true,
    userDailyByokTokens: Number(config.AI_USER_DAILY_BYOK_TOKENS),
    providerTimeoutMs: Number(config.AI_PROVIDER_TIMEOUT_MS),
    providerUsageGraceMs: Number(config.AI_PROVIDER_USAGE_GRACE_MS),
    jobWorkerEnabled: config.AI_JOB_WORKER_ENABLED === true,
    jobConcurrency: Number(config.AI_JOB_CONCURRENCY),
    jobDispatchIntervalMs: Number(config.AI_JOB_DISPATCH_INTERVAL_MS),
    jobEnqueueLeaseMs: Number(config.AI_JOB_ENQUEUE_LEASE_MS),
    jobExecutionLeaseMs: Number(config.AI_JOB_EXECUTION_LEASE_MS),
    jobHeartbeatIntervalMs: Number(config.AI_JOB_HEARTBEAT_INTERVAL_MS),
    jobReconcileAgeMs: Number(config.AI_JOB_RECONCILE_AGE_MS),
    jobQueuePrefix: String(config.AI_JOB_QUEUE_PREFIX),
    workerHeartbeatIntervalMs: Number(config.AI_WORKER_HEARTBEAT_INTERVAL_MS),
    workerHeartbeatTtlMs: Number(config.AI_WORKER_HEARTBEAT_TTL_MS),
    jobUserConcurrency: Number(config.AI_JOB_USER_CONCURRENCY),
    jobSemaphoreTtlMs: Number(config.AI_JOB_SEMAPHORE_TTL_MS),
  };
}
