import playwrightTest from '../../apps/web/node_modules/@playwright/test/index.js';
import { resolve } from 'node:path';

const { defineConfig } = playwrightTest;
const root = resolve(import.meta.dirname, '../..');
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: 'ai-course.browser.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:5500', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  reporter: [
    ['list'],
    ['junit', { outputFile: resolve(root, 'coverage/ai-course/junit-ai-e2e.xml') }],
    ['json', { outputFile: resolve(root, 'coverage/ai-course/playwright-ai-e2e.json') }],
  ],
  outputDir: resolve(root, 'coverage/ai-course/playwright-results'),
  webServer: {
    command: 'pnpm --filter @secondplanet/web dev --host 127.0.0.1', cwd: root,
    url: 'http://127.0.0.1:5500', reuseExistingServer: !process.env.CI, timeout: 120_000,
    stdout: 'pipe', stderr: 'pipe',
  },
});
