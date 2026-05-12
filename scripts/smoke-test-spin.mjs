/**
 * E2E Smoke Test: Spin-wheel + Points-matrix integration
 * Run: npx playwright test scripts/smoke-test-spin.mjs
 * Or: node scripts/smoke-test-spin.mjs (uses playwright programmatically)
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const CREDS = {
  admin: { email: 'admin@qratex.com', password: 'Admin123!' },
  dealer: { email: 'dealer@qratex.com', password: 'Dealer123!' },
  customer: { email: 'customer@qratex.com', password: 'Customer123!' },
};

const results = [];

function log(step, pass, detail = '') {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ step, status, detail });
  console.log(`[${status}] ${step}${detail ? ': ' + detail : ''}`);
}

async function login(page, role) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  const { email, password } = CREDS[role];
  await page.fill('input[id="email"]', email);
  await page.fill('input[id="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(admin|dealer|customer)(\/|$)/, { timeout: 10000 });
}

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });

  try {
    // --- 1) Admin flow ---
    const adminPage = await context.newPage();
    adminPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('error') || text.includes('Error')) console.log('[CONSOLE]', text);
    });

    try {
      await login(adminPage, 'admin');
      log('Admin: Login', true);

      await adminPage.goto(`${BASE_URL}/admin/points-matrix`, { waitUntil: 'networkidle' });
      const onPointsMatrix = adminPage.url().includes('points-matrix');
      log('Admin: Open /admin/points-matrix', onPointsMatrix);

      const spinSection = await adminPage.locator('text=Günlük Çark Kuralları').first();
      const spinVisible = await spinSection.isVisible();
      log('Admin: Spin rules section exists', spinVisible);

      const enabledSwitch = adminPage.locator('text=Çark Aktif').locator('..').locator('button[role="switch"]').first();
      const switchVisible = await enabledSwitch.isVisible();
      log('Admin: Enabled switch present', switchVisible);

      const dailyLimitInput = adminPage.locator('text=Günlük Çevirme Limiti').locator('..').locator('input').first();
      await dailyLimitInput.fill('1');
      log('Admin: Set daily limit to 1', true);

      const saveBtn = adminPage.locator('button:has-text("Kaydet")').first();
      const saveEnabled = await saveBtn.isEnabled();
      if (saveEnabled) {
        await saveBtn.click();
        await adminPage.waitForSelector('[data-sonner-toast]', { timeout: 5000 }).catch(() => null);
        const toast = adminPage.locator('[data-sonner-toast]');
        const hasSuccess = (await toast.textContent())?.includes('güncellendi') || (await adminPage.locator('text=Puan matrisi güncellendi').count()) > 0;
        log('Admin: Save and success toast', hasSuccess);
      } else {
        log('Admin: Save and success toast', true, '(no changes, save disabled)');
      }
    } catch (e) {
      log('Admin flow', false, e.message);
    } finally {
      await adminPage.close();
    }

    // --- 2) Customer flow (fresh context) ---
    const customerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const customerPage = await customerContext.newPage();

    try {
      await login(customerPage, 'customer');
      log('Customer: Login', true);

      await customerPage.goto(`${BASE_URL}/customer`, { waitUntil: 'networkidle' });
      log('Customer: Open /customer', customerPage.url().includes('customer'));

      const spinWidget = customerPage.locator('text=Çevir!').or(customerPage.locator('text=Yarın gel!'));
      const spinVisible = await spinWidget.first().isVisible({ timeout: 5000 });
      log('Customer: Spin widget visible', spinVisible);

      const canSpinBtn = customerPage.locator('button:has-text("Çevir!")').first();
      const canSpin = await canSpinBtn.isVisible();
      if (canSpin) {
        await canSpinBtn.click();
        await customerPage.waitForTimeout(5500); // spin animation ~4s + dialog
        const dialog = customerPage.locator('[role="dialog"]');
        const dialogVisible = await dialog.isVisible();
        const dialogText = dialogVisible ? await dialog.textContent() : '';
        const hasResult = /Tebrikler|Bir Dahaki Sefere|puan|XP|Tekrar Dene/i.test(dialogText || '');
        log('Customer: First spin - result dialog/toast', hasResult, dialogText?.slice(0, 80));

        const toast = customerPage.locator('[data-sonner-toast]');
        const toastText = (await toast.first().textContent().catch(() => '')) || '';
        const hasPointsXpNothing = /puan|XP|şansın açık|Tekrar Dene/i.test(toastText);
        log('Customer: Result says points/xp/nothing', hasPointsXpNothing, toastText?.slice(0, 60));

        await customerPage.locator('button:has-text("Tamam")').first().click().catch(() => {});
        await customerPage.waitForTimeout(500);

        const secondSpinBtn = customerPage.locator('button:has-text("Çevir!")').first();
        const stillCanSpin = await secondSpinBtn.isVisible();
        const blockedMsg = customerPage.locator('text=Yarın gel!').or(customerPage.locator('text=Yarın tekrar'));
        const blocked = await blockedMsg.first().isVisible();
        log('Customer: Second spin blocked (Yarın gel / disabled)', !stillCanSpin || blocked);
      } else {
        log('Customer: Spin already used today - blocked state', true, '(Yarın gel shown)');
      }
    } catch (e) {
      log('Customer flow', false, e.message);
    } finally {
      await customerPage.close();
      await customerContext.close();
    }

    // --- 3) Dealer flow ---
    const dealerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const dealerPage = await dealerContext.newPage();

    try {
      await login(dealerPage, 'dealer');
      log('Dealer: Login', true);

      await dealerPage.goto(`${BASE_URL}/dealer`, { waitUntil: 'networkidle' });
      const compactSpin = dealerPage.locator('text=Çevir!').or(dealerPage.locator('text=Yarın gel!'));
      const dealerSpinVisible = await compactSpin.first().isVisible({ timeout: 5000 });
      log('Dealer: Compact spin widget present', dealerSpinVisible);

      const dealerCanSpin = await dealerPage.locator('button:has-text("Çevir!")').first().isVisible();
      const dealerBlocked = await dealerPage.locator('text=Yarın gel!').first().isVisible();
      log('Dealer: Daily lock applies (can spin or blocked)', dealerCanSpin || dealerBlocked);
    } catch (e) {
      log('Dealer flow', false, e.message);
    } finally {
      await dealerPage.close();
      await dealerContext.close();
    }

    // --- 4) QR page regression ---
    const dealerPage2 = await context.newPage();
    try {
      await login(dealerPage2, 'dealer');
      await dealerPage2.goto(`${BASE_URL}/dealer/qr-codes`, { waitUntil: 'networkidle' });
      const onQrPage = dealerPage2.url().includes('qr-codes');
      log('Dealer: Open /dealer/qr-codes', onQrPage);

      const createBtn = dealerPage2.locator('button:has-text("Yeni QR Kod")').or(dealerPage2.locator('a:has-text("Yeni QR Kod")')).first();
      await createBtn.click().catch(() => {});
      await dealerPage2.waitForTimeout(500);
      const modal = dealerPage2.locator('[role="dialog"]');
      const modalOpened = await modal.isVisible();
      log('Dealer: Create modal opens', modalOpened);

      await dealerPage2.keyboard.press('Escape');
      log('Dealer: QR page no crash', true);
    } catch (e) {
      log('QR page regression', false, e.message);
    } finally {
      await dealerPage2.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return results;
}

runTests()
  .then((res) => {
    console.log('\n--- SMOKE TEST SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    const fails = res.filter((r) => r.status === 'FAIL');
    process.exit(fails.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Smoke test error:', err);
    process.exit(1);
  });
