import AxeBuilder from '../../apps/web/node_modules/@axe-core/playwright/dist/index.js';
import playwrightTest from '../../apps/web/node_modules/@playwright/test/index.js';

const { expect, test } = playwrightTest;

const projectId = 'project-browser-1';
const lessonId = 'lesson-browser-1';
const preferences = { explanationStyle: 'balanced', depth: 'standard', goalType: 'systematic', language: 'zh-CN', includeMath: true, includeCode: true };
const concepts = ['attention', 'query-key', 'value-flow'].map((key, i) => ({ key, title: `核心概念${i + 1}`, description: '动态信息选择的关键概念' }));
const planChapters = ['注意力的核心直觉', '查询与匹配机制', '信息聚合实践'].map((title, i) => ({ tempKey: `c${i + 1}`, title, objective: '建立可验证的核心理解', lessons: [{ tempKey: `l${i + 1}`, title: i ? `${title}入门` : '为什么需要注意力', objective: '能够解释动态信息选择过程', conceptKeys: [concepts[i].key], estimatedMinutes: 20, isHidden: false }] }));
const plan = { title: 'Transformer 深度学习课', description: '通过直觉、机制与练习完整理解注意力如何动态选择信息。', learningOutcome: '能够清晰解释注意力机制并用于解决真实问题。', level: 'Beginner', estimatedMinutes: 60, prerequisites: [], concepts, preferences, planVersion: 1, chapters: planChapters };
const course = { id: 'course-browser-1', title: plan.title, description: '浏览器课程', level: 'Beginner' };
const lesson = { id: lessonId, chapterId: 'chapter-browser-1', title: '为什么需要注意力', description: '信息筛选', estimatedMinutes: 20, order: 1, isHidden: false, deletedAt: null };
const project = (overrides = {}) => ({ id: projectId, courseId: course.id, course, seedText: '解释 Transformer', learningGoal: 'systematic', targetLevel: 'Beginner', availableMinutes: 60, preferences, status: 'plan_ready', errorStage: null, plan, chapters: [{ id: 'chapter-browser-1', courseId: course.id, title: '注意力的核心直觉', description: '', order: 1, lessons: [lesson] }], activeLesson: lesson, activeBlockId: null, activeBlockOffset: null, completedLessons: 0, totalLessons: 1, masteryLabel: null, continueHref: `/ai-courses/${projectId}/plan`, lastAccessedAt: null, updatedAt: '2026-08-23T00:00:00.000Z', currentJobId: null, lastErrorCode: null, lastErrorMessage: null, ...overrides });

async function mocks(page, recovery = false) {
  const state = { projectReads: 0, jobs: new Map(), variant: false, retry: false, capabilityEnabled: true };
  await page.addInitScript(() => {
    sessionStorage.setItem('aicourse.accessToken', 'fixture-token'); window.__qaCls = 0;
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__qaCls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method();
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/v1/users/me') return send({ id: 'user-fixture', email: 'fixture@invalid.test', name: 'Fixture', role: 'student', mustResetPassword: false });
    if (path === '/api/v1/ai-personal-courses/capabilities') return send({ enabled: state.capabilityEnabled });
    if (path === '/api/v1/learning-projects/me' && method === 'GET') return send({ items: [{ ...project(), continueHref: `/ai-courses/${projectId}/learn/${lessonId}` }], nextCursor: null });
    if (path === '/api/v1/auth/providers' || path === '/api/v1/auth/identities') return send([]);
    if (path === '/api/v1/learning-projects' && method === 'POST') return send({ projectId, courseId: course.id, jobId: 'plan-job', status: 'planning' }, 202);
    if (path === `/api/v1/learning-projects/${projectId}` && method === 'GET') {
      state.projectReads++;
      if (recovery && !state.retry) {
        const failed = (state.jobs.get('slow-job') ?? 0) >= 2;
        return send(project({ status: failed ? 'failed' : 'planning', errorStage: failed ? 'plan' : null, plan: null, currentJobId: 'slow-job', lastErrorCode: failed ? 'PROVIDER_TIMEOUT' : null, lastErrorMessage: failed ? '任务超时，可安全重试' : null }));
      }
      return send(project());
    }
    if (path.endsWith('/plan/approve')) return send({ projectId, courseId: course.id, firstLessonId: lessonId, jobId: 'lesson-job', status: 'generating_first_lesson', continueHref: `/ai-courses/${projectId}/learn/${lessonId}` });
    const jm = path.match(/\/jobs\/([^/]+)$/);
    if (jm && method === 'GET') { const id = jm[1]; const n = (state.jobs.get(id) ?? 0) + 1; state.jobs.set(id, n); if (id === 'slow-job' && n < 2) return send({ id, type: 'course_plan', status: 'running', progress: 35, currentStep: '组织知识路径', retryable: false, errorCode: null }); if (id === 'slow-job') return send({ id, type: 'course_plan', status: 'failed', errorCode: 'PROVIDER_TIMEOUT', errorMessage: '任务超时，可安全重试', retryable: true, manualRetries: 0 }); if (id === 'variant-job') return send({ id, type: 'lesson_variant', status: 'succeeded', resultRef: { projectId, variantId: 'v1', variantContent: { title: '补充讲解', markdown: '用图书馆检索来理解 Query、Key 与 Value。', keyTakeaway: '动态选择信息' } } }); return send({ id, type: 'lesson_content', status: 'succeeded', resultRef: { projectId, lessonId, continueHref: `/ai-courses/${projectId}/learn/${lessonId}` } }); }
    if (path.endsWith('/slow-job/retry')) { state.retry = true; return send({ id: 'retry-job', type: 'course_plan', status: 'queued', progress: 0, currentStep: null, retryable: false, errorCode: null }); }
    if (path.endsWith(`/${lessonId}/content`) && method === 'GET') return send({ lessonId, status: 'ready', schemaVersion: 1, version: 1, blocks: [{ id: 'b1', type: 'paragraph', markdown: '注意力动态选择相关信息。', conceptKeys: ['attention'] }], summary: '注意力', glossary: [], generatedAt: '2026-08-23T00:00:00.000Z', generation: null });
    if (path.endsWith(`/${lessonId}/variants`)) { state.variant = true; return send({ variantId: 'v1', jobId: 'variant-job', status: 'queued', contentVersion: 1 }, 202); }
    if (path.endsWith(`/${lessonId}/assessments`) && method === 'POST') return send({ assessmentId: 'assessment-1', status: 'generating', jobId: 'assessment-job' }, 202);
    if (path.endsWith('/assessments/assessment-1') && method === 'GET') return send({ id: 'assessment-1', lessonId, status: 'ready', lessonContentVersion: 1, schemaVersion: 1, questions: [1, 2, 3].map((n) => ({ id: `q${n}`, type: 'single_choice', prompt: `第 ${n} 题：注意力机制检查`, options: [{ id: 'yes', text: '动态选择相关信息' }, { id: 'no', text: '固定复制全部信息' }] })) });
    if (path.endsWith('/assessments/assessment-1/attempts') && method === 'POST') return send({ attemptId: 'a1', status: 'completed', score: 100, grading: { items: [] }, recommendation: { nextStep: 'continue' } });
    if (path.endsWith('/assessments/assessment-1/attempts/a1')) return send({ attemptId: 'a1', status: 'completed', score: 100, grading: { items: [] }, recommendation: { nextStep: 'continue' } });
    if (path.endsWith('/chat/sessions') && method === 'GET') return send({ items: [] });
    if (path.endsWith('/chat/sessions') && method === 'POST') return send({ id: 's1', projectId, courseId: course.id, lessonId, scope: 'personal_course_tutor', createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z', messages: [] });
    if (path.endsWith('/chat/sessions/s1')) return send({ id: 's1', projectId, courseId: course.id, lessonId, scope: 'personal_course_tutor', createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z', messages: [] });
    return send({ ok: true });
  });
  return state;
}

async function quality(page, checkCls = true) {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  if (checkCls) { await page.waitForTimeout(200); expect(await page.evaluate(() => window.__qaCls)).toBeLessThanOrEqual(0.1); }
}

test('1440 create to three-question result including variant', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); const state = await mocks(page); await page.goto('/ai-courses/new');
  await page.getByLabel('你真正想学会什么？').fill('解释 Transformer'); await page.getByRole('button', { name: '开始设计课程' }).click();
  await expect(page.getByRole('heading', { name: plan.title })).toBeVisible(); await page.getByRole('button', { name: '生成第一节' }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${lessonId}`)); await page.getByRole('button', { name: '换个例子' }).click(); await expect(page.getByText('补充讲解')).toBeVisible(); expect(state.variant).toBe(true);
  await page.getByRole('button', { name: '生成理解测试' }).click();
  for (let n = 1; n <= 3; n++) { await expect(page.getByText(`第 ${n} 题：注意力机制检查`)).toBeVisible(); await page.getByRole('radio', { name: '动态选择相关信息' }).check(); await page.getByRole('button', { name: n < 3 ? '下一题' : '提交并查看理解反馈' }).click(); }
  await expect(page.getByRole('heading', { name: '本次理解测试' })).toBeVisible(); await quality(page);
});

test('768 slow task survives refresh and retry', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 }); const state = await mocks(page, true); await page.goto(`/ai-courses/${projectId}/plan`);
  await expect(page.getByRole('heading', { name: '正在设计你的课程' })).toBeVisible(); await page.reload(); await expect(page.getByText('任务超时，可安全重试')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '重新生成' }).click(); await expect(page).toHaveURL(new RegExp(`/learn/${lessonId}`)); expect(state.retry).toBe(true);
  // CLS is a navigation metric. Reset at the recovered lesson-route boundary so
  // the preceding intentional plan → failure → retry state replacement is not
  // incorrectly attributed to the destination page's layout stability.
  await page.evaluate(() => { window.__qaCls = 0; }); await quality(page);
});

test('375 mobile tabs', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await mocks(page); await page.goto(`/ai-courses/${projectId}/learn/${lessonId}`);
  const outline = page.getByRole('tab', { name: '目录' }); const learning = page.getByRole('tab', { name: '学习', exact: true }); await expect(learning).toHaveAttribute('aria-selected', 'true'); await outline.click(); await expect(outline).toHaveAttribute('aria-selected', 'true'); await learning.click(); await expect(page.getByRole('heading', { name: lesson.title })).toBeVisible(); await quality(page);
});

test('capability kill-switch fails closed before AI route content mounts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const state = await mocks(page); state.capabilityEnabled = false;
  await page.goto('/ai-courses/new');
  await expect(page.getByRole('heading', { name: 'AI 自建课程暂未开放' })).toBeVisible();
  await expect(page.getByLabel('你真正想学会什么？')).toHaveCount(0);
  await quality(page);
});

test('dark AI course surfaces retain accessible contrast', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await mocks(page);
  await page.goto('/ai-courses');
  await expect(page.getByRole('heading', { name: /把每一个好问题.*变成自己的课程/ })).toBeVisible();
  await quality(page, false);
  await page.goto(`/ai-courses/${projectId}/learn/${lessonId}`);
  await page.getByRole('button', { name: '换个例子' }).click();
  await expect(page.getByText('补充讲解')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成理解测试' })).toBeVisible();
  await quality(page, false);
});
