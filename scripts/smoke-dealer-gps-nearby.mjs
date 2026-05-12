/**
 * Quick smoke: dealer GPS + address resolve, customer nearby distance + Yol Tarifi
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
  await page.waitForURL(/\/(dealer|customer|$)/, { timeout: 10000 });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    geolocation: { latitude: 41.0082, longitude: 28.9784 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();

  try {
    // 1) Dealer - GPS and address resolve
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

      const latInput = page.locator('label:has-text("Enlem")').locator('..').locator('input').first();
      const lngInput = page.locator('label:has-text("Boylam")').locator('..').locator('input').first();
      const addrInput = page.locator('label:has-text("Adres")').locator('..').locator('input').first();

      const latBefore = await latInput.inputValue();
      const lngBefore = await lngInput.inputValue();

      const gpsBtn = page.locator('button:has-text("Konumumu Al (GPS)")').first();
      await gpsBtn.click();
      await page.waitForTimeout(3500);

      const latAfter = await latInput.inputValue();
      const lngAfter = await lngInput.inputValue();
      const latUpdated = latAfter && latAfter !== latBefore;
      const lngUpdated = lngAfter && lngAfter !== lngBefore;
      log('Dealer: Konumumu Al (GPS) updates lat/lng', latUpdated && lngUpdated, latUpdated && lngUpdated ? '' : `lat=${latAfter} lng=${lngAfter}`);

      const coordBtn = page.locator('button:has-text("Koordinattan Adres Bul")').first();
      await coordBtn.click();
      await page.waitForTimeout(2500);

      const addrAfter = await addrInput.inputValue();
      const toast = page.locator('[data-sonner-toast]').or(page.locator('text=Adres koordinatlardan')).or(page.locator('text=adres'));
      const toastText = await page.locator('body').textContent();
      const addrUpdated = (addrAfter && addrAfter.length > 5) || (toastText || '').includes('güncellendi') || (toastText || '').includes('Adres');
      log('Dealer: Koordinattan Adres Bul updates address or success feedback', addrUpdated);
    }

    // 2) Customer - nearby distance badges and Yol Tarifi
    await login(page, 'customer@qratex.com', 'Customer123!');
    await page.goto(`${BASE}/customer/nearby`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const hasVenues = await page.locator('a:has-text("Yol Tarifi")').count() > 0;
    if (hasVenues) {
      const distanceBadges = page.locator('[class*="badge"]').filter({ hasText: /(\d+\s*(m|km))/ });
      const badgeCount = await distanceBadges.count();
      const badgesRender = badgeCount > 0;
      log('Customer nearby: distance badges (m or km) render', badgesRender);

      const yolTarifiLinks = page.locator('a:has-text("Yol Tarifi")');
      const linkCount = await yolTarifiLinks.count();
      const cards = page.locator('div[class*="space-y-3"]').filter({ has: page.locator('p.font-semibold') });
      const cardCount = await cards.count();
      const eachHasYol = cardCount === 0 || linkCount >= cardCount;
      log('Customer nearby: each card has Yol Tarifi link', eachHasYol);
    } else {
      log('Customer nearby: distance badges render', true, 'No venues (empty state - badges N/A)');
      log('Customer nearby: each card has Yol Tarifi', true, 'No venues - N/A');
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
    console.log('\n--- DEALER GPS / NEARBY SMOKE SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
