/**
 * Smoke: Leaderboard Liderlik Kategorileri collapsible panel, category cards, data reload
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
    await page.fill('input[id="email"]', 'customer@qratex.com');
    await page.fill('input[id="password"]', 'Customer123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(customer|$)/, { timeout: 10000 });

    await page.goto(`${BASE}/customer/leaderboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 1) Collapsible Liderlik Kategorileri panel exists
    const panelHeader = page.locator('text=Liderlik Kategorileri').first();
    const panelExists = await panelHeader.isVisible();
    log("1) Collapsible 'Liderlik Kategorileri' panel exists", panelExists);

    // 2) Panel can collapse/expand
    const toggleBtn = page.locator('button:has-text("Liderlik Kategorileri")').first();
    const categoryGrid = page.locator('button:has-text("Puan")').first();
    const initiallyExpanded = await categoryGrid.isVisible();
    await toggleBtn.click();
    await page.waitForTimeout(400);
    const afterCollapse = await categoryGrid.isVisible();
    await toggleBtn.click();
    await page.waitForTimeout(400);
    const afterExpand = await categoryGrid.isVisible();
    const canCollapseExpand = initiallyExpanded && !afterCollapse && afterExpand;
    log('2) Panel can collapse/expand', canCollapseExpand);

    // 3) Category cards switch active state and data reload
    const puanCard = page.locator('button:has-text("Puan")').first();
    const geriCard = page.locator('button:has-text("Geri Bildirim")').first();
    await puanCard.click();
    await page.waitForTimeout(1500);
    const puanActive = await puanCard.evaluate((el) => el.className.includes('border-primary') || el.className.includes('bg-primary'));
    await geriCard.click();
    await page.waitForTimeout(1500);
    const geriActive = await geriCard.evaluate((el) => el.className.includes('border-primary') || el.className.includes('bg-primary'));
    const hasContent = await page.locator('text=Haftalık').or(page.locator('text=Tüm Zamanlar')).first().isVisible();
    log('3) Category cards switch active state and data reload functional', puanActive && geriActive && hasContent);
  } catch (e) {
    log('Smoke test', false, e.message);
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((res) => {
    console.log('\n--- LEADERBOARD COLLAPSE SMOKE ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
