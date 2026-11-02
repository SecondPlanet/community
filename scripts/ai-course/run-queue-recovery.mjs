import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runEvidenceSuite } from './evidence-runner.mjs';
import { readFile, writeFile } from 'node:fs/promises';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const testFiles = [
  'src/modules/ai-jobs/ai-job-dispatcher.service.spec.ts',
  'src/modules/ai-jobs/ai-job-runner.service.spec.ts',
  'src/modules/ai-jobs/ai-job-semaphore.spec.ts',
  'src/modules/ai-jobs/ai-job-lifecycle.service.spec.ts',
  'src/modules/ai-jobs/ai-job-provider-boundary.service.spec.ts',
  'src/modules/ai-jobs/ai-provider-deadline-janitor.service.spec.ts',
  'src/modules/ai-jobs/ai-worker-heartbeat.service.spec.ts',
  'src/modules/learning-projects/learning-projects.service.spec.ts',
];

const groups = [
  {
    id: 'Q6',
    name: 'retryable provider error returns running work to queued',
    files: ['/src/modules/ai-jobs/ai-job-runner.service.spec.ts'],
    assertionPattern: 'moves running back to queued',
    finalState: { transitions: 'running-to-queued', queueAttempts: 'incremented' },
  },
  {
    id: 'Q7',
    name: 'automatic retry exhaustion releases execution resources',
    files: ['/src/modules/ai-jobs/ai-job-runner.service.spec.ts'],
    assertionPattern: 'marks the last attempt failed',
    finalState: { job: 'failed', lease: 'released', semaphore: 'released' },
  },
  {
    id: 'Q10',
    name: 'archive cancels queued or pre-provider work',
    files: [
      '/src/modules/learning-projects/learning-projects.service.spec.ts',
      '/src/modules/ai-jobs/ai-job-runner.service.spec.ts',
    ],
    assertionPattern: 'archives the project|cancels before invoking',
    finalState: { project: 'archived', jobs: 'cancelled', uncalledReservation: 'released' },
  },
  {
    id: 'Q11',
    name: 'provider-started cancellation preserves accounting boundary',
    files: [
      '/src/modules/ai-jobs/ai-job-lifecycle.service.spec.ts',
      '/src/modules/ai-jobs/ai-job-provider-boundary.service.spec.ts',
    ],
    assertionPattern: 'conservatively settles|records provider start',
    finalState: { contentWrite: 'blocked-by-lease-and-status', usage: 'settled-after-provider-boundary' },
  },
  {
    id: 'Q12',
    name: 'provider deadline settles unknown usage and clears stranded lease',
    files: ['/src/modules/ai-jobs/ai-provider-deadline-janitor.service.spec.ts'],
    assertionPattern: 'charges the full reservation',
    finalState: { job: 'failed', errorCode: 'PROVIDER_USAGE_UNKNOWN', lease: 'released' },
  },
  {
    id: 'Q13',
    name: 'worker heartbeat reports healthy and degraded independently of readiness',
    files: ['/src/modules/ai-jobs/ai-worker-heartbeat.service.spec.ts'],
    finalState: { workerHealth: 'healthy-or-degraded', mainReadiness: 'independent' },
  },
  {
    id: 'S1',
    name: 'service-level outbox reconciliation regression suite',
    files: ['/src/modules/ai-jobs/ai-job-dispatcher.service.spec.ts'],
    finalState: { dbJob: 'enqueued-or-pending-for-retry', redisJob: 'single-fixed-id' },
    redis: 'deterministic-in-memory-queue',
  },
  {
    id: 'S2',
    name: 'lease claim, retry loop, final failure and provider settlement boundary',
    files: [
      '/src/modules/ai-jobs/ai-job-runner.service.spec.ts',
      '/src/modules/ai-jobs/ai-job-provider-boundary.service.spec.ts',
    ],
    finalState: { executionLease: 'released-or-owned-once', reservation: 'settled-or-released-by-boundary' },
  },
  {
    id: 'S3',
    name: 'per-user semaphore saturation and release',
    files: ['/src/modules/ai-jobs/ai-job-semaphore.spec.ts'],
    finalState: { thirdJob: 'blocked-until-release', semaphore: 'converged' },
    redis: 'deterministic-in-memory-semaphore',
  },
  {
    id: 'S4',
    name: 'archive cancellation and deadline-conservative accounting',
    files: [
      '/src/modules/learning-projects/learning-projects.service.spec.ts',
      '/src/modules/ai-jobs/ai-job-lifecycle.service.spec.ts',
      '/src/modules/ai-jobs/ai-provider-deadline-janitor.service.spec.ts',
    ],
    finalState: { archivedContentWrite: 'blocked-by-status-check', unknownUsage: 'settled-at-reservation-ceiling' },
  },
  {
    id: 'S5',
    name: 'worker heartbeat healthy and degraded states',
    files: ['/src/modules/ai-jobs/ai-worker-heartbeat.service.spec.ts'],
    finalState: { workerHealth: 'degraded-when-missing-or-stale', mainReadiness: 'independent' },
    redis: 'deterministic-heartbeat-adapter',
  },
];

const serviceArtifact = await runEvidenceSuite({
  rootDir,
  suiteName: 'ai-queue-recovery',
  testFiles,
  groups,
  artifactFile: 'queue-recovery.json',
  coverageGaps: [],
});

if (process.env.AI_REAL_EVIDENCE_REQUIRED === '1') {
  const outputPath = resolve(rootDir, 'coverage/ai-course/queue-recovery.json');
  const real = JSON.parse(await readFile(resolve(rootDir, 'coverage/ai-course/ai-course-real-integration.json'), 'utf8'));
  if (real.status !== 'passed') throw new Error('real dependency evidence is not passed');
  const realIds = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q8', 'Q9', 'Q14']);
  const serviceIds = new Set(['Q6', 'Q7', 'Q10', 'Q11', 'Q12', 'Q13']);
  const scenarios = [
    ...real.scenarios.filter((scenario) => realIds.has(scenario.id)),
    ...serviceArtifact.scenarios.filter((scenario) => serviceIds.has(scenario.id)),
  ].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const expected = Array.from({ length: 14 }, (_, index) => `Q${index + 1}`);
  if (expected.some((id) => !scenarios.some((scenario) => scenario.id === id && scenario.status === 'passed'))) {
    throw new Error('Q1-Q14 evidence is incomplete');
  }
  await writeFile(outputPath, `${JSON.stringify({
    ...serviceArtifact,
    evidenceMode: 'mixed-real-dependency-and-service-fault-injection',
    dependencyBoundary: 'Q1-Q5/Q8/Q9/Q14 use real MySQL/Redis; remaining cases use deterministic service faults',
    testCounts: {
      passed: serviceArtifact.testCounts.passed + real.testCounts.passed,
      failed: serviceArtifact.testCounts.failed + real.testCounts.failed,
    },
    scenarios,
    coverageGaps: [
      'Q6/Q7/Q10-Q13 remain deterministic service-boundary faults; staging chaos rehearsal is a separate preflight.',
    ],
  }, null, 2)}\n`, 'utf8');
}
