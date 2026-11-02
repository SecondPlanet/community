import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runEvidenceSuite } from './evidence-runner.mjs';

function createRunner(jestResult) {
  return (command, args) => {
    if (command === 'git') return { status: 0, stdout: 'test-sha\n' };
    assert.equal(command, 'pnpm');
    const outputIndex = args.indexOf('--outputFile');
    assert.notEqual(outputIndex, -1);
    // The production dependency is spawnSync, so the injected fake must also
    // finish writing before it returns.
    writeFileSync(args[outputIndex + 1], JSON.stringify(jestResult), 'utf8');
    return { status: 0, stdout: '' };
  };
}

test('writes deterministic JSON and JUnit evidence for selected passing tests', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'aicourse-evidence-test-'));
  const timestamps = [new Date('2026-08-23T00:00:00.000Z'), new Date('2026-08-23T00:00:01.000Z')];
  try {
    const artifact = await runEvidenceSuite({
      rootDir,
      suiteName: 'fake-suite',
      testFiles: ['src/example.spec.ts'],
      groups: [{
        id: 'I1',
        name: 'safe deterministic scenario',
        files: ['/src/example.spec.ts'],
        finalState: { resource: 'private' },
      }],
      artifactFile: 'fake.json',
      junitFile: 'fake.xml',
    }, {
      runner: createRunner({
        numPassedTests: 1,
        numFailedTests: 0,
        testResults: [{
          name: '/checkout/src/example.spec.ts',
          status: 'passed',
          assertionResults: [{ status: 'passed', duration: 4 }],
        }],
      }),
      now: () => timestamps.shift(),
    });

    assert.equal(artifact.status, 'passed');
    assert.equal(artifact.gitSha, process.env.GITHUB_SHA ?? 'test-sha');
    assert.equal(artifact.scenarios[0].assertions, 1);
    const persisted = JSON.parse(await readFile(join(rootDir, 'coverage/ai-course/fake.json'), 'utf8'));
    assert.deepEqual(persisted, artifact);
    assert.match(await readFile(join(rootDir, 'coverage/ai-course/fake.xml'), 'utf8'), /failures="0"/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('fails closed when an expected Jest file is absent and persists failed evidence', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'aicourse-evidence-test-'));
  try {
    await assert.rejects(() => runEvidenceSuite({
      rootDir,
      suiteName: 'fake-suite',
      testFiles: ['src/missing.spec.ts'],
      groups: [{ id: 'Q1', name: 'required scenario', files: ['/src/missing.spec.ts'] }],
      artifactFile: 'failed.json',
    }, {
      runner: createRunner({ numPassedTests: 0, numFailedTests: 0, testResults: [] }),
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    }), /evidence failed/);

    const persisted = JSON.parse(await readFile(join(rootDir, 'coverage/ai-course/failed.json'), 'utf8'));
    assert.equal(persisted.status, 'failed');
    assert.equal(persisted.scenarios[0].status, 'failed');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
