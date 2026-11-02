import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const STUDENT = { email: process.env.E2E_STUDENT_EMAIL ?? 'student@test.com', password: process.env.E2E_STUDENT_PASSWORD ?? '123456' };
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@secondplanet.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123' };
const TITLE = 'axe 门禁自包含测试赛';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel(/^密码/).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 10_000 });
}

async function axe(page: Page, label: string) {
  // 掐掉入场动画 — 扫描瞬间文字还在 fade-in 会算出过低的对比度(误报)
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important;}' });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  if (serious.length) {
    console.log(`\n[axe:${label}]`);
    for (const v of serious) {
      console.log(`  ${v.impact} ${v.id}: ${v.description}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`    -> ${n.html.slice(0, 140)}`);
    }
  }
  expect(serious, `${label} should have 0 serious/critical axe violations`).toHaveLength(0);
}

// 登录态是 Bearer access token (sessionStorage), context.request 不自动携带 — 手动带 header
async function authedRequest(context: import('@playwright/test').BrowserContext, page: Page, method: string, url: string, data?: unknown) {
  const token = await page.evaluate(() => sessionStorage.getItem('aicourse.accessToken'));
  return context.request.fetch(url, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
}

const inDays = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
let hackathonId = '';

// CI 是全新种子库, 不能依赖本地开发库里的固定活动 id — 每个 worker 自给自足:
// 管理员建一个进行中的站内报名活动, 学员报名(使 ParticipantHub 渲染「我的报名」面板)。
test.beforeAll(async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, ADMIN.email, ADMIN.password);
  const createRes = await authedRequest(adminContext, adminPage, 'POST', '/api/v1/hackathons', {
    title: TITLE,
    description: 'axe e2e gate fixture — 审核前参赛面板门禁',
    status: 'active',
    startDate: inDays(1),
    endDate: inDays(8),
    // 报名截止必须早于活动开始(服务端校验), 取未来 6 小时保证当前可报名
    registerDeadline: new Date(Date.now() + 6 * 3_600_000).toISOString(),
    submissionDeadline: inDays(7),
  });
  expect(createRes.ok(), `create hackathon failed: ${await createRes.text()}`).toBeTruthy();
  const created = await createRes.json();
  hackathonId = created.id;
  await adminContext.close();

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await login(studentPage, STUDENT.email, STUDENT.password);
  const registerRes = await authedRequest(studentContext, studentPage, 'POST', `/api/v1/hackathons/${hackathonId}/register`, { answers: {} });
  expect(registerRes.ok(), `register failed: ${await registerRes.text()}`).toBeTruthy();
  await studentContext.close();
});

test.describe('hackathon pages axe gate', () => {
  test('participant pages light + dark', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await page.goto(`/hackathons/${hackathonId}`);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 15_000 });
    await axe(page, 'detail-light');
    await page.getByRole('tab', { name: '我的参赛' }).click();
    await expect(page.getByRole('heading', { name: '我的报名' })).toBeVisible();
    await axe(page, 'participant-hub-light');
    // 直接挂 dark class, 保证暗色门禁真的在暗色下跑
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(400);
    await axe(page, 'participant-hub-dark');
  });

  test('admin hackathon workspaces', async ({ page, isMobile }) => {
    // AdminLayout 在 <md 视口拦截并提示桌面访问(产品行为), 移动端没有 admin 工作台可门禁
    test.skip(isMobile, 'admin layout requires desktop viewport');
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/admin/hackathons');
    await expect(page.getByRole('button', { name: '管理' }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '管理' }).first().click();
    await expect(page.getByRole('tab', { name: '报名审核' })).toBeVisible({ timeout: 10_000 });
    await axe(page, 'admin-basic');
    await page.getByRole('tab', { name: '报名审核' }).click();
    await page.waitForTimeout(800);
    await axe(page, 'admin-registrations');
    await page.getByRole('tab', { name: '报名表' }).click();
    await page.waitForTimeout(800);
    await axe(page, 'admin-form-builder');
  });
});
