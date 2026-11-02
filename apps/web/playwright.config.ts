/**
 * Playwright E2E 配置
 *
 * 跑 e2e:
 *   pnpm e2e         (headless)
 *   pnpm e2e:ui      (interactive UI 模式)
 *   pnpm e2e:debug   (debug 单测)
 *
 * 前置:
 *   - 自动启动 web dev server(默认 :5500)
 *   - 这是浏览器 UI smoke；涉及真实 API 的流程应由 API 集成测试覆盖
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://127.0.0.1:5500',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    port: 5500,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // CI 排障: proxy/transform 错误必须进日志,否则挂起的请求无从诊断。
    stdout: 'pipe',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    // 后续要加:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
