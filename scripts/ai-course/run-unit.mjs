import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvidenceSuite } from './evidence-runner.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const testFiles = [
  'src/config/ai-personal-courses.config.spec.ts',
  'src/common/guards/ai-personal-courses-enabled.guard.spec.ts',
  'src/common/project-access/project-access-policy.service.spec.ts',
  'src/common/course-access/course-access-policy.service.spec.ts',
  'src/modules/ai-budget/ai-budget.service.spec.ts',
  'src/modules/ai-course-generation/ai-course-generation.schemas.spec.ts',
  'src/modules/ai-course-generation/ai-course-generation.processor.spec.ts',
  'src/modules/ai-model-gateway/ai-model-gateway.service.spec.ts',
  'src/modules/ai-jobs/ai-job-dispatcher.service.spec.ts',
  'src/modules/ai-jobs/ai-job-runner.service.spec.ts',
  'src/modules/ai-jobs/ai-job-provider-boundary.service.spec.ts',
  'src/modules/ai-jobs/ai-provider-deadline-janitor.service.spec.ts',
];

await runEvidenceSuite({
  rootDir,
  suiteName: 'ai-course-unit',
  testFiles,
  groups: [{
    id: 'U1',
    name: 'AI configuration, access, schema, budget and job state-machine unit suite',
    files: testFiles.map((file) => `/${file}`),
    finalState: { externalDependencies: 'none', deterministic: true },
  }],
  artifactFile: 'ai-course-unit.json',
  junitFile: 'junit-ai-unit.xml',
  coverageGaps: [],
});
