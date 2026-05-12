import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
    test('Login, dashboard view, and logout', async ({ page }) => {
        await page.goto('/auth/login');

        // Başlık veya Giriş metnini kontrol et
        await expect(page.getByRole('heading', { name: /Giriş|Hoş Geldiniz/i }).first()).toBeVisible();

        // Örnek credential'larla login ol
        await page.fill('input[type="email"]', 'dealer@qratex.com');
        await page.fill('input[type="password"]', 'dealer123');
        await page.click('button[type="submit"]');

        // Panelin yüklenmesini bekle
        await page.waitForURL('**/dealer**');

        // Dashboard'un yüklendiğini teyit et
        await expect(page.getByText(/Geri Bildirim|Dashboard|Aktivite/i).first()).toBeVisible({ timeout: 15000 });

        // Çıkış işlemini yap
        const menuButton = page.locator('button[aria-haspopup="menu"]').first();
        if (await menuButton.isVisible()) {
            await menuButton.click();
        }

        const logoutBtn = page.getByText(/Çıkış Yap|Oturumu Kapat|Logout/i).first();
        if (await logoutBtn.isVisible()) {
            await logoutBtn.click();
        } else {
            // Eğer doğrudan buton varsa
            await page.locator('a[href="/auth/logout"]').click();
        }

        // Login veya Ana sayfaya dönüldüğünü onayla
        await page.waitForURL('**/(?:auth\/login)?');
    });
});
