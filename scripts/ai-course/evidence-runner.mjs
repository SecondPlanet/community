import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function gitSha(rootDir, runner) {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const result = runner('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? String(result.stdout).trim() : 'unknown';
}

function resultForGroup(group, testResults) {
  const matching = testResults.filter((result) =>
    group.files.some((file) => String(result.name).replaceAll('\\', '/').endsWith(file)),
  );
  const allAssertions = matching.flatMap((result) => result.assertionResults ?? []);
  const assertions = group.assertionPattern
    ? allAssertions.filter((assertion) => new RegExp(group.assertionPattern).test(assertion.fullName ?? assertion.title ?? ''))
    : allAssertions;
  const failed = matching.length !== group.files.length ||
    assertions.length === 0 ||
    (!group.assertionPattern && matching.some((result) => result.status === 'failed')) ||
    assertions.some((assertion) => assertion.status === 'failed');
  return {
    id: group.id,
    name: group.name,
    status: failed ? 'failed' : 'passed',
    durationMs: assertions.reduce((sum, assertion) => sum + (assertion.duration ?? 0), 0),
    assertions: assertions.length,
    finalState: group.finalState,
    redis: group.redis ?? 'not-required-service-fake',
    providerCalls: group.providerCalls ?? 'asserted-by-selected-tests',
    promptHashOnly: true,
  };
}

function junitXml(suiteName, scenarios) {
  const failures = scenarios.filter((scenario) => scenario.status === 'failed').length;
  const duration = scenarios.reduce((sum, scenario) => sum + scenario.durationMs, 0) / 1000;
  const cases = scenarios.map((scenario) => {
    const failure = scenario.status === 'failed'
      ? '<failure message="Selected Jest evidence was missing or failed" />'
      : '';
    return `  <testcase classname="${xmlEscape(suiteName)}" name="${xmlEscape(scenario.id)} ${xmlEscape(scenario.name)}" time="${(scenario.durationMs / 1000).toFixed(3)}">${failure}</testcase>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xmlEscape(suiteName)}" tests="${scenarios.length}" failures="${failures}" time="${duration.toFixed(3)}">\n${cases}\n</testsuite>\n`;
}

export async function runEvidenceSuite(options, dependencies = {}) {
  const runner = dependencies.runner ?? spawnSync;
  const now = dependencies.now ?? (() => new Date());
  const rootDir = resolve(options.rootDir);
  const outputDir = resolve(rootDir, options.outputDir ?? 'coverage/ai-course');
  const startedAt = now();
  const runId = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
    : randomUUID();
  const temporaryDir = join(tmpdir(), `aicourse-evidence-${runId}`);
  const jestOutput = join(temporaryDir, 'jest-results.json');
  await mkdir(temporaryDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  let commandResult;
  let parsed = { testResults: [], numPassedTests: 0, numFailedTests: 1 };
  try {
    const args = [
      '--filter', '@secondplanet/api', 'exec', 'jest', '--runInBand',
      '--json', '--outputFile', jestOutput,
      ...options.testFiles,
    ];
    commandResult = runner('pnpm', args, {
      cwd: rootDir,
      env: { ...process.env, NODE_ENV: 'test', AI_PERSONAL_COURSES_ENABLED: 'false' },
      stdio: 'inherit',
    });
    try {
      parsed = JSON.parse(await readFile(jestOutput, 'utf8'));
    } catch {
      parsed = { testResults: [], numPassedTests: 0, numFailedTests: 1 };
    }

    const scenarios = options.groups.map((group) => resultForGroup(group, parsed.testResults ?? []));
    const passed = commandResult.status === 0 && scenarios.every((scenario) => scenario.status === 'passed');
    const finishedAt = now();
    const artifact = {
      schemaVersion: 1,
      gitSha: gitSha(rootDir, runner),
      runId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      status: passed ? 'passed' : 'failed',
      evidenceMode: options.evidenceMode ?? 'service-level-fake',
      dependencyBoundary: options.dependencyBoundary ?? 'no external network; selected tests use deterministic in-memory adapters',
      testCounts: {
        passed: parsed.numPassedTests ?? 0,
        failed: parsed.numFailedTests ?? 0,
      },
      scenarios,
      coverageGaps: options.coverageGaps ?? [],
    };
    await writeFile(
      join(outputDir, options.artifactFile),
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf8',
    );
    if (options.junitFile) {
      await writeFile(
        join(outputDir, options.junitFile),
        junitXml(options.suiteName, scenarios),
        'utf8',
      );
    }
    if (!passed) {
      throw new Error(`${options.suiteName} evidence failed`);
    }
    return artifact;
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}
