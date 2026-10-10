import { test, expect } from '@playwright/test';

/**
 * Anket uçtan uca akışı (Anket Stüdyosu): boş anketle başla → boş seçenek engeli → yayınla →
 * paylaşım adımı (sonuç merkezi) → müşteri olarak doldur → sonuçta 1 yanıt + listede görünür.
 * Eski sürüm "Yeni anket" bir <a> olduğu için `getByRole('button')` ile bulamıyor ve oluşturma
 * adımını `if` ile SESSİZCE atlıyordu (sahte geçiş). Koşullu dal yok.
 */
test.describe('Surveys E2E Flow', () => {
  test('Create survey (empty options blocked), share, fill as customer, see response in results', async ({ page, browser }) => {
    const title = `E2E Memnuniyet ${Date.now()}`;

    // 1. Bayi girişi
    await page.goto('/auth/login');
    await page.fill('input[type="email"]', 'dealer@qratex.com');
    await page.fill('input[type="password"]', 'dealer123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dealer**');

    // 2. Liste → oluşturucu (bağlantı) → boş anketle başla
    await page.goto('/dealer/surveys');
    await page.getByRole('link', { name: /yeni anket|new survey/i }).first().click();
    await page.waitForURL('**/dealer/surveys/create**');
    await page.getByRole('button', { name: /boş anket|blank survey/i }).click();

    await page.getByLabel(/anket başlığı|survey title/i).fill(title);
    await page.getByRole('textbox', { name: /^soru 1$|^question 1$/i }).fill('Yemeklerimizi nasıl buldunuz?');

    // 3. Boş seçeneklerle kaydetme ENGELLENİR (P0-39): sayfada kalınır ve hata soru kartında görünür.
    await page.getByRole('button', { name: /kaydet ve yayınla|save and publish/i }).click();
    await expect(page).toHaveURL(/\/dealer\/surveys\/create/);
    await expect(page.getByText(/en az 2 dolu seçenek/i).first()).toBeVisible();

    // 4. Seçenekleri doldur ve yayınla → sonuç merkezinde paylaşım paneli açılır
    await page.getByPlaceholder(/seçenek 1|option 1/i).fill('Harika');
    await page.getByPlaceholder(/seçenek 2|option 2/i).fill('İdare eder');
    await page.getByRole('button', { name: /kaydet ve yayınla|save and publish/i }).click();
    await page.waitForURL(/\/dealer\/surveys\/[^/]+\/results/);
    await expect(page.getByRole('dialog', { name: /anketi paylaş|share survey/i })).toBeVisible();
    const surveyId = new URL(page.url()).pathname.split('/')[3];
    expect(surveyId).toBeTruthy();
    await page.keyboard.press('Escape');

    // 5. Müşteri (oturumsuz) olarak doldur
    const anon = await browser.newContext();
    const customer = await anon.newPage();
    await customer.goto(`/surveys/${surveyId}`);
    await customer.getByLabel('Harika').check();
    await customer.getByRole('button', { name: /gönder|submit/i }).click();
    await expect(customer.getByRole('heading', { name: /teşekkürler|thank you/i })).toBeVisible();
    await anon.close();

    // 6. Sonuçlarda 1 yanıt; listede başlıkla görünür
    await page.reload();
    await expect(page.getByText(/1 kişi yanıtladı|1 answered/i).first()).toBeVisible();
    await page.goto('/dealer/surveys');
    await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 10_000 });
  });
});
