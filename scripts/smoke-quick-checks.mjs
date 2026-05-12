/**
 * Quick checks: admin discovery dealer select, customer trends, customer nearby
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const results = [];

function log(step, pass, detail = '') {
  results.push({ step, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${step}${detail ? ': ' + detail : ''}`);
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
    if (msg.type() === 'error') consoleErrors.push(String(msg.text()));
  });

  const ignorePatterns = ['favicon', 'theme', 'CLIENT_FETCH_ERROR', 'ERR_CERT', 'next-auth', 'hydration', 'Failed to fetch', 'Dashboard fetch'];
  const isCritical = (e) => typeof e === 'string' && !ignorePatterns.some((p) => e.includes(p));

  try {
    // 1) Admin discovery - location rows have dealer select
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'admin@qratex.com');
    await page.fill('input[id="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|$)/, { timeout: 10000 });

    consoleErrors = [];
    await page.goto(`${BASE}/admin/discovery`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const locationSection = page.locator('text=Yakın Mekan Konumları').first();
    await locationSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const addBtn = page.locator('button:has-text("Konum Ekle")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
    }

    const dealerSelect = page.locator('select').filter({ has: page.locator('option:has-text("Bayi seç")') }).first();
    const hasDealerSelect = await dealerSelect.count() > 0;
    const plainDealerInput = page.locator('input[placeholder="dealerId"]').first();
    const hasPlainInput = await plainDealerInput.count() > 0;
    log('Admin discovery: location rows have dealer select (not plain input)', hasDealerSelect && !hasPlainInput, hasDealerSelect ? 'select with Bayi seç' : 'no select found');

    // 2) Customer trends - page loads without error
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'customer@qratex.com');
    await page.fill('input[id="password"]', 'Customer123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(customer|$)/, { timeout: 10000 });

    consoleErrors = [];
    await page.goto(`${BASE}/customer/trends`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const trendsLoaded = page.url().includes('trends');
    const trendsCritical = consoleErrors.filter(isCritical);
    log('Customer trends: page loads without error', trendsLoaded && trendsCritical.length === 0, trendsCritical.length ? trendsCritical[0] : '');

    // 3) Customer nearby - page loads; if no cards, ensure no crash
    consoleErrors = [];
    await page.goto(`${BASE}/customer/nearby`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const nearbyLoaded = page.url().includes('nearby');
    const hasCards = (await page.locator('div.flex.items-center.justify-between.rounded-lg.border').count()) > 0;
    const hasEmptyState = await page.locator('text=mekan bulunamadı').or(page.locator('text=Konum izni')).isVisible();
    const nearbyCritical = consoleErrors.filter(isCritical);
    const noCrash = nearbyLoaded && (hasCards || hasEmptyState) && nearbyCritical.length === 0;
    log('Customer nearby: page loads, no crash if no cards', noCrash, hasCards ? 'cards shown' : hasEmptyState ? 'empty state' : '');
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- QUICK CHECKS SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
