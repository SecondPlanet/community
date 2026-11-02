import { expect, type Page, test } from '@playwright/test';

const studentEmail = process.env.E2E_STUDENT_EMAIL ?? 'student@test.com';
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? '123456';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@secondplanet.local';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

const publicPages = [
  '/',
  '/courses',
  '/degrees',
  '/hackathons',
  '/about',
  '/instructors',
  '/search?q=AI',
  '/auth/login',
  '/auth/register',
  '/auth/forgot',
  '/terms',
  '/privacy',
  '/cookies',
  '/refund',
] as const;

const studentPages = [
  '/profile',
  '/dashboard',
  '/dashboard/learning',
  '/dashboard/notifications',
  '/dashboard/orders',
  '/dashboard/certificates',
  '/dashboard/settings/bindings',
  '/dashboard/settings/ai',
] as const;

const profileServiceLinks = studentPages.filter((path) => path !== '/profile' && path !== '/dashboard/learning');

const adminPages = [
  '/admin/dashboard',
  '/admin/courses',
  '/admin/instructors',
  '/admin/degrees',
  '/admin/users',
  '/admin/badges',
  '/admin/hackathons',
  '/admin/reviews',
  '/admin/settings',
] as const;

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel(/^密码/).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  await expect(page.getByRole('link', { name: /个人中心/ })).toBeVisible({ timeout: 10_000 });
}

async function assertCurrentPageHealthy(page: Page, path: string) {
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.locator('body')).not.toContainText(/Application error|Unexpected Application Error/i);
  // 等懒加载和 AuthGuard 完成，避免把 loading skeleton 误判为页面可用。
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    { message: `${path} must not overflow horizontally` },
  ).toBe(true);
}

async function assertPageHealthy(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), `${path} document status`).toBeLessThan(400);
  await assertCurrentPageHealthy(page, path);
}

test.describe('全前端页面健康检查', () => {
  test.describe.configure({ timeout: 90_000 });

  test('所有公开静态页均可渲染且无横向溢出', async ({ page }) => {
    for (const path of publicPages) {
      await test.step(path, () => assertPageHealthy(page, path));
    }
  });

  test('公开动态详情页由真实列表入口可达', async ({ page }) => {
    const entries = [
      { list: '/courses', pattern: /^\/courses\/[^/]+$/ },
      { list: '/degrees', pattern: /^\/degrees\/[^/]+$/ },
      { list: '/hackathons', pattern: /^\/hackathons\/[^/]+$/ },
      { list: '/instructors', pattern: /^\/instructors\/[^/]+$/ },
    ];

    for (const { list, pattern } of entries) {
      await page.goto(list);
      const detailPath = await expect.poll(async () => {
        const hrefs = await page.locator('a[href]').evaluateAll((links) =>
          links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
        );
        return hrefs.find((href) => pattern.test(href));
      }, { message: `${list} should expose a real detail-page link`, timeout: 10_000 }).toBeTruthy().then(async () => {
        const hrefs = await page.locator('a[href]').evaluateAll((links) =>
          links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
        );
        return hrefs.find((href) => pattern.test(href));
      });
      expect(detailPath, `${list} should expose a real detail-page link`).toBeTruthy();
      await assertPageHealthy(page, detailPath!);
    }
  });

  test('学员个人中心与所有关联子页可达', async ({ page, isMobile }) => {
    await login(page, studentEmail, studentPassword);

    if (isMobile) {
      await page.goto('/');
      await page.getByRole('link', { name: '我的', exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
    }

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: '我的空间' })).toBeVisible({ timeout: 10_000 });
    const profileLinks = await page.locator('a[href]').evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href')),
    );
    for (const path of profileServiceLinks) {
      expect(profileLinks, `profile should link to ${path}`).toContain(path);
    }

    for (const path of studentPages) {
      await test.step(path, async () => {
        await assertPageHealthy(page, path);
        const suffix = path === '/dashboard/learning' ? '(?:/|[?#]|$)' : '(?:[?#]|$)';
        await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${suffix}`));
      });
    }

    for (const collection of ['/dashboard/orders', '/dashboard/certificates'] as const) {
      await page.goto(collection);
      const detailLink = page.locator(`a[href^="${collection}/"]`).first();
      if (await detailLink.count()) {
        const href = await detailLink.getAttribute('href');
        await assertPageHealthy(page, href!);
      }
    }
  });

  test('学员不能越权进入管理后台', async ({ page }) => {
    await login(page, studentEmail, studentPassword);
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/$/);
  });

  test('管理员全部页面可达', async ({ page, isMobile }) => {
    test.skip(isMobile, '管理端在移动设备上统一显示桌面访问提示');
    await login(page, adminEmail, adminPassword);
    await page.goto(adminPages[0]);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await assertCurrentPageHealthy(page, adminPages[0]);

    for (const path of adminPages.slice(1)) {
      await test.step(path, async () => {
        await page.locator(`a[href="${path}"]`).first().click();
        await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[?#]|$)`));
        await assertCurrentPageHealthy(page, path);
      });
    }
  });

  test('移动端管理页显示桌面访问提示', async ({ page, isMobile }) => {
    test.skip(!isMobile, '仅移动端验证统一拦截页');
    await login(page, adminEmail, adminPassword);
    await page.goto('/admin/dashboard');
    await expect(page.getByText(/桌面|电脑/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('未登录访问所有受保护页都保留来源并跳转登录', async ({ page, isMobile }) => {
    // This scenario hard-navigates through every protected route, and each
    // navigation boots auth. Keep it out of the shared loopback rate-limit
    // bucket so concurrently running login/page-health tests cannot delay the
    // guard beyond the assertion timeout.
    await page.setExtraHTTPHeaders({
      'X-Forwarded-For': isMobile ? '203.0.113.22' : '203.0.113.21',
    });
    for (const path of [...studentPages, '/admin/dashboard']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login\?from=/, { timeout: 10_000 });
      expect(new URL(page.url()).searchParams.get('from')).toBe(path);
    }
  });
});
