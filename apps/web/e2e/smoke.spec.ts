/**
 * 关键流 e2e smoke 测试
 *
 * 覆盖:
 *   1) 首页加载 + 8 段位渲染
 *   2) 课程列表 + 筛选
 *   3) 登录页可访问
 *   4) ⌘K 搜索弹层可开
 *   5) 暗色主题切换
 *   6) 移动端 bottom tab 出现(< md)
 *
 * 此套件只验证前端壳层交互；真实 API 与依赖连通性由 CI 的 api-integration
 * job 通过 GET /api/v1/health/ready 单独门禁，不能以本套件替代。
 */
import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('匿名首页无运行时错误或失败请求', async ({ page, isMobile }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const errorResponses: string[] = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown error'}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        errorResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    // The wider E2E suite intentionally performs many navigations through one
    // loopback address. Give this isolated page-health probe its own proxy IP
    // bucket so earlier tests cannot turn a clean first visit into a 429.
    await page.setExtraHTTPHeaders({
      'X-Forwarded-For': isMobile ? '203.0.113.12' : '203.0.113.11',
    });
    await page.goto('/');
    // The first desktop worker may pay Vite's cold transform cost while the
    // full suite is compiling several lazy routes in parallel.
    await expect(page.getByRole('heading', { name: /与 AI 一起/ })).toBeVisible({ timeout: 20_000 });
    // Give lazy sections and image requests time to settle before asserting the
    // full anonymous-home runtime surface, not just the initial document.
    await page.waitForLoadState('networkidle');

    expect(pageErrors, 'uncaught page errors').toEqual([]);
    expect(consoleErrors, 'console.error messages').toEqual([]);
    expect(failedRequests, 'failed network requests').toEqual([]);
    expect(errorResponses, 'HTTP responses with status >= 400').toEqual([]);
  });

  test('首页加载 + 8 段位', async ({ page }) => {
    await page.goto('/');
    // 等 nav 出来(任何 main 元素)
    await expect(page.locator('main, header').first()).toBeVisible({ timeout: 10_000 });
    // 验证 hero 标语(8 段位的第 1 段,主标题会有"AI"字)
    const body = await page.textContent('body');
    expect(body).toMatch(/AI|课程|学位|黑客松|Learn/i);
  });

  test('课程列表页 + 筛选区存在', async ({ page, isMobile }) => {
    await page.goto('/courses');
    // 等页面 main 内容(2 个 main: Layout 包 + courses 内容)
    await expect(page.locator('main').last()).toBeVisible({ timeout: 10_000 });

    if (isMobile) {
      // mobile: 筛选按钮可点开
      const filterBtn = page.getByRole('button', { name: /筛选/ }).first();
      await filterBtn.click();
      // 弹层固定在屏幕底,等下一帧
      await page.waitForTimeout(300);
      // 弹层标题 / 关闭按钮可访问(选择器存在即可,visibility 由 CSS 决定)
      const closeBtn = page.getByLabel(/关闭/);
      expect(await closeBtn.count()).toBeGreaterThan(0);
    } else {
      // desktop: 筛选 aside 存在
      const aside = page.locator('aside').first();
      await expect(aside).toBeVisible();
    }
  });

  test('登录页可访问', async ({ page }) => {
    await page.goto('/auth/login');
    // LoginPage h1 是 "欢迎回来"
    await expect(page.getByRole('heading', { name: /欢迎回来|登录/ })).toBeVisible({ timeout: 10_000 });
    // 邮箱 + 密码 input
    await expect(page.getByLabel(/邮箱|email/i).first()).toBeVisible();
    await expect(page.getByLabel(/密码|password/i).first()).toBeVisible();
  });

  test('登录页按后端能力启用 OAuth provider', async ({ page }) => {
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({ status: 401, json: { message: 'No refresh token' } }),
    );
    await page.route('**/api/v1/auth/providers', (route) =>
      route.fulfill({
        json: {
          providers: [
            { id: 'email_password', label: '邮箱', type: 'email_password', enabled: true },
            { id: 'oauth.google', label: 'Google', type: 'oauth', enabled: true },
          ],
        },
      }),
    );

    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: '用 Google 登录' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /GitHub/ })).toHaveCount(0);
  });

  test('无效 OAuth 回调明确显示失败而非空白页', async ({ page }) => {
    await page.goto('/auth/oauth/callback?code=invalid&state=invalid');
    await expect(page.getByRole('heading', { name: '第三方登录失败' })).toBeVisible();
    await expect(page.getByText(/回调参数无效或已过期/)).toBeVisible();
  });

  test('自助密码重置完成申请与一次性链接确认', async ({ page }) => {
    await page.route('**/api/v1/auth/password-reset/capability', (route) =>
      route.fulfill({ json: { enabled: true } }),
    );
    await page.route('**/api/v1/auth/password-reset/request', (route) =>
      route.fulfill({ status: 202, json: { accepted: true } }),
    );
    await page.goto('/auth/forgot');
    await page.getByLabel('邮箱').fill('learner@example.com');
    await page.getByRole('button', { name: '发送重置邮件' }).click();
    await expect(page.getByRole('heading', { name: '请检查你的邮箱' })).toBeVisible();

    await page.route('**/api/v1/auth/password-reset/confirm', (route) =>
      route.fulfill({ status: 200, json: { changed: true } }),
    );
    await page.goto(`/auth/reset?token=${'x'.repeat(43)}`);
    await page.getByLabel(/^新密码/).fill('Strong!Password123');
    await page.getByLabel(/^确认新密码/).fill('Strong!Password123');
    await page.getByRole('button', { name: '确认重置密码' }).click();
    await expect(page.getByRole('heading', { name: '密码已更新' })).toBeVisible();
  });

  test('⌘K 搜索弹层: 顶部搜索按钮可点', async ({ page, isMobile }) => {
    // CI 排障: 记录未完成请求。弹层打不开时多半是模块/代理请求被挂起,
    // 失败信息里直接给出 pending 列表,不用再猜网络状态。
    const pending = new Set<string>();
    page.on('request', (r) => pending.add(`${r.method()} ${r.url()}`));
    page.on('requestfinished', (r) => pending.delete(`${r.method()} ${r.url()}`));
    page.on('requestfailed', (r) => pending.delete(`${r.method()} ${r.url()}`));
    const dumpPending = () =>
      `[pending requests]\n${[...pending].join('\n') || '(none)'}`;

    await page.goto('/');
    // CSS 控制可见性:desktop 是 "打开搜索(⌘K)", mobile 是 "打开搜索"
    // 用 button:has-text 等价,但更稳的写法是按 class visibility 区分
    const searchBtn = isMobile
      ? page.locator('button[aria-label="打开搜索"][title*="搜索"]')
      : page.locator('button[aria-label="打开搜索(⌘K)"]');
    await expect(searchBtn).toBeVisible();
    // CommandPalette 是懒加载 chunk；冷启动 CI 上 vite 依赖优化器可能触发整页
    // reload，把点击写入的 isSearchOpen 状态清掉。弹层没出现就重新点击。
    try {
      await expect(async () => {
        await searchBtn.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 20_000 });
    } catch (err) {
      console.log(`⌘K dialog never opened. ${dumpPending()}`);
      throw err;
    }
    // ESC 关闭
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('暗色主题切换', async ({ page }) => {
    await page.goto('/');
    // 初始是 light
    // 切到暗色
    await page.getByLabel(/切换为暗色|切换为亮色/).click();
    await expect(page.locator('html.dark')).toBeVisible({ timeout: 2_000 });
    // localStorage 持久化
    const stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBe('dark');
    // 切回亮色
    await page.getByLabel(/切换为暗色|切换为亮色/).click();
    const finalClass = await page.evaluate(() => document.documentElement.className);
    expect(finalClass).not.toContain('dark');
  });

  test('移动端 bottom tab 出现(< md)', async ({ page, isMobile }) => {
    test.skip(!isMobile, '只在 mobile viewport 跑');
    await page.goto('/');
    // bottom tab 有 5 个图标:Home / BookOpen / GraduationCap / Sparkles / User
    // 用 Home 文字定位(底部)
    const homeTab = page.getByRole('link', { name: /首页|^Home/ }).last();
    await expect(homeTab).toBeVisible();
  });

  test('未登录访问受保护路由重定向到 login', async ({ page }) => {
    await page.goto('/dashboard');
    // 应该跳到 /auth/login
    await page.waitForURL(/\/auth\/login/, { timeout: 5_000 });
    expect(page.url()).toMatch(/\/auth\/login/);
  });

  test('404 路径渲染 NotFound 页', async ({ page }) => {
    // SPA 单页应用: 任意路径都返回 index.html(200), 客户端 router 渲染 NotFoundPage
    await page.goto('/this-path-does-not-exist-xyz');
    // 页面有 "404" 或 "找不到" 文案
    await expect(page.locator('body')).toContainText(/404|找不到|not.found/i, {
      timeout: 5_000,
    });
  });

  test('footer 关于我们链接可到达', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '关于我们' }).click();
    await page.waitForURL(/\/about$/);
    await expect(page.getByRole('heading', { name: /让 AI 时代的能力/ })).toBeVisible();
  });

  test('讲师详情页使用公开 slug 与统计接口', async ({ page }) => {
    await page.route('**/api/v1/instructors/alice', (route) =>
      route.fulfill({
        json: {
          id: 'inst-1',
          slug: 'alice',
          name: 'Alice',
          title: 'AI 工程师',
          headline: '专注于可落地的 AI 应用',
          expertiseLinks: [],
          _count: { courseLinks: 1 },
          courseLinks: [],
        },
      }),
    );
    await page.route('**/api/v1/instructors/inst-1/stats', (route) =>
      route.fulfill({
        json: {
          instructorId: 'inst-1',
          name: 'Alice',
          courseCount: 1,
          studentCount: 20,
          completionRate: 0.75,
          averageRating: 4.8,
          reviewCount: 10,
        },
      }),
    );

    await page.goto('/instructors/alice');
    await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible();
    await expect(page.getByText('4.8')).toBeVisible();
  });

  test('课程排序把真实 sort 参数发送给后端', async ({ page, isMobile }) => {
    const requestedSorts: string[] = [];
    await page.route('**/api/v1/courses?**', (route) => {
      requestedSorts.push(new URL(route.request().url()).searchParams.get('sort') ?? '');
      return route.fulfill({ json: [] });
    });

    await page.goto('/courses');
    if (isMobile) {
      await page.getByLabel('课程排序').selectOption('rating');
    } else {
      await page.getByRole('button', { name: '评分' }).last().click();
    }
    await expect.poll(() => requestedSorts).toContain('rating');
  });
});
