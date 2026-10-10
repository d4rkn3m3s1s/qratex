import { test, expect } from '@playwright/test';

/**
 * Anket uçtan uca akışı: oluştur → (boş seçenek engeli) → yayınla → müşteri olarak doldur → sonuçta 1 yanıt.
 * Eski sürüm "Yeni anket" bir <a> olduğu için `getByRole('button')` ile bulamıyor ve oluşturma
 * adımını `if` ile SESSİZCE atlıyordu (sahte geçiş). Koşullu dal kaldırıldı.
 */
test.describe('Surveys E2E Flow', () => {
    test('Create survey (empty options blocked), fill as customer, see response in results', async ({ page, browser }) => {
        const title = `E2E Memnuniyet ${Date.now()}`;

        // 1. Bayi girişi
        await page.goto('/auth/login');
        await page.fill('input[type="email"]', 'dealer@qratex.com');
        await page.fill('input[type="password"]', 'dealer123');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/dealer**');

        // 2. Oluşturma sayfası (link)
        await page.goto('/dealer/surveys');
        await page.getByRole('link', { name: /yeni anket|new survey/i }).first().click();
        await page.waitForURL('**/dealer/surveys/create');

        await page.getByLabel(/anket başlığı|survey title/i).fill(title);
        await page.getByRole('button', { name: /soru ekle|add question/i }).first().click();
        await page.getByLabel(/^soru 1$|^question 1$/i).fill('Yemeklerimizi nasıl buldunuz?');

        // 3. Boş seçeneklerle kaydetme ENGELLENİR (P0-39): sayfada kalınır ve hata görünür.
        await page.getByRole('button', { name: /anketi oluştur|create survey/i }).click();
        await expect(page).toHaveURL(/\/dealer\/surveys\/create/);
        await expect(page.getByText(/en az 2 dolu seçenek/i).first()).toBeVisible();

        // 4. Seçenekleri doldur ve kaydet
        await page.getByPlaceholder(/seçenek 1|option 1/i).fill('Harika');
        await page.getByPlaceholder(/seçenek 2|option 2/i).fill('İdare eder');
        await page.getByRole('button', { name: /anketi oluştur|create survey/i }).click();
        await page.waitForURL('**/dealer/surveys');
        const row = page.getByRole('listitem').filter({ hasText: title });
        await expect(row).toBeVisible({ timeout: 10_000 });

        // 5. Müşteri (oturumsuz) olarak doldur
        const resultsHref = await row.getByRole('link', { name: /sonuçlar|results/i }).getAttribute('href');
        const surveyId = resultsHref?.split('/')[3];
        expect(surveyId).toBeTruthy();
        const anon = await browser.newContext();
        const customer = await anon.newPage();
        await customer.goto(`/surveys/${surveyId}`);
        await customer.getByLabel('Harika').check();
        await customer.getByRole('button', { name: /gönder|submit/i }).click();
        await expect(customer.getByRole('heading', { name: /teşekkürler|thank you/i })).toBeVisible();
        await anon.close();

        // 6. Sonuçlarda 1 yanıt
        await page.goto(resultsHref!);
        await expect(page.getByText(/1 toplam yanıt|1 total responses/i)).toBeVisible();
    });
});
