import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { runEvidenceSuite } from './evidence-runner.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifactPath = resolve(rootDir, 'coverage/ai-course/contract-report.json');
const startedAt = new Date();
const testFiles = [
  'src/common/filters/all-exceptions.filter.spec.ts',
  'src/config/ai-personal-courses.config.spec.ts',
  'src/modules/ai-course-generation/ai-course-generation.schemas.spec.ts',
  'src/modules/courses/courses.dto.spec.ts',
  'src/modules/learning-projects/learning-projects.service.spec.ts',
  'src/modules/personal-learning/personal-learning.service.spec.ts',
  'src/modules/ai-operations/ai-operations.controller.spec.ts',
  'src/modules/ai-operations/ai-personal-openapi.contract.spec.ts',
];

const jestEvidence = await runEvidenceSuite({
  rootDir,
  suiteName: 'ai-course-contracts',
  testFiles,
  groups: [{
    id: 'C1',
    name: 'DTO, Zod, route response and environment contracts',
    files: testFiles.map((file) => `/${file}`),
    finalState: { dtoSchemas: 'validated', routeContracts: 'validated' },
  }],
  artifactFile: 'contract-report.json',
  junitFile: 'junit-ai-contracts.xml',
});

function run(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    outputHashOnly: true,
  };
}

const sharedTypes = run('pnpm', ['--filter', '@secondplanet/shared-types', 'build']);
const goCompatibility = run('go', ['build', './...'], resolve(rootDir, 'apps/api-go'));
const previous = JSON.parse(await readFile(artifactPath, 'utf8'));
const status = sharedTypes.status === 'passed' && goCompatibility.status === 'passed'
  ? 'passed'
  : 'failed';
const report = {
  ...previous,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  status,
  scenarios: [
    ...jestEvidence.scenarios,
    { id: 'C2', name: 'shared-types compile', status: sharedTypes.status, durationMs: 0, assertions: 1, finalState: sharedTypes, promptHashOnly: true },
    { id: 'C3', name: 'Go schema compatibility compile', status: goCompatibility.status, durationMs: 0, assertions: 1, finalState: goCompatibility, promptHashOnly: true },
  ],
};
await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (status !== 'passed') throw new Error('AI course contract evidence failed');
