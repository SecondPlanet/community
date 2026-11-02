import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { loadAiCourseLocalEnv } from './load-local-env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadAiCourseLocalEnv(rootDir);
if (!process.env.DATABASE_URL || !process.env.REDIS_PORT) {
  throw new Error('DATABASE_URL and REDIS_PORT are required');
}
const apiRequire = createRequire(resolve(rootDir, 'apps/api/package.json'));
const { JwtService } = apiRequire('@nestjs/jwt');
const mainPath = resolve(rootDir, 'apps/api/dist/src/main.js');
await access(mainPath).catch(() => { throw new Error('API build missing; run pnpm build:api first'); });
const runId = randomUUID();
const jwtSecret = randomBytes(32).toString('hex');
const encryptionKey = randomBytes(32).toString('base64');
const port = 18_000 + Math.floor(Math.random() * 1_000);
const base = `http://127.0.0.1:${port}/api/v1`;
const prisma = new PrismaClient({ log: [] });
const jwt = new JwtService({ secret: jwtSecret });
const startedAt = new Date();
let child;
let fixture;

async function createFixture() {
  const runtimeBefore = await prisma.aiRuntimeControl.findUniqueOrThrow({ where: { id: 1 } });
  await prisma.aiRuntimeControl.update({ where: { id: 1 }, data: { personalCoursesDisabled: false, disabledReason: null, disabledAt: null } });
  const users = await Promise.all(['student', 'student', 'admin'].map((role, index) => prisma.user.create({
    data: {
      email: `http-matrix-${runId}-${index}@invalid.example`,
      passwordHash: 'fixture-only',
      name: `HTTP fixture ${index}`,
      role,
    },
  })));
  const [owner, studentB, admin] = users;
  const course = await prisma.course.create({ data: {
    title: 'HTTP private fixture', description: 'fixture', learningPoints: 'fixture', instructor: 'fixture',
    level: 'Beginner', duration: '10 minutes', thumbnail: '', tags: 'fixture', costType: 'free',
    status: 'draft', courseType: 'own', origin: 'ai_personal', visibility: 'private', ownerUserId: owner.id,
  } });
  const chapter = await prisma.chapter.create({ data: { courseId: course.id, title: 'Fixture', orderIndex: 0 } });
  const lesson = await prisma.lesson.create({ data: { chapterId: chapter.id, title: 'Fixture', orderIndex: 0 } });
  await prisma.enrollment.create({ data: { userId: owner.id, courseId: course.id, source: 'direct' } });
  const project = await prisma.learningProject.create({ data: {
    userId: owner.id, courseId: course.id, createRequestKey: randomUUID(), seedText: 'fixture', status: 'ready',
  } });
  await prisma.lessonContent.create({ data: { lessonId: lesson.id, status: 'ready', blocks: [] } });
  const job = await prisma.aiGenerationJob.create({ data: {
    userId: owner.id, projectId: project.id, lessonId: lesson.id, type: 'lesson_content',
    requestKey: `${owner.id}:http:${randomUUID()}`, inputHash: 'fixture',
  } });
  const assessment = await prisma.assessment.create({ data: {
    projectId: project.id, lessonId: lesson.id, kind: 'lesson_check', status: 'ready',
    lessonContentVersion: 1,
    questions: [{
      id: 'q1', type: 'single_choice', prompt: 'Synthetic fixture question',
      options: [{ id: 'A', text: 'A', isCorrect: true }, { id: 'B', text: 'B', isCorrect: false }],
      correctAnswer: 'A', rubric: {}, conceptKeys: [], explanation: 'fixture',
    }],
  } });
  const practice = await prisma.practiceProject.create({ data: {
    courseId: course.id, title: 'Private practice fixture', description: 'fixture',
    projectUrl: 'https://invalid.test/practice', projectType: 'notebook', orderIndex: 0,
  } });
  const enrollCourse = await prisma.course.create({ data: {
    title: 'HTTP private enrollment fixture', description: 'fixture', learningPoints: 'fixture', instructor: 'fixture',
    level: 'Beginner', duration: '10 minutes', thumbnail: '', tags: 'fixture', costType: 'free',
    status: 'draft', courseType: 'own', origin: 'ai_personal', visibility: 'private', ownerUserId: owner.id,
  } });
  return { users, owner, studentB, admin, course, enrollCourse, lesson, project, job, assessment, practice, runtimeBefore };
}

function token(user) {
  return jwt.sign({ sub: user.id, role: user.role }, { expiresIn: '5m' });
}

async function waitForApi() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch { /* booting */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('API did not become live');
}

async function status(path, user, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  await response.arrayBuffer();
  return response.status;
}

async function requestJson(path, user, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

try {
  await prisma.$connect();
  fixture = await createFixture();
  child = spawn(process.execPath, [mainPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: String(port),
      JWT_SECRET: jwtSecret, AI_KEY_ENCRYPTION_KEY: encryptionKey,
      AI_PERSONAL_COURSES_ENABLED: 'true', AI_JOB_WORKER_ENABLED: 'false',
      AI_JOB_QUEUE_PREFIX: `http-matrix-${runId}`,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await waitForApi();
  const resources = [
    { id: 'project', path: `/learning-projects/${fixture.project.id}` },
    { id: 'lesson', path: `/learning-projects/${fixture.project.id}/lessons/${fixture.lesson.id}/content` },
    { id: 'job', path: `/learning-projects/${fixture.project.id}/jobs/${fixture.job.id}` },
    { id: 'assessment', path: `/learning-projects/${fixture.project.id}/assessments/${fixture.assessment.id}` },
  ];
  const scenarios = [];
  for (const resource of resources) {
    const actual = {
      owner: await status(resource.path, fixture.owner),
      studentB: await status(resource.path, fixture.studentB),
      admin: await status(resource.path, fixture.admin),
      anonymous: await status(resource.path),
    };
    const expected = { owner: 200, studentB: 404, admin: 200, anonymous: 401 };
    const passed = Object.entries(expected).every(([key, value]) => actual[key] === value);
    scenarios.push({
      id: `P-${resource.id}`,
      name: `${resource.id} owner/B/admin/anonymous HTTP matrix`,
      status: passed ? 'passed' : 'failed', durationMs: 0, assertions: 4,
      finalState: actual, providerCalls: 0, promptHashOnly: true,
    });
  }
  const protectedMutations = [
    { id: 'progress-complete', path: `/progress/lessons/${fixture.lesson.id}/complete`, method: 'POST', owner: 201 },
    { id: 'notes-read', path: `/lessons/${fixture.lesson.id}/notes`, method: 'GET', owner: 200 },
    { id: 'notes-create', path: `/lessons/${fixture.lesson.id}/notes`, method: 'POST', body: { content: 'Synthetic note fixture' }, owner: 201 },
    { id: 'learning-event', path: '/learning-events', method: 'POST', body: { lessonId: fixture.lesson.id, eventType: 'personal_lesson_opened' }, owner: 201 },
    { id: 'enrollment-free', path: `/enrollments/courses/${fixture.enrollCourse.id}/free`, method: 'POST', owner: 201 },
    { id: 'practice-access', path: `/practices/courses/${fixture.course.id}/access`, method: 'GET', owner: 200 },
    { id: 'practice-start', path: `/practices/${fixture.practice.id}/start`, method: 'POST', owner: 201 },
    { id: 'review-create', path: `/courses/${fixture.course.id}/reviews`, method: 'POST', body: { rating: 5, content: 'Synthetic private course review.' }, owner: 201 },
  ];
  for (const resource of protectedMutations) {
    const throttlePause = resource.id === 'review-create'
      ? () => new Promise((resolvePromise) => setTimeout(resolvePromise, 3_100))
      : async () => undefined;
    const actual = {
      owner: await status(resource.path, fixture.owner, resource.method, resource.body),
      studentB: (await throttlePause(), await status(resource.path, fixture.studentB, resource.method, resource.body)),
      anonymous: (await throttlePause(), await status(resource.path, undefined, resource.method, resource.body)),
    };
    const expected = { owner: resource.owner, studentB: 404, anonymous: 401 };
    const passed = Object.entries(expected).every(([key, value]) => actual[key] === value);
    scenarios.push({ id: `P-${resource.id}`, name: `${resource.id} owner/B/anonymous live HTTP`, status: passed ? 'passed' : 'failed', durationMs: 0, assertions: 3, finalState: actual, providerCalls: 0, promptHashOnly: true });
  }
  const publicCapability = await requestJson('/ai-personal-courses/capabilities');
  const runtimeAdmin = await requestJson('/admin/ai-operations/runtime-control', fixture.admin);
  const runtimeB = await status('/admin/ai-operations/runtime-control', fixture.studentB);
  const runtimeAnonymous = await status('/admin/ai-operations/runtime-control');
  const disabled = await requestJson('/admin/ai-operations/runtime-control/personal-courses', fixture.admin, 'PATCH', {
    disabled: true, reason: 'Synthetic HTTP gate', expectedUpdatedAt: runtimeAdmin.body.updatedAt,
  });
  const disabledCapability = await requestJson('/ai-personal-courses/capabilities');
  const forbiddenMutation = await status('/admin/ai-operations/runtime-control/personal-courses', fixture.studentB, 'PATCH', {
    disabled: false, expectedUpdatedAt: disabled.body.updatedAt,
  });
  const anonymousMutation = await status('/admin/ai-operations/runtime-control/personal-courses', undefined, 'PATCH', {
    disabled: false, expectedUpdatedAt: disabled.body.updatedAt,
  });
  const restored = await requestJson('/admin/ai-operations/runtime-control/personal-courses', fixture.admin, 'PATCH', {
    disabled: false, expectedUpdatedAt: disabled.body.updatedAt,
  });
  const controlPassed = publicCapability.status === 200 && publicCapability.body.enabled === true &&
    runtimeAdmin.status === 200 && runtimeB === 403 && runtimeAnonymous === 401 && disabled.status === 200 &&
    disabledCapability.status === 200 && disabledCapability.body.enabled === false && forbiddenMutation === 403 &&
    anonymousMutation === 401 && restored.status === 200 && restored.body.personalCoursesDisabled === false;
  scenarios.push({ id: 'P-runtime-control', name: 'public capability and admin-only kill-switch live HTTP', status: controlPassed ? 'passed' : 'failed', durationMs: 0, assertions: 11, finalState: { capabilityEnabled: publicCapability.body.enabled, adminRead: runtimeAdmin.status, studentBRead: runtimeB, anonymousRead: runtimeAnonymous, disabledCapability: disabledCapability.body.enabled, studentBMutation: forbiddenMutation, anonymousMutation, restored: restored.body.personalCoursesDisabled === false }, providerCalls: 0, promptHashOnly: true });
  const passed = scenarios.every((scenario) => scenario.status === 'passed');
  const outputDir = resolve(rootDir, 'coverage/ai-course');
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'http-permissions.json'), `${JSON.stringify({
    schemaVersion: 1, gitSha: process.env.GITHUB_SHA ?? 'local-worktree', runId,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    status: passed ? 'passed' : 'failed', evidenceMode: 'real-http-mysql-redis',
    dependencyBoundary: 'live Nest API with synthetic UUID fixtures',
    testCounts: { passed: scenarios.filter((item) => item.status === 'passed').length, failed: scenarios.filter((item) => item.status === 'failed').length },
    scenarios, coverageGaps: [],
  }, null, 2)}\n`);
  if (!passed) throw new Error('HTTP permission matrix failed');
} finally {
  child?.kill('SIGTERM');
  if (fixture) {
    await prisma.aiRuntimeControl.update({ where: { id: 1 }, data: {
      personalCoursesDisabled: fixture.runtimeBefore.personalCoursesDisabled,
      disabledReason: fixture.runtimeBefore.disabledReason,
      disabledAt: fixture.runtimeBefore.disabledAt,
    } }).catch(() => undefined);
    await prisma.learningProject.deleteMany({ where: { id: fixture.project.id } }).catch(() => undefined);
    await prisma.course.deleteMany({ where: { id: { in: [fixture.course.id, fixture.enrollCourse.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: fixture.users.map((user) => user.id) } } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}
