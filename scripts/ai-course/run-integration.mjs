import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runEvidenceSuite } from './evidence-runner.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const testFiles = [
  'src/common/project-access/project-access-policy.service.spec.ts',
  'src/common/course-access/course-access-policy.service.spec.ts',
  'src/modules/learning-projects/learning-projects.service.spec.ts',
  'src/modules/personal-learning/personal-learning.service.spec.ts',
  'src/modules/ai-course-generation/ai-course-generation.schemas.spec.ts',
  'src/modules/ai-model-gateway/ai-model-gateway.service.spec.ts',
  'src/modules/ai-budget/ai-budget.service.spec.ts',
  'src/modules/progress/progress.service.spec.ts',
  'src/modules/certificates/certificates.service.spec.ts',
];

const groups = [
  {
    id: 'I1',
    name: 'private project owner, student B, admin and anonymous access matrix',
    files: [
      '/src/common/project-access/project-access-policy.service.spec.ts',
      '/src/common/course-access/course-access-policy.service.spec.ts',
    ],
    finalState: { privateResourceEnumeration: 'collapsed-to-404', anonymous: 'policy-denied' },
  },
  {
    id: 'I2',
    name: 'question to private course, blueprint approval and first lesson job',
    files: ['/src/modules/learning-projects/learning-projects.service.spec.ts'],
    finalState: { course: 'private-ai-personal', plan: 'versioned', firstLessonJob: 'pending' },
  },
  {
    id: 'I3',
    name: 'ready lesson, regeneration, variant, assessment and attempt lifecycle',
    files: ['/src/modules/personal-learning/personal-learning.service.spec.ts'],
    finalState: { oldReadyContent: 'preserved', assessment: 'public-projection', gradingJob: 'pending' },
  },
  {
    id: 'I4',
    name: 'deterministic structured generation and provider gateway behavior',
    files: [
      '/src/modules/ai-course-generation/ai-course-generation.schemas.spec.ts',
      '/src/modules/ai-model-gateway/ai-model-gateway.service.spec.ts',
    ],
    finalState: { provider: 'deterministic-fake', structuredOutput: 'validated' },
  },
  {
    id: 'I5',
    name: 'atomic reservation, BYOK separation and runtime budget switch',
    files: ['/src/modules/ai-budget/ai-budget.service.spec.ts'],
    finalState: { reservation: 'idempotent-per-execution', platformSwitch: 'asserted', byok: 'cost-zero' },
  },
  {
    id: 'I6',
    name: 'personal-course progress without points, badges or certificates',
    files: [
      '/src/modules/progress/progress.service.spec.ts',
      '/src/modules/certificates/certificates.service.spec.ts',
    ],
    finalState: { points: 'unchanged-for-personal-course', certificate: 'not-issued' },
  },
];

await runEvidenceSuite({
  rootDir,
  suiteName: 'ai-course-integration',
  testFiles,
  groups,
  artifactFile: 'ai-course-integration.json',
  junitFile: 'junit-ai-integration.xml',
  coverageGaps: [
    'This minimum gate is service-level and does not replace the planned isolated MySQL/Redis HTTP integration fixture.',
    'A single process does not prove concurrent 20-client reservation behavior against InnoDB locks.',
    'Anonymous HTTP 401 is enforced by JwtAuthGuard but this gate asserts the underlying private-resource policy only.',
  ],
});
