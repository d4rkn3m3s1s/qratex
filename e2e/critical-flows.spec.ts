import { test, expect } from '@playwright/test';

test.describe('Kritik akışlar', () => {
  test('login sayfası açılır ve demo butonları görünür', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /tekrar hoş geldiniz|hoş geldiniz/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /demo giriş: müşteri/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /demo giriş: bayi/i })).toBeVisible();
  });

  test('demo müşteri girişi sonrası customer dashboard açılır', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /demo giriş: müşteri/i }).click();
    await expect(page).toHaveURL(/\/customer/, { timeout: 15000 });
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('demo bayi girişi sonrası dealer dashboard açılır', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /demo giriş: bayi/i }).click();
    await expect(page).toHaveURL(/\/dealer/, { timeout: 15000 });
    await expect(page.getByText(/bayi panel|işletme performans|geri bildirim/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('e-posta ile giriş: geçersiz bilgi hata gösterir', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('#email').fill('invalid@test.com');
    await page.locator('#password').fill('wrongpass');
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
    await expect(page.getByText(/giriş başarısız|hatalı|email veya şifre/i)).toBeVisible({ timeout: 8000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
