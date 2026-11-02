/**
 * take-screenshots.mjs — 跑 6 张 P0-2/3 截图
 *
 * 依赖:
 *   - playwright + chromium(已装)
 *   - vite dev 已经在 :5500 跑
 *
 * 用法:node scripts/take-screenshots.mjs
 */
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', '.screenshots');
await mkdir(OUT, { recursive: true });

const BASE = process.env.SCREENSHOT_BASE ?? 'http://localhost:5500';

const MOCK_AUTH_USER = {
  state: {
    user: {
      id: 'demo-user-1',
      email: 'k.chen@secondplanet.local',
      name: 'K. Chen',
      role: 'student',
    },
  },
  version: 0,
};

const SHOTS = [
  {
    name: 'login-light-desktop',
    url: '/auth/login',
    viewport: { width: 1280, height: 800 },
    theme: 'light',
    seed: false,
  },
  {
    name: 'login-dark-desktop',
    url: '/auth/login',
    viewport: { width: 1280, height: 800 },
    theme: 'dark',
    seed: false,
  },
  {
    name: 'login-mobile',
    url: '/auth/login',
    viewport: { width: 375, height: 812 },
    theme: 'dark',
    seed: false,
  },
  {
    name: 'register-light-desktop',
    url: '/auth/register',
    viewport: { width: 1280, height: 800 },
    theme: 'light',
    seed: false,
  },
  {
    name: 'bindings-empty',
    url: '/dashboard/settings/bindings',
    viewport: { width: 1280, height: 900 },
    theme: 'light',
    seed: true,
  },
  {
    name: 'bindings-with-google',
    url: '/dashboard/settings/bindings?demo=with-google',
    viewport: { width: 1280, height: 900 },
    theme: 'light',
    seed: true,
  },
];

const browser = await chromium.launch({ headless: true });

let failed = 0;
for (const shot of SHOTS) {
  const ctx = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 2,
  });
  // 在任何 page script 跑之前,根据 theme 给 <html> 加 class + 写 localStorage
  // 这样 AuthShell 的 useState initializer 会读到正确的 theme
  // 用 string content 形式避免 addInitScript 函数序列化问题
  await ctx.addInitScript({
    content: `
      try {
        if ('${shot.theme}' === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', '${shot.theme}');
      } catch (e) { /* noop */ }
    `,
  });

  const page = await ctx.newPage();
  try {
    // 拦截 /api/v1/auth/* 让 AuthProvider 在无后端时拿到可控的 mock 响应
    // (这是 demo-only 行为;真实后端时不会触发 route)
    await page.route('**/api/v1/auth/refresh', (route) => {
      if (shot.seed) {
        // 模拟已登录:返 200 + user + accessToken
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken: 'mock-access-token',
            user: MOCK_AUTH_USER.state.user,
          }),
        });
      }
      // 未登录:返 401
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'No refresh token' }),
      });
    });
    await page.route('**/api/v1/auth/providers', (route) => {
      // 返空,LocalAuthAdapter 会 fallback 到灰度 6 宫格
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers: [] }),
      });
    });

    if (shot.seed) {
      // 先访问根 → 写 localStorage → 再去目标 URL
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((user) => {
        try { localStorage.setItem('auth-user', JSON.stringify(user)); } catch {}
      }, MOCK_AUTH_USER);
    }
    await page.goto(`${BASE}${shot.url}`, { waitUntil: 'domcontentloaded' });
    // 双保险:addInitScript 已经写过,这里再 evaluate 一次以防时序问题
    await page.evaluate((t) => {
      if (t === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }, shot.theme);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    // 诊断:打印当前 class 状态
    const cls = await page.evaluate(() => ({
      html: document.documentElement.className,
      ls: localStorage.getItem('theme'),
      bg: getComputedStyle(document.body).backgroundColor,
      url: window.location.pathname + window.location.search,
    }));
    console.log(
      `  [${shot.name}] url=${cls.url} | html.class=${cls.html} | body.bg=${cls.bg}`,
    );
    const out = resolve(OUT, `${shot.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(
      `✓ ${shot.name}.png  (${shot.viewport.width}x${shot.viewport.height}, ${shot.theme})`,
    );
  } catch (err) {
    failed++;
    console.error(`✗ ${shot.name}: ${err?.message ?? err}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();
if (failed > 0) {
  console.error(`\n${failed} screenshot(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${SHOTS.length} screenshots saved to ${OUT}`);
