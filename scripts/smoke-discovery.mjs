/**
 * Quick smoke: admin discovery, customer dashboard, trends, nearby
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
  await page.waitForURL(/\/(admin|customer|$)/, { timeout: 10000 });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    // 1) Admin /admin/discovery
    await login(page, 'admin@qratex.com', 'Admin123!');
    await page.goto(`${BASE}/admin/discovery`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const weeklyLabels = page.locator('text=Haftanın Enleri Etiketleri').first();
    const nearbyLoc = page.locator('text=Yakın Mekan Konumları').first();
    const sponsorAnn = page.locator('text=Sponsor').or(page.locator('text=İndirim Duyuruları')).first();
    const adminLoads = page.url().includes('discovery');
    log('Admin discovery: page loads', adminLoads);
    log('Admin discovery: weekly labels section', await weeklyLabels.isVisible());
    log('Admin discovery: nearby locations section', await nearbyLoc.isVisible());
    log('Admin discovery: sponsor announcements section', await sponsorAnn.isVisible());

    // 2) Customer /customer - Trend Mekanlar, Haftanın Enleri
    await login(page, 'customer@qratex.com', 'Customer123!');
    await page.goto(`${BASE}/customer`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const trendMekanlar = page.locator('text=Trend Mekanlar').first();
    const haftaninEnleri = page.locator('text=Haftanın Enleri').first();
    log('Customer dashboard: Trend Mekanlar block visible', await trendMekanlar.isVisible());
    log('Customer dashboard: Haftanın Enleri block visible', await haftaninEnleri.isVisible());

    // 3) Customer /customer/trends
    await page.goto(`${BASE}/customer/trends`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const trendsTrend = page.locator('text=Trend Mekanlar').first();
    const trendsHafta = page.locator('text=Haftanın Enleri').first();
    const trendsSponsor = page.locator('text=Sponsor Duyuruları').first();
    const yakiniBtn = page.locator('text=Yakınımdakileri Gör').or(page.locator('a:has-text("Yakınımdakiler")')).first();
    log('Customer trends: Trend Mekanlar exists', await trendsTrend.isVisible());
    log('Customer trends: Haftanın Enleri exists', await trendsHafta.isVisible());
    log('Customer trends: Sponsor Duyuruları exists', await trendsSponsor.isVisible());
    log('Customer trends: Yakınımdakiler button exists', await yakiniBtn.isVisible());

    // 4) Customer /customer/nearby
    await page.goto(`${BASE}/customer/nearby`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const filters = page.locator('text=Filtreler').first();
    const locationBtn = page.locator('text=Konumu Güncelle').or(page.locator('button:has-text("Konum")')).first();
    log('Customer nearby: page loads', page.url().includes('nearby'));
    log('Customer nearby: filters visible', await filters.isVisible());
    log('Customer nearby: location button visible', await locationBtn.isVisible());
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- DISCOVERY SMOKE SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
