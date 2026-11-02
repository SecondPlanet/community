import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scanEvidence } from './scan-evidence.mjs';

test('accepts state-only evidence with prompt hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aicourse-scan-test-'));
  const file = join(directory, 'evidence.json');
  try {
    await writeFile(file, JSON.stringify({ promptHashOnly: true, finalState: { job: 'settled' } }));
    await scanEvidence([file]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects raw prompt fields and PII without echoing their values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aicourse-scan-test-'));
  const rawPrompt = join(directory, 'raw-prompt.json');
  const pii = join(directory, 'pii.xml');
  try {
    await writeFile(rawPrompt, JSON.stringify({ prompt: 'private study request' }));
    await writeFile(pii, '<testsuite owner="learner@example.com" />');
    await assert.rejects(() => scanEvidence([rawPrompt]), /forbidden evidence field/);
    await assert.rejects(() => scanEvidence([pii]), /email address found/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
