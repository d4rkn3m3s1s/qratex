/**
 * Admin panel: tüm rotalarda yatay taşma (overflow) taraması.
 * Kullanım: sunucu çalışırken  `node scripts/admin-responsive-scan.mjs`
 * Playwright: npx playwright install chromium (gerekirse)
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const ADMIN_PATHS = [
  '/admin',
  '/admin/cards',
  '/admin/users',
  '/admin/feedbacks',
  '/admin/badges',
  '/admin/quests',
  '/admin/rewards',
  '/admin/surprise-boxes',
  '/admin/insights',
  '/admin/donations',
  '/admin/referrals',
  '/admin/squads',
  '/admin/fraud-prevention',
  '/admin/trust-command',
  '/admin/economy-sim',
  '/admin/dealers-health',
  '/admin/ab-testing',
  '/admin/analytics',
  '/admin/segments',
  '/admin/playbooks',
  '/admin/ai-dashboard',
  '/admin/agent-council',
  '/admin/agent-council/agents',
  '/admin/agent-council/history',
  '/admin/ai-detailed',
  '/admin/ai-learning',
  '/admin/ai-quality',
  '/admin/ai-settings',
  '/admin/pricing',
  '/admin/partners',
  '/admin/pages',
  '/admin/themes',
  '/admin/features',
  '/admin/compliance',
  '/admin/points-matrix',
  '/admin/league-settings',
  '/admin/discovery',
  '/admin/seo',
  '/admin/audit',
  '/admin/webhooks',
  '/admin/api-keys',
  '/admin/modules',
  '/admin/tech/add',
  '/admin/observability',
  '/admin/settings',
];

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

function measureOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const b = document.body;
    const sw = Math.max(de.scrollWidth, b ? b.scrollWidth : 0, b ? b.offsetWidth : 0);
    const cw = de.clientWidth;
    return {
      scrollWidth: sw,
      clientWidth: cw,
      overflowX: sw > cw + 2,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrors = [];

    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: /Demo giriş:\s*Admin/i }).click();
    await page.waitForURL(/\/admin/, { timeout: 60000 }).catch(() => {});

    for (const path of ADMIN_PATHS) {
      const url = `${BASE}${path}`;
      consoleErrors.length = 0;
      try {
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        const status = res?.status() ?? 0;
        await page.waitForTimeout(800);
        const m = await measureOverflow(page);
        results.push({
          viewport: vp.name,
          path,
          status,
          ...m,
          errors: [...consoleErrors].filter(
            (t) =>
              !t.includes('Content Security Policy') &&
              !t.includes('va.vercel-scripts.com') &&
              !t.includes('vercel-insights')
          ),
        });
      } catch (e) {
        results.push({
          viewport: vp.name,
          path,
          status: 'FAIL',
          scrollWidth: null,
          clientWidth: null,
          overflowX: null,
          errors: [String(e)],
        });
      }
    }

    await ctx.close();
  }

  await browser.close();

  const overflows = results.filter((r) => r.overflowX === true);
  const failed = results.filter((r) => r.status === 'FAIL' || (r.status && r.status >= 400));
  const withErrors = results.filter((r) => r.errors && r.errors.length > 0);

  console.log('\n=== QRATEX Admin responsive scan ===\n');
  console.log(`Base: ${BASE}`);
  console.log(`Paths: ${ADMIN_PATHS.length} × viewports: ${VIEWPORTS.length}\n`);

  for (const vp of VIEWPORTS) {
    console.log(`--- ${vp.name} (${vp.width}×${vp.height}) ---`);
    for (const path of ADMIN_PATHS) {
      const r = results.find((x) => x.viewport === vp.name && x.path === path);
      if (!r) continue;
      const flag = r.overflowX ? 'OVERFLOW' : 'ok';
      console.log(
        `  ${flag.padEnd(10)} ${path.padEnd(42)} ${r.scrollWidth ?? '?'} / ${r.clientWidth ?? '?'}  http=${r.status}`
      );
    }
    console.log('');
  }

  if (overflows.length) {
    console.log(`\n⚠ Yatay taşma: ${overflows.length} kayıt`);
    overflows.forEach((r) => console.log(`  - ${r.viewport} ${r.path} (${r.scrollWidth}>${r.clientWidth})`));
  } else {
    console.log('\n✓ Ölçülen hiçbir sayfada yatay taşma yok (scrollWidth ≤ clientWidth).');
  }

  if (failed.length) {
    console.log(`\n⚠ Yükleme hatası: ${failed.length}`);
    failed.forEach((r) => console.log(`  - ${r.viewport} ${r.path} ${r.status}`));
  }

  if (withErrors.length) {
    console.log(`\n⚠ Konsol hatası (CSP/Vercel filtre dışı): ${withErrors.length} kayıt`);
    withErrors.slice(0, 20).forEach((r) => {
      console.log(`  ${r.viewport} ${r.path}: ${r.errors[0]?.slice(0, 120)}`);
    });
    if (withErrors.length > 20) console.log(`  ... +${withErrors.length - 20} more`);
  }

  process.exit(overflows.length || failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
