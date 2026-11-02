#!/usr/bin/env node
/**
 * e2e-real-flow.mjs — 真实依赖 E2E 业务流
 *
 * 前置:
 *   - MySQL/Redis/MinIO 三件套已起
 *   - API 已启动并通过 /api/v1/health/ready (status=ok)
 *   - 已 prisma migrate deploy + 生产 bootstrap (空库 → 自动建 admin)
 *
 * 跑:
 *   node scripts/e2e-real-flow.mjs                 (用 env: API_BASE_URL=http://127.0.0.1:8080/api)
 *   API_BASE_URL=http://api:8080/api node ...      (CI 默认)
 *
 * 覆盖业务流(任何一步失败 exit 1):
 *   1. 注册 — POST /api/v1/auth/register
 *   2. 登录 — POST /api/v1/auth/login, 拿 accessToken
 *   3. 选课 — GET /api/v1/courses, 找 costType=free/charity 的课
 *   4. 报名 — POST /api/v1/enrollments/courses/:id/free
 *   5. 拿课时 — GET /api/v1/courses/:id, 递归 chapters[].lessons[].id
 *   6. 完课 — POST /api/v1/progress/lessons/:lessonId/complete (每节都调)
 *   7. 证书 — 完成所有课时后, GET /api/v1/certificates 验证签发
 *   8. 通知 — GET /api/v1/notifications 验证「课程完成, 证书已签发」通知
 *   9. 进度 — GET /api/v1/progress/me/stats 验证 completedLessons > 0
 *
 * 与前端 Playwright smoke 互不替代:
 *   - Playwright smoke 验证前端壳层 + 路由
 *   - 本脚本验证后端 + DB + Redis + MinIO + 业务流 真链路
 *
 * 失败时输出: HTTP status, response body, 错误 step 名, 然后 exit 1。
 * 成功时输出: 每步一行 + 总结 "ALL CHECKS PASSED", exit 0。
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from '../deploy/validate-production-env.mjs';

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8080/api';
const MAX_READY_WAIT_MS = 60_000;
const APP_VERSION = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
).version;

const RUN_ID = randomUUID().slice(0, 8);
const TEST_EMAIL = `e2e-real-${Date.now()}-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'E2eRealFlow!2026StrongPwd';
const TEST_NAME = `E2E Real ${RUN_ID}`;

const log = {
  info: (msg) => console.log(`[e2e]   ${msg}`),
  step: (n, msg) => console.log(`[e2e] ${n}. ${msg}`),
  ok: (msg) => console.log(`[e2e]   ✅ ${msg}`),
  fail: (msg, extra) => {
    console.error(`[e2e]   ❌ ${msg}`);
    if (extra !== undefined) console.error(`[e2e]      ${extra}`);
  },
};

// ---------- helpers ----------

let accessToken = null;
const bearer = () => {
  if (!accessToken) throw new Error('accessToken 未获取, 请先调 /auth/login');
  return { Authorization: `Bearer ${accessToken}` };
};

async function api(method, path, { body, headers = {}, expect = [200, 201] } = {}) {
  const url = `${API_BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!expect.includes(res.status)) {
    throw new Error(
      `HTTP ${res.status} ${method} ${path}\n` +
        `  body: ${text.slice(0, 500)}`,
    );
  }
  return json;
}

// ---------- step 0: wait for /health/ready ----------

async function waitForReady() {
  log.step(0, `等待 API 就绪 (${API_BASE}/v1/health/ready)`);
  const deadline = Date.now() + MAX_READY_WAIT_MS;
  let lastBody = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/v1/health/ready`);
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      lastBody = text;
      // readiness: 200 + status=ok = 真 ready
      // readiness: 503 + status=degraded = 还没好 (启动期, 或某依赖没起来)
      if (res.status === 200 && json?.status === 'ok') {
        log.ok(
          `API ready (mysql=${json.checks?.mysql}, redis=${json.checks?.redis}, minio=${json.checks?.minio})`,
        );
        return;
      }
    } catch { /* keep waiting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API 在 ${MAX_READY_WAIT_MS}ms 内未 ready, last body: ${lastBody?.slice(0, 200)}`);
}

// ---------- 业务流 ----------

async function step1_register() {
  log.step(1, `注册: ${TEST_EMAIL}`);
  const res = await api('POST', '/v1/auth/register', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME },
    expect: [200, 201],
  });
  if (!res?.user?.id) throw new Error('register 返回缺少 user.id');
  log.ok(`userId=${res.user.id}, role=${res.user.role}`);
  return res;
}

async function step2_login() {
  log.step(2, '登录拿 accessToken');
  const res = await api('POST', '/v1/auth/login', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    expect: [200],
  });
  if (!res?.accessToken) throw new Error('login 返回缺少 accessToken');
  accessToken = res.accessToken;
  log.ok(`accessToken len=${accessToken.length}, user.role=${res.user?.role}`);
  return res;
}

async function step3_listCourses() {
  log.step(3, '列课程, 找 free/charity');
  const res = await api('GET', '/v1/courses?status=published', {
    headers: bearer(),
    expect: [200],
  });
  const list = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('courses 列表为空, seed 数据可能未导入');
  }
  const free = list.find(
    (c) => c.costType === 'free' || c.costType === 'charity',
  );
  if (!free) {
    const summary = list.slice(0, 5).map((c) => `${c.id}/${c.costType}`).join(', ');
    throw new Error(`没有 free/charity 课程 (前 5 个: ${summary})`);
  }
  log.ok(`找到 free 课: id=${free.id}, title=${JSON.stringify(free.title)}, costType=${free.costType}`);
  return free;
}

async function step4_enroll(courseId) {
  log.step(4, `报名 free 课: ${courseId}`);
  // 免费课报名, 后端会自动 upsert
  const res = await api('POST', `/v1/enrollments/courses/${courseId}/free`, {
    headers: bearer(),
    expect: [200, 201],
  });
  log.ok(`enrollment: ${JSON.stringify(res).slice(0, 200)}`);
  return res;
}

async function step5_getLessons(courseId) {
  log.step(5, `拿课时: courseId=${courseId}`);
  const res = await api('GET', `/v1/courses/${courseId}`, {
    headers: bearer(),
    expect: [200],
  });
  const lessons = [];
  for (const chapter of res.chapters ?? []) {
    for (const lesson of chapter.lessons ?? []) {
      lessons.push({ id: lesson.id, title: lesson.title, chapterTitle: chapter.title });
    }
  }
  if (lessons.length === 0) {
    throw new Error(`课程 ${courseId} 没有任何课时, E2E 无法继续`);
  }
  log.ok(`课时数: ${lessons.length}, 首节: ${JSON.stringify(lessons[0])}`);
  return lessons;
}

async function step6_completeLessons(lessons) {
  log.step(6, `完成 ${lessons.length} 个课时`);
  for (let i = 0; i < lessons.length; i++) {
    const { id, title } = lessons[i];
    const res = await api('POST', `/v1/progress/lessons/${id}/complete`, {
      headers: bearer(),
      expect: [200, 201],
    });
    const completed = res?.courseProgress?.completedLessons ?? res?.record?.status;
    log.ok(`  [${i + 1}/${lessons.length}] ${title}: completed=${completed}, certificate=${res?.certificate ? 'YES' : 'no'}`);
  }
  log.ok('全部课时完成');
}

async function step7_listCertificates(courseId) {
  log.step(7, `验证证书: courseId=${courseId}`);
  const res = await api('GET', '/v1/certificates', {
    headers: bearer(),
    expect: [200],
  });
  const list = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
  const courseCert = list.find(
    (c) => (c.type === 'course' || c.certificateType === 'course') && c.refId === courseId,
  );
  if (!courseCert) {
    throw new Error(
      `没有找到课程 ${courseId} 的证书, 当前证书: ${JSON.stringify(list).slice(0, 300)}`,
    );
  }
  log.ok(`course 证书: id=${courseCert.id}, serial=${courseCert.serialNumber}`);
  return courseCert;
}

async function step8_listNotifications() {
  log.step(8, '验证通知中心收到「证书签发」通知');
  const res = await api('GET', '/v1/notifications?limit=20', {
    headers: bearer(),
    expect: [200],
  });
  // v1.5.5: total 字段语义 = 当前过滤范围总条数 (含已读+未读, 不再只是未读)
  const list = res?.items ?? res?.data ?? [];
  const total = res?.total;
  const certNotif = list.find(
    (n) => n.type === 'announcement' && /证书/.test(n.title ?? ''),
  );
  if (!certNotif) {
    throw new Error(
      `没有找到「证书签发」通知, 当前通知: ${JSON.stringify(list).slice(0, 300)}`,
    );
  }
  if (typeof total === 'number' && total < 1) {
    throw new Error(`total 字段应为 >= 1, 实际 ${total} (v1.5.5 语义回归)`);
  }
  log.ok(`找到证书通知: ${JSON.stringify(certNotif).slice(0, 200)}, total=${total}`);
  return res;
}

async function step9_progressStats() {
  log.step(9, '验证 progress/me/stats 反映完成情况');
  const res = await api('GET', '/v1/progress/me/stats', {
    headers: bearer(),
    expect: [200],
  });
  const completed = res?.totalCompletedLessons ?? res?.completedLessons ?? 0;
  if (completed < 1) {
    throw new Error(`totalCompletedLessons 应 >= 1, 实际 ${JSON.stringify(res).slice(0, 200)}`);
  }
  log.ok(`completedLessons=${completed}, weekCompleted=${res?.weekCompletedLessons ?? '?'}`);
  return res;
}

// ---------- main ----------

async function main() {
  console.log(`[e2e] ==========================================`);
  console.log(`[e2e] 真实依赖 E2E 业务流 — runId=${RUN_ID}`);
  console.log(`[e2e] API_BASE_URL = ${API_BASE}`);
  console.log(`[e2e] TEST_USER    = ${TEST_EMAIL}`);
  console.log(`[e2e] ==========================================`);

  await waitForReady();
  await step1_register();
  await step2_login();
  const course = await step3_listCourses();
  await step4_enroll(course.id);
  const lessons = await step5_getLessons(course.id);
  await step6_completeLessons(lessons);
  await step7_listCertificates(course.id);
  await step8_listNotifications();
  await step9_progressStats();

  console.log(`[e2e] ==========================================`);
  console.log(`[e2e] ✅ ALL CHECKS PASSED — v${APP_VERSION} 真实业务流 E2E 通过`);
  console.log(`[e2e] ==========================================`);
}

async function cleanupLocalTestUser() {
  const hostname = new URL(API_BASE).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) return;

  if (!process.env.DATABASE_URL) {
    const localEnv = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
    process.env.DATABASE_URL = localEnv.DATABASE_URL;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const result = await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    if (result.count > 0) log.ok(`已清理本地测试账号: ${TEST_EMAIL}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((err) => {
    log.fail('E2E 失败', err.stack || err.message);
    console.error(`[e2e] ==========================================`);
    console.error(`[e2e] ❌ E2E FAILED`);
    console.error(`[e2e] ==========================================`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupLocalTestUser();
    } catch (cleanupError) {
      log.fail('本地测试数据清理失败', cleanupError.message);
      process.exitCode = 1;
    }
  });
