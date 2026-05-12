/**
 * Smoke: Konfigürasyon Araçları card, customer my-card explanation with 3 mini boxes
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
    // 1) Admin discovery - Konfigürasyon Araçları card
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'admin@qratex.com');
    await page.fill('input[id="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|$)/, { timeout: 10000 });

    await page.goto(`${BASE}/admin/discovery`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const configCard = page.locator('text=Konfigürasyon Araçları').first();
    const cardExists = await configCard.isVisible();
    log("Admin discovery: 'Konfigürasyon Araçları' card exists", cardExists);

    const card = page.locator('div').filter({ has: configCard }).filter({ has: page.locator('button') }).first();
    const exportBtn = card.locator('button:has-text("JSON Dışa Aktar")').first();
    const importBtn = card.locator('button:has-text("JSON İçe Aktar")').first();
    const pinApplyBtn = card.locator('button:has-text("Pine Uygula")').first();
    const hasExport = await exportBtn.count() > 0;
    const hasImport = await importBtn.count() > 0;
    const hasPinApply = await pinApplyBtn.count() > 0;
    log('Admin discovery: JSON export/import and pin apply controls', hasExport && hasImport && hasPinApply);

    // 2) Customer my-card - expanded digital card sharing explanation with 3 mini boxes
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'customer@qratex.com');
    await page.fill('input[id="password"]', 'Customer123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(customer|$)/, { timeout: 10000 });

    await page.goto(`${BASE}/customer/my-card`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const explanationTitle = page.locator('text=Dijital Kart Paylaşımı Nedir?').first();
    const hasExplanation = await explanationTitle.isVisible();
    log('Customer my-card: expanded digital card sharing explanation exists', hasExplanation);

    const box1 = page.locator('text=Nasıl Paylaşılır?').first();
    const box2 = page.locator('text=Nerede Kullanılır?').first();
    const box3 = page.locator('text=Güvenlik').first();
    const hasBox1 = await box1.count() > 0;
    const hasBox2 = await box2.count() > 0;
    const hasBox3 = await box3.count() > 0;
    log('Customer my-card: 3 mini boxes (Nasıl Paylaşılır, Nerede Kullanılır, Güvenlik)', hasBox1 && hasBox2 && hasBox3);
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- CONFIG TOOLS / MY-CARD SMOKE SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
