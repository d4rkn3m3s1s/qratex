/**
 * Quick smoke: admin users (DEALER details), dealer settings, customer nearby
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
  await page.waitForURL(/\/(admin|dealer|customer|$)/, { timeout: 10000 });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    geolocation: { latitude: 41.0082, longitude: 28.9784 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  const apiCalls = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/customer/discovery')) {
      apiCalls.push({ url: res.url(), status: res.status() });
    }
  });

  try {
    // 1) Admin /admin/users - open DEALER user details
    await login(page, 'admin@qratex.com', 'Admin123!');
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const dealerRow = page.locator('tbody tr').filter({ hasText: /dealer@qratex\.com/i }).first();
    const dealerExists = await dealerRow.isVisible();
    log('Admin users: DEALER user exists', dealerExists, dealerExists ? '' : 'No DEALER users in list');
    if (dealerExists) {
      await dealerRow.click();
      await page.waitForTimeout(600);

      const overviewTab = page.locator('button[role="tab"]:has-text("Genel")').or(page.locator('[data-state="active"]')).first();
      await overviewTab.click().catch(() => {});
      await page.waitForTimeout(400);

      const addressLabel = page.locator('text=Adres').first();
      const latLabel = page.locator('text=Latitude').first();
      const lngLabel = page.locator('text=Longitude').first();
      const saveBtn = page.locator('button:has-text("Bayi Bilgilerini Kaydet")').first();
      log('Admin users: dealer location fields in overview', await addressLabel.isVisible() && await latLabel.isVisible() && await lngLabel.isVisible());
      log('Admin users: save button visible', await saveBtn.isVisible());
    }

    // 2) Dealer /dealer/settings
    let dealerLoginOk = false;
    try {
      await login(page, 'dealer@qratex.com', 'Dealer123!');
      dealerLoginOk = page.url().includes('dealer');
    } catch (_) {
      dealerLoginOk = false;
    }
    if (!dealerLoginOk) {
      log('Dealer: login/skip', false, 'Dealer credentials may not be seeded');
    } else {
      await page.goto(`${BASE}/dealer/settings`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const addrField = page.locator('label:has-text("Adres")').locator('..').locator('input').first();
      const latField = page.locator('label:has-text("Enlem")').or(page.locator('label:has-text("Latitude")')).locator('..').locator('input').first();
      const lngField = page.locator('label:has-text("Boylam")').or(page.locator('label:has-text("Longitude")')).locator('..').locator('input').first();
      log('Dealer settings: address field exists', await addrField.isVisible());
      log('Dealer settings: latitude field exists', await latField.isVisible());
      log('Dealer settings: longitude field exists', await lngField.isVisible());

      const saveProfileBtn = page.locator('button:has-text("Değişiklikleri Kaydet")').first();
      await saveProfileBtn.click();
      await page.waitForTimeout(2000);
      const toast = page.locator('[data-sonner-toast]').or(page.locator('li[data-sonner-toast]')).or(page.locator('text=Profil başarıyla güncellendi'));
      const toastVisible = await toast.first().isVisible().catch(() => false);
      const toastText = await page.locator('body').textContent();
      const successToast = toastVisible || (toastText || '').includes('güncellendi') || (toastText || '').includes('başarı');
      log('Dealer settings: save triggers success toast', successToast);
    }

    // 3) Customer /customer/nearby
    apiCalls.length = 0;
    await login(page, 'customer@qratex.com', 'Customer123!');
    await page.goto(`${BASE}/customer/nearby`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    const nearbyLoads = page.url().includes('nearby');
    log('Customer nearby: page loads', nearbyLoads);
    const discoveryCalled = apiCalls.some((c) => c.status === 200);
    log('Customer nearby: can call data endpoint', nearbyLoads && (discoveryCalled || apiCalls.length > 0));
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- USERS/DEALER/NEARBY SMOKE SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
