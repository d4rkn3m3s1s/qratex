/**
 * Smoke: Bayi Profilinden Doldur button, empty dealerId validation, page usable
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

  try {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'admin@qratex.com');
    await page.fill('input[id="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|$)/, { timeout: 10000 });

    await page.goto(`${BASE}/admin/discovery`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // 1) Bayi Profilinden Doldur under each location row
    const addBtn = page.locator('button:has-text("Konum Ekle")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
    }

    const fillBtn = page.locator('button:has-text("Bayi Profilinden Doldur")').first();
    const hasFillBtn = await fillBtn.count() > 0;
    log("1) 'Bayi Profilinden Doldur' button under each location row", hasFillBtn);

    // 2) Kaydet with empty dealerId shows error toast
    const saveBtn = page.locator('button:has-text("Kaydet")').first();
    await saveBtn.click();
    await page.waitForTimeout(2000);

    const toast = page.locator('[data-sonner-toast]').or(page.locator('text=bayi seçilmelidir')).or(page.locator('text=Konum satırı'));
    const bodyText = await page.locator('body').textContent();
    const hasErrorToast = (await toast.count()) > 0 || (bodyText || '').includes('bayi seçilmelidir') || (bodyText || '').includes('Konum satırı');
    log('2) Kaydet with empty dealerId shows error toast (validation)', hasErrorToast);

    // 3) Page remains usable
    await page.waitForTimeout(500);
    const sectionVisible = await page.locator('text=Yakın Mekan Konumları').first().isVisible();
    const configVisible = await page.locator('text=Konfigürasyon Araçları').first().isVisible();
    log('3) Page remains usable', sectionVisible && configVisible);
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- DISCOVERY VALIDATION SMOKE ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
