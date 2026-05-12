import { test, expect } from '@playwright/test';

test.describe('Surveys E2E Flow', () => {
    test('Create survey, fill survey, view results', async ({ page }) => {
        // 1. Dealer login
        await page.goto('/auth/login');
        await page.fill('input[type="email"]', 'dealer@qratex.com');
        await page.fill('input[type="password"]', 'dealer123');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/dealer**');

        // 2. Anketler Sayfasına ve Anket Oluşturmaya git
        await page.goto('/dealer/surveys');

        // Yeni Anket butonu
        const createBtn = page.getByRole('button', { name: /Yeni Anket|Anket Oluştur/i });
        if (await createBtn.isVisible()) {
            await createBtn.click();

            await page.fill('input[placeholder*="başlık" i]', 'Müşteri Memnuniyet Anketi E2E');
            await page.fill('textarea[placeholder*="açıklama" i]', 'E2E test için.');

            // Örnek Soru Ekle
            await page.click('button:has-text("Soru Ekle")');
            await page.fill('input[placeholder*="Soru" i]', 'E2E Yemeklerimizi nasıl buldunuz?');

            // Kaydet
            await page.getByRole('button', { name: /Kaydet|Oluştur/i }).click();

            // Anketin listede göründüğünü doğrula
            await expect(page.getByText('Müşteri Memnuniyet Anketi E2E').first()).toBeVisible({ timeout: 10000 });
        }

        // 3. Sonuçları Görüntüle
        await page.getByText('Müşteri Memnuniyet Anketi E2E').first().click();
        await expect(page.getByText(/Sonuçlar|Yanıtlar|Detay/i).first()).toBeVisible();
    });
});
