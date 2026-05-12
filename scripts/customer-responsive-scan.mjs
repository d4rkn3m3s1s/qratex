/**
 * Müşteri alanı: tüm rotalarda yatay taşma taraması (mobil / tablet / masaüstü).
 * `npm run dev` açıkken: npm run audit:customer-responsive
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const CUSTOMER_PATHS = [
  '/customer',
  '/customer/my-card',
  '/customer/consumptions',
  '/customer/scan',
  '/customer/feedbacks',
  '/customer/remedy',
  '/customer/ai-insights',
  '/customer/trends',
  '/customer/journey-score',
  '/customer/nearby',
  '/customer/analytics',
  '/customer/badges',
  '/customer/shop',
  '/customer/squads',
  '/customer/quests',
  '/customer/lounge',
  '/customer/rewards',
  '/customer/surprise-boxes',
  '/customer/campaigns',
  '/customer/donations',
  '/customer/leaderboard',
  '/customer/settings',
  '/customer/favorites',
  '/customer/referral',
  '/customer/journey-timeline',
];

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on('pageerror', () => {});

    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: /Demo giriş:\s*Müşteri/i }).click();
    await page.waitForURL(/\/customer/, { timeout: 60000 }).catch(() => {});

    for (const path of CUSTOMER_PATHS) {
      try {
        const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
        const status = res?.status() ?? 0;
        await page.waitForTimeout(600);
        const m = await page.evaluate(() => {
          const de = document.documentElement;
          const b = document.body;
          const sw = Math.max(de.scrollWidth, b ? b.scrollWidth : 0);
          return { scrollWidth: sw, clientWidth: de.clientWidth, overflowX: sw > de.clientWidth + 2 };
        });
        results.push({ viewport: vp.name, path, status, ...m });
      } catch (e) {
        results.push({ viewport: vp.name, path, status: 'FAIL', overflowX: null, error: String(e) });
      }
    }
    await ctx.close();
  }
  await browser.close();

  const bad = results.filter((r) => r.overflowX === true || r.status === 'FAIL' || (r.status && r.status >= 400));
  console.log('\n=== Müşteri alanı responsive tarama ===\n');
  for (const vp of VIEWPORTS) {
    console.log(`--- ${vp.name} ---`);
    for (const path of CUSTOMER_PATHS) {
      const r = results.find((x) => x.viewport === vp.name && x.path === path);
      if (!r) continue;
      const ok = r.overflowX === false;
      console.log(
        `  ${(ok ? 'ok' : 'PROBLEM').padEnd(8)} ${path}  ${r.scrollWidth ?? '?'}/${r.clientWidth ?? '?'}  http=${r.status}`
      );
    }
    console.log('');
  }
  if (bad.length) {
    console.log('Sorunlu kayıt:', bad.length);
    bad.forEach((b) => console.log(b));
  } else {
    console.log('Tüm ölçümler: yatay taşma yok.\n');
  }
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
