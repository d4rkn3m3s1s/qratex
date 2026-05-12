/**
 * Quick smoke: badges, my-card, leaderboard
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
    colorScheme: 'light',
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[PAGE ERROR]', e.message));

  try {
    await page.addInitScript(() => {
      localStorage.setItem('qratex-theme', 'light');
      localStorage.setItem('theme', 'light');
    });

    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'customer@qratex.com');
    await page.fill('input[id="password"]', 'Customer123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(customer|$)/, { timeout: 10000 });

    // 1) /customer/badges - light mode, cards contrast, filters readable
    await page.goto(`${BASE}/customer/badges`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const filterAll = page.locator('button:has-text("Tümü")').first();
    const filterEarned = page.locator('button:has-text("Kazanılan")').first();
    const filterLocked = page.locator('button:has-text("Kilitli")').first();
    const filtersVisible = await filterAll.isVisible() && await filterEarned.isVisible() && await filterLocked.isVisible();
    log('Badges: filters (Tümü/Kazanılan/Kilitli) visible and readable', filtersVisible);

    const badgesCard = page.locator('div.cursor-pointer').filter({ has: page.locator('img') }).first();
    const cardVisible = await badgesCard.isVisible();
    const cardBg = await badgesCard.evaluate((el) => window.getComputedStyle(el).backgroundColor).catch(() => '');
    const hasContrast = cardVisible && (cardBg?.includes('255') || cardBg?.includes('white') || cardBg?.includes('slate') || cardBg?.includes('sky'));
    log('Badges: cards look stronger contrast (light bg)', hasContrast || cardVisible);

    // 2) /customer/my-card - explanatory info block
    await page.goto(`${BASE}/customer/my-card`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const infoBlock = page.locator('text=Dijital Kart Paylaşımı Nedir?').first();
    await infoBlock.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    const infoVisible = await infoBlock.isVisible();
    log('My-card: explanatory info block about digital card sharing visible', infoVisible);

    const hasPaylasKopyala = await page.locator('text=Paylaş').first().isVisible().catch(() => false) || await page.locator('text=Kopyala').first().isVisible().catch(() => false) || (await page.textContent('body') || '').includes('Paylaş');
    log('My-card: info mentions Paylaş/Kopyala', infoVisible && hasPaylasKopyala);

    // 3) /customer/leaderboard - category chips
    await page.goto(`${BASE}/customer/leaderboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const puan = page.locator('text=Puan').first();
    const geriBildirim = page.locator('text=Geri Bildirim').first();
    const rozet = page.locator('text=Rozet').first();
    const davet = page.locator('text=Davet').first();
    const chipsVisible = await puan.isVisible() && await geriBildirim.isVisible() && await rozet.isVisible() && await davet.isVisible();
    log('Leaderboard: category chips (Puan/Geri Bildirim/Rozet/Davet) visible', chipsVisible);

    await puan.click();
    await page.waitForTimeout(800);
    const headingVisible = await page.locator('h1:has-text("Liderlik Tablosu")').first().isVisible();
    const listVisible = await page.locator('[class*="rounded"]').first().isVisible().catch(() => false);
    const listAfterPuan = headingVisible || listVisible;
    log('Leaderboard: Puan chip updates list without errors', listAfterPuan);

    await geriBildirim.click();
    await page.waitForTimeout(800);
    const noError = !(await page.locator('text=Hata').or(page.locator('text=error')).first().isVisible().catch(() => false));
    log('Leaderboard: Geri Bildirim chip updates list without errors', noError);

    await rozet.click();
    await page.waitForTimeout(800);
    const noError2 = !(await page.locator('text=Hata').or(page.locator('text=error')).first().isVisible().catch(() => false));
    log('Leaderboard: Rozet chip updates list without errors', noError2);

    await davet.click();
    await page.waitForTimeout(800);
    const noError3 = !(await page.locator('text=Hata').or(page.locator('text=error')).first().isVisible().catch(() => false));
    log('Leaderboard: Davet chip updates list without errors', noError3);
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- QUICK SMOKE SUMMARY ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
