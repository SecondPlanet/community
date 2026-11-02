import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAiCourseLocalEnv } from './load-local-env.mjs';

test('loads local env, preserves explicit values, and defaults Redis to loopback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-course-env-'));
  const previous = Object.fromEntries(
    ['DATABASE_URL', 'REDIS_HOST', 'REDIS_PORT'].map((key) => [key, process.env[key]]),
  );

  try {
    await writeFile(join(directory, '.env'), [
      'DATABASE_URL=mysql://from-file',
      'REDIS_HOST=redis-from-file',
      'REDIS_PORT=6380',
    ].join('\n'));
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_HOST;
    process.env.REDIS_PORT = '7777';

    loadAiCourseLocalEnv(directory);
    assert.equal(process.env.DATABASE_URL, 'mysql://from-file');
    assert.equal(process.env.REDIS_HOST, 'redis-from-file');
    assert.equal(process.env.REDIS_PORT, '7777');

    delete process.env.REDIS_HOST;
    loadAiCourseLocalEnv(join(directory, 'missing'));
    assert.equal(process.env.REDIS_HOST, '127.0.0.1');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
