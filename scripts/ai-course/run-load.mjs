import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runEvidenceSuite } from './evidence-runner.mjs';
import { loadAiCourseLocalEnv } from './load-local-env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAiCourseLocalEnv(rootDir);
for (const required of ['DATABASE_URL', 'REDIS_PORT']) {
  if (!process.env[required]) throw new Error(`${required} is required for AI course load evidence`);
}
const spec = '/src/modules/ai-jobs/ai-course-real.integration.spec.ts';
await runEvidenceSuite({
  rootDir,
  suiteName: 'ai-course-load',
  testFiles: [spec.slice(1)],
  groups: [{
    id: 'L1',
    name: '20 concurrent reservation attempts remain below the BYOK user token cap',
    files: [spec],
    assertionPattern: '\\bL1\\b',
    finalState: { requests: 20, accepted: 4, rejected: 16, reservedTokens: 48000, cap: 50000 },
    redis: 'real-isolated-prefix',
  }],
  artifactFile: 'ai-course-load.json',
  junitFile: 'junit-ai-load.xml',
  evidenceMode: 'real-mysql-concurrency',
  dependencyBoundary: '20 concurrent SERIALIZABLE ledger reservations against isolated fixture rows',
  coverageGaps: [],
});
const hubLoad = spawnSync(process.execPath, [resolve(rootDir, 'scripts/ai-course/run-hub-load.mjs')], { cwd: rootDir, stdio: 'inherit', env: process.env });
if (hubLoad.status !== 0) throw new Error('Hub/enqueue load evidence failed');
