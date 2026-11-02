import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runEvidenceSuite } from './evidence-runner.mjs';
import { loadAiCourseLocalEnv } from './load-local-env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAiCourseLocalEnv(rootDir);
for (const required of ['DATABASE_URL', 'REDIS_PORT']) {
  if (!process.env[required]) throw new Error(`${required} is required for real AI course integration`);
}
const spec = '/src/modules/ai-jobs/ai-course-real.integration.spec.ts';

await runEvidenceSuite({
  rootDir,
  suiteName: 'ai-course-real-integration',
  testFiles: [spec.slice(1)],
  groups: [
    {
      id: 'Q1',
      name: 'Redis unavailable leaves the DB outbox pending and later dispatches once',
      files: [spec], assertionPattern: '\\bQ1\\b',
      finalState: { firstDispatch: 0, dbEnqueueStatus: 'pending-then-enqueued', redisCopies: 1 },
      redis: 'real-isolated-prefix',
    },
    {
      id: 'Q2',
      name: 'Redis accepted add followed by dispatcher response loss',
      files: [spec],
      assertionPattern: '\\bQ2\\b',
      finalState: { redisCopies: 1, dbEnqueueStatus: 'enqueued' },
      redis: 'real-isolated-prefix',
    },
    {
      id: 'Q3',
      name: 'missing Redis job reconciliation uses the original fixed job id',
      files: [spec], assertionPattern: '\\bQ3\\b',
      finalState: { redisDeleted: true, restoredCopies: 1 },
      redis: 'real-isolated-prefix',
    },
    {
      id: 'Q8',
      name: 'dual dispatcher and worker atomic claim',
      files: [spec],
      assertionPattern: '\\bQ8\\b',
      finalState: { dispatcherClaims: 1, workerClaims: 1, providerCalls: 1 },
      redis: 'real-isolated-prefix',
    },
    {
      id: 'Q9',
      name: 'real Redis per-user semaphore saturation and release',
      files: [spec], assertionPattern: '\\bQ9\\b',
      finalState: { concurrencyLimit: 2, thirdBlocked: true, resumedAfterRelease: true },
      redis: 'real-isolated-prefix',
    },
    {
      id: 'Q14',
      name: 'concurrent manual retry converges on one execution and response',
      files: [spec],
      assertionPattern: '\\bQ14\\b',
      finalState: { executionNo2Rows: 1, acceptedResponses: 2 },
      redis: 'real-isolated-prefix',
    },
    {
      id: 'L1',
      name: '20 concurrent BYOK reservations remain below the user token cap',
      files: [spec], assertionPattern: '\\bL1\\b',
      finalState: { requests: 20, reservations: 4, reservedTokens: 48000, tokenCap: 50000 },
      redis: 'not-required',
    },
    {
      id: 'Q4',
      name: 'child process crash before provider and restart recovery',
      files: [spec],
      assertionPattern: '\\bQ4\\b',
      finalState: { crashedExitCode: 86, restartedJob: 'succeeded', providerCalls: 1 },
      redis: 'real-isolated-prefix',
    },
    {
      id: 'Q5',
      name: 'child process crash after provider success without duplicate call',
      files: [spec],
      assertionPattern: '\\bQ5\\b',
      finalState: { crashedExitCode: 86, duplicateProviderCalls: 0 },
      redis: 'real-isolated-prefix',
    },
  ],
  artifactFile: 'ai-course-real-integration.json',
  junitFile: 'junit-ai-real-integration.xml',
  evidenceMode: 'real-dependency-fault-injection',
  dependencyBoundary: 'isolated MySQL fixture rows, isolated BullMQ prefix, and child-process crash injection',
  coverageGaps: [
    'The fixture uses the configured shared schema but isolates all rows by generated UUID and deletes them after the suite.',
    'Provider success is deterministic and local; no external provider is contacted.',
  ],
});
