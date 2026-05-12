/**
 * Smoke: Admin discovery - Yakındaki Kartları Test Et section
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  let consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(String(msg.text()));
  });

  try {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'admin@qratex.com');
    await page.fill('input[id="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|$)/, { timeout: 10000 });

    await page.goto(`${BASE}/admin/discovery`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const card = page.locator('div').filter({ has: page.locator('text=Yakındaki Kartları Test Et') }).filter({ has: page.locator('input') }).first();
    const sectionExists = await card.isVisible();
    log("Section 'Yakındaki Kartları Test Et' exists", sectionExists);

    const latInput = card.locator('input[placeholder="enlem"]').first();
    const lngInput = card.locator('input[placeholder="boylam"]').first();
    const radiusInput = card.locator('input[placeholder="yarıçap km"]').first();
    const categoryInput = card.locator('input[placeholder*="kategori"]').first();
    const testBtn = card.locator('button:has-text("Yakındaki Kartları Test Et")').or(card.locator('button:has-text("Test ediliyor")')).first();

    const hasLat = await latInput.count() > 0;
    const hasLng = await lngInput.count() > 0;
    const hasRadius = await radiusInput.count() > 0;
    const hasCategory = await categoryInput.count() > 0;
    const hasButton = await testBtn.count() > 0;
    log('lat/lng/radius/category inputs and button present', hasLat && hasLng && hasRadius && hasCategory && hasButton);

    await testBtn.click();
    await page.waitForTimeout(4000);

    const previewRows = page.locator('div.flex.items-center.justify-between.rounded-lg.border.p-3');
    const emptyText = page.locator('text=Henüz önizleme sonucu yok').or(page.locator('text=mekan bulunamadı'));
    const hasRows = (await previewRows.count()) > 0;
    const hasEmptyText = await emptyText.isVisible();
    const either = hasRows || hasEmptyText;
    log('After click: preview rows or empty informational text', either, hasRows ? `${await previewRows.count()} rows` : 'empty text shown');

    const ignorePatterns = ['favicon', 'theme', 'CLIENT_FETCH_ERROR', 'ERR_CERT', 'next-auth', 'CERT_AUTHORITY', 'Failed to load', 'net::ERR', 'Failed to fetch', 'Dashboard fetch', 'hydration'];
    const criticalErrors = consoleErrors.filter((e) => typeof e === 'string' && !ignorePatterns.some((p) => e.includes(p)));
    const hasErrors = criticalErrors.length > 0;
    log('No errors on page', !hasErrors, hasErrors ? criticalErrors[0] : '');
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- ADMIN DISCOVERY TEST SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
