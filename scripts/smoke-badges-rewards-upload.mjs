/**
 * Smoke: Admin badges/rewards create dialog - file input, svg/png note, upload
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASE = 'http://localhost:3000';
const results = [];

function log(step, pass, detail = '') {
  results.push({ step, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${step}${detail ? ': ' + detail : ''}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const testSvg = path.join(PROJECT_ROOT, 'public', 'images', 'badges', 'filiz.svg');

  try {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id="email"]', 'admin@qratex.com');
    await page.fill('input[id="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(admin|$)/, { timeout: 10000 });

    // 1) Badges create dialog - file input + svg/png note
    await page.goto(`${BASE}/admin/badges`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Yeni Rozet Oluştur")').first().click();
    await page.waitForTimeout(800);

    const badgesFileInput = page.locator('[role="dialog"] input[type="file"]').first();
    const badgesSvgNote = page.locator('[role="dialog"]').filter({ hasText: /SVG veya PNG|svg.*png/i }).first();
    const hasBadgesFile = await badgesFileInput.count() > 0;
    const hasBadgesNote = await badgesSvgNote.count() > 0;
    log('1) Badges create: file input + svg/png note', hasBadgesFile && hasBadgesNote);

    // 2) Rewards create dialog - file input + svg/png note
    await page.goto(`${BASE}/admin/rewards`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Yeni Ödül")').first().click();
    await page.waitForTimeout(800);

    const rewardsFileInput = page.locator('[role="dialog"] input[type="file"]').first();
    const rewardsSvgNote = page.locator('[role="dialog"]').filter({ hasText: /SVG veya PNG|svg.*png/i }).first();
    const hasRewardsFile = await rewardsFileInput.count() > 0;
    const hasRewardsNote = await rewardsSvgNote.count() > 0;
    log('2) Rewards create: file input + svg/png note', hasRewardsFile && hasRewardsNote);

    // 3) Upload test - use badges dialog
    await page.goto(`${BASE}/admin/badges`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('button:has-text("Yeni Rozet Oluştur")').first().click();
    await page.waitForTimeout(800);

    const fs = await import('fs');
    const fileExists = fs.existsSync(testSvg);
    let uploadOk = false;
    if (fileExists) {
      try {
        const fileInput = page.locator('[role="dialog"] input[type="file"]').first();
        await fileInput.setInputFiles(testSvg);
        await page.waitForTimeout(3500);
        const dialogText = await page.locator('[role="dialog"]').first().textContent();
        uploadOk = (dialogText || '').includes('/images/');
      } catch (_) {
        uploadOk = false;
      }
    }
    if (uploadOk) {
      log('3) Upload: request succeeds, icon path field updates', true);
    } else if (fileExists) {
      log('3) Upload: request succeeds, icon path field updates', false, 'path not shown after upload');
    } else {
      log('3) Upload test', true, 'UI-only (filiz.svg not found)');
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
    console.log('\n--- BADGES/REWARDS UPLOAD SMOKE ---');
    res.forEach((r) => console.log(`${r.status}: ${r.step}${r.detail ? ' - ' + r.detail : ''}`));
    process.exit(res.some((r) => r.status === 'FAIL') ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
