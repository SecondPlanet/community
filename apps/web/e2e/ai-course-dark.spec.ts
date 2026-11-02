import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('AI Hub accent surface remains readable in dark mode', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark');
    sessionStorage.setItem('aicourse.accessToken', 'e2e-token');
  });
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ json: {
    id: 'user-1', email: 'learner@example.com', name: 'Learner', role: 'student',
    passwordResetRequired: false, createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z',
  } }));
  await page.route('**/api/v1/auth/providers', (route) => route.fulfill({ json: { providers: [] } }));
  await page.route('**/api/v1/auth/identities', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/ai-personal-courses/capabilities', (route) => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/v1/learning-projects/me**', (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.route('**/api/v1/top-nav**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/footer-columns**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/site-settings**', (route) => route.fulfill({ json: {} }));

  await page.goto('/ai-courses');
  const heading = page.getByRole('heading', { name: /把每一个好问题/ });
  await expect(heading).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);

  const results = await new AxeBuilder({ page }).include('main section:first-of-type').withRules(['color-contrast']).analyze();
  expect(results.violations).toEqual([]);
});
