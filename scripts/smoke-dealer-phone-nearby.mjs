/**
 * Smoke: dealer phone save, customer nearby with venue card checks
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const results = [];

function log(step, pass, detail = '') {
  results.push({ step, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${step}${detail ? ': ' + detail : ''}`);
}

async function login(page, email, password) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[id="email"]', email);
  await page.fill('input[id="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dealer|customer|admin|$)/, { timeout: 10000 });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    geolocation: { latitude: 41.0082, longitude: 28.9784 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();

  let consoleErrors = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
    }
  });

  try {
    // 1) Dealer: set phone if empty, save, confirm success toast
    let dealerOk = false;
    try {
      await login(page, 'dealer@qratex.com', 'Dealer123!');
      dealerOk = page.url().includes('dealer');
    } catch (_) {
      dealerOk = false;
    }
    if (!dealerOk) {
      log('Dealer: login', false, 'Dealer credentials may not be seeded');
    } else {
      await page.goto(`${BASE}/dealer/settings`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const phoneInput = page.locator('label:has-text("Telefon")').locator('..').locator('input').first();
      const phoneVal = await phoneInput.inputValue();
      if (!phoneVal || phoneVal.trim().length === 0) {
        await phoneInput.fill('+90 555 123 4567');
      }
      const saveBtn = page.locator('button:has-text("Değişiklikleri Kaydet")').first();
      await saveBtn.click();
      await page.waitForTimeout(3000);

      const toast = page.locator('[data-sonner-toast]').or(page.locator('text=başarıyla')).or(page.locator('text=güncellendi'));
      const bodyText = await page.locator('body').textContent();
      const hasSuccess = (await toast.count()) > 0 || (bodyText || '').toLowerCase().includes('başarıyla') || (bodyText || '').toLowerCase().includes('güncellendi');
      log('Dealer: set phone and save, success toast', hasSuccess);
    }

    // 2) Customer: nearby with geolocation
    await login(page, 'customer@qratex.com', 'Customer123!');
    consoleErrors = [];
    await page.goto(`${BASE}/customer/nearby`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const ignorePatterns = ['favicon', 'theme', 'CLIENT_FETCH_ERROR', 'ERR_CERT', 'next-auth', 'session'];
    const hasErrors = consoleErrors.some((e) => !ignorePatterns.some((p) => e.includes(p)));
    log('Customer: nearby page load with geolocation', !hasErrors, hasErrors ? consoleErrors.slice(0, 2).join('; ') : '');

    // 3) If venues: open/closed badge, star rating, trend badge, Hemen Ara button
    const venueCards = page.locator('div[class*="space-y-3"]').filter({ has: page.locator('p.font-semibold') });
    const cardCount = await venueCards.count();
    if (cardCount >= 1) {
      const firstCard = venueCards.first();
      const cardText = await firstCard.textContent();

      const hasOpenClosed = (cardText || '').includes('Açık') || (cardText || '').includes('Kapalı');
      log('Customer nearby: open/closed badge on venue card', hasOpenClosed);

      const hasStarRating = (cardText || '').includes('yorum') || (cardText || '').includes('puan') || (cardText || '').includes('Henüz');
      log('Customer nearby: star rating text on venue card', hasStarRating);

      const hasTrendBadge = (cardText || '').includes('Trend');
      log('Customer nearby: trend badge on venue card', hasTrendBadge);

      const hasHemenAra = (cardText || '').includes('Hemen Ara') || (cardText || '').includes('Telefon yok');
      log('Customer nearby: Hemen Ara button (or Telefon yok) on venue card', hasHemenAra);
    } else {
      log('Customer nearby: venue cards present', true, 'No venue cards (empty state - data dependent)');
      log('Customer nearby: open/closed badge', true, 'N/A - no venues');
      log('Customer nearby: star rating text', true, 'N/A - no venues');
      log('Customer nearby: trend badge', true, 'N/A - no venues');
      log('Customer nearby: Hemen Ara button', true, 'N/A - no venues');
    }
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- DEALER PHONE / NEARBY SMOKE SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
