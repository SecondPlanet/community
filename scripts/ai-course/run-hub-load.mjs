import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { loadAiCourseLocalEnv } from './load-local-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAiCourseLocalEnv(root);
for (const key of ['DATABASE_URL', 'REDIS_PORT']) if (!process.env[key]) throw new Error(`${key} is required`);
const mainPath = resolve(root, 'apps/api/dist/src/main.js');
await access(mainPath).catch(() => { throw new Error('API build missing; run pnpm build:api first'); });
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const { JwtService } = apiRequire('@nestjs/jwt');
const prisma = new PrismaClient({ log: [] });
const runId = randomUUID();
const userId = randomUUID();
const jwtSecret = randomBytes(32).toString('hex');
const port = 19_000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}/api/v1`;
const courseIds = Array.from({ length: 1000 }, () => randomUUID());
const startedAt = new Date();
let child;

function percentile(samples, value) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
}
async function waitForApi() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* booting */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('API did not become live');
}
async function sample(path, init, count = 100) {
  const durations = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    const response = await fetch(`${base}${path}`, init);
    const responseBody = await response.arrayBuffer();
    durations.push(performance.now() - start);
    if (!response.ok) throw new Error(`load fixture request failed with HTTP ${response.status}: ${Buffer.from(responseBody).toString('utf8').slice(0, 300)}`);
  }
  return { count, p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95), maxMs: Math.max(...durations) };
}

try {
  await prisma.$connect();
  await prisma.user.create({ data: { id: userId, email: `hub-load-${runId}@invalid.example`, passwordHash: 'fixture-only', name: 'Hub load fixture', role: 'student' } });
  await prisma.course.createMany({ data: courseIds.map((id, index) => ({ id, title: `Synthetic hub course ${index}`, description: 'fixture', learningPoints: 'fixture', instructor: 'fixture', level: 'Beginner', duration: '10 minutes', thumbnail: '', tags: 'fixture', costType: 'free', status: 'draft', courseType: 'own', origin: 'ai_personal', visibility: 'private', ownerUserId: userId })) });
  await prisma.learningProject.createMany({ data: courseIds.map((courseId, index) => ({ id: randomUUID(), userId, courseId, createRequestKey: `hub-${runId}-${index}`, seedText: `Synthetic seed ${index}`, status: 'plan_ready', updatedAt: new Date(Date.now() - index * 1000) })) });
  child = spawn(process.execPath, [mainPath], { cwd: root, env: { ...process.env, NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: String(port), JWT_SECRET: jwtSecret, AI_KEY_ENCRYPTION_KEY: randomBytes(32).toString('base64'), AI_PERSONAL_COURSES_ENABLED: 'true', AI_JOB_WORKER_ENABLED: 'false', AI_JOB_QUEUE_PREFIX: `hub-load-${runId}`, THROTTLE_SHORT: '10000', THROTTLE_MEDIUM: '10000', THROTTLER_REDIS_PREFIX: `hub-load-throttle-${runId}` }, stdio: ['ignore', 'ignore', 'ignore'] });
  await waitForApi();
  const jwt = new JwtService({ secret: jwtSecret });
  const headers = { Authorization: `Bearer ${jwt.sign({ sub: userId, role: 'student' }, { expiresIn: '10m' })}` };
  const hub = await sample('/learning-projects/me?limit=20', { headers });
  const enqueueHeaders = { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': runId };
  const enqueue = await sample('/learning-projects', { method: 'POST', headers: enqueueHeaders, body: JSON.stringify({ question: '用直觉解释注意力机制', goalType: 'systematic', targetLevel: 'Beginner', availableMinutes: 60 }) });
  const scenarios = [
    { id: 'L2', name: '1000-project Hub list, fixed 100 live HTTP samples', metric: hub },
    { id: 'L3', name: 'Idempotent enqueue, fixed 100 live HTTP samples', metric: enqueue },
  ].map((item) => ({ ...item, status: item.metric.p95Ms < 500 ? 'passed' : 'failed', durationMs: item.metric.maxMs, assertions: item.metric.count + 1, finalState: { datasetProjects: 1000, ...item.metric, p95ThresholdMs: 500 }, providerCalls: 0, promptHashOnly: true }));
  const passed = scenarios.every((item) => item.status === 'passed');
  const output = resolve(root, 'coverage/ai-course'); await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'ai-course-hub-load.json'), `${JSON.stringify({ schemaVersion: 1, gitSha: process.env.GITHUB_SHA ?? 'local-worktree', runId, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), status: passed ? 'passed' : 'failed', evidenceMode: 'real-http-mysql-redis-load', dependencyBoundary: '1000 synthetic private projects; fixed 100-request samples; enqueue uses one idempotency key', testCounts: { passed: scenarios.filter((item) => item.status === 'passed').length, failed: scenarios.filter((item) => item.status === 'failed').length }, scenarios, coverageGaps: [] }, null, 2)}\n`);
  if (!passed) throw new Error('Hub/enqueue p95 exceeded 500ms');
} finally {
  child?.kill('SIGTERM');
  await prisma.learningProject.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.course.deleteMany({ where: { ownerUserId: userId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
}
