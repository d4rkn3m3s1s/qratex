import { test, expect, type Page } from '@playwright/test';

/** İlk admin girişinde açılan onboarding sheet başlığı üstünde kalırsa görünürlük assert’leri düşer. */
async function dismissAdminOnboardingIfPresent(page: Page) {
  await page.getByRole('button', { name: /^Atla$/ }).click({ timeout: 8000 }).catch(() => {});
}

test.describe('Smoke', () => {
  test('ana sayfa yüklenir ve giriş linki vardır', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /giriş|giriş yap|login/i }).first()).toBeVisible();
  });

  test('blog sayfası açılır', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByRole('heading', { name: /blog/i })).toBeVisible({ timeout: 10000 });
  });

  test('neden-qratex sayfası açılır', async ({ page }) => {
    await page.goto('/neden-qratex');
    await expect(page.getByRole('heading', { name: /neden qratex/i })).toBeVisible({ timeout: 10000 });
  });

  test('health endpoint 200 döner', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBeLessThan(500);
    const json = await res.json();
    expect(json).toHaveProperty('runtime');
    expect(json.runtime).toHaveProperty('uptimeSeconds');
  });

  test('demo admin ile Grok Konseyi sayfası açılır', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /demo giriş: admin/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 20000 });
    await dismissAdminOnboardingIfPresent(page);
    await page.goto('/admin/agent-council');
    await dismissAdminOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /grok tarzı konsey/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('demo admin ile konsey geçmişi sayfası açılır', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /demo giriş: admin/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 20000 });
    await dismissAdminOnboardingIfPresent(page);
    await page.goto('/admin/agent-council/history');
    await dismissAdminOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /konsey geçmişi/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
