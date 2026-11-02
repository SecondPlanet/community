import {
  readAiPersonalCoursesConfig,
  validateAiPersonalCourseEnv,
} from './ai-personal-courses.config';

describe('validateAiPersonalCourseEnv', () => {
  it('keeps the feature disabled and applies development defaults', () => {
    const result = validateAiPersonalCourseEnv({ NODE_ENV: 'development' });

    expect(readAiPersonalCoursesConfig(result)).toEqual({
      enabled: false,
      userDailyByokTokens: 500_000,
      providerTimeoutMs: 60_000,
      providerUsageGraceMs: 30_000,
      jobWorkerEnabled: false,
      jobConcurrency: 2,
      jobDispatchIntervalMs: 1_000,
      jobEnqueueLeaseMs: 30_000,
      jobExecutionLeaseMs: 30_000,
      jobHeartbeatIntervalMs: 10_000,
      jobReconcileAgeMs: 60_000,
      jobQueuePrefix: 'aicourse',
      workerHeartbeatIntervalMs: 10_000,
      workerHeartbeatTtlMs: 30_000,
      jobUserConcurrency: 2,
      jobSemaphoreTtlMs: 45_000,
    });
  });

  it('parses strict scalar values', () => {
    const result = validateAiPersonalCourseEnv({
      NODE_ENV: 'test',
      AI_PERSONAL_COURSES_ENABLED: 'true',
      AI_PROVIDER_TIMEOUT_MS: '45000',
      AI_PROVIDER_USAGE_GRACE_MS: '0',
      AI_JOB_WORKER_ENABLED: 'true',
      AI_JOB_CONCURRENCY: '4',
    });

    expect(result.AI_PERSONAL_COURSES_ENABLED).toBe(true);
    expect(result.AI_PROVIDER_TIMEOUT_MS).toBe(45_000);
    expect(result.AI_PROVIDER_USAGE_GRACE_MS).toBe(0);
    expect(result.AI_JOB_WORKER_ENABLED).toBe(true);
    expect(result.AI_JOB_CONCURRENCY).toBe(4);
  });

  it('rejects an unknown NODE_ENV instead of falling back to development', () => {
    expect(() => validateAiPersonalCourseEnv({ NODE_ENV: 'prod' })).toThrow();
  });

  it('rejects ambiguous booleans', () => {
    expect(() =>
      validateAiPersonalCourseEnv({ AI_PERSONAL_COURSES_ENABLED: 'yes' }),
    ).toThrow('Invalid AI personal-course configuration');
  });

  it('requires heartbeat to renew before the execution lease expires', () => {
    expect(() =>
      validateAiPersonalCourseEnv({
        AI_JOB_HEARTBEAT_INTERVAL_MS: '30000',
        AI_JOB_EXECUTION_LEASE_MS: '30000',
      }),
    ).toThrow(
      'AI_JOB_HEARTBEAT_INTERVAL_MS must be lower than AI_JOB_EXECUTION_LEASE_MS',
    );
  });

  it('requires worker heartbeat to renew before its Redis TTL expires', () => {
    expect(() =>
      validateAiPersonalCourseEnv({
        AI_WORKER_HEARTBEAT_INTERVAL_MS: '30000',
        AI_WORKER_HEARTBEAT_TTL_MS: '30000',
      }),
    ).toThrow(
      'AI_WORKER_HEARTBEAT_INTERVAL_MS must be lower than AI_WORKER_HEARTBEAT_TTL_MS',
    );
  });
});
