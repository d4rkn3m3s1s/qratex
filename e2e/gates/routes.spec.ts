import { test, expect, type Page } from '@playwright/test';
import { statePath, type Role } from '../support/accounts';
import { PUBLIC_ROUTES, ROLE_ROUTES } from '../support/routes';
import { scanPage, writeGateRecord } from '../support/scan';

/**
 * Birincil rotaların açılması (kalite kapısı): her rota 200 ile açılır, konsol hatası 0,
 * başarısız ağ isteği 0. Aynı ziyarette axe / taşma / dokunma hedefi / kontrast ölçülür ve
 * GATES_OUT klasörüne yazılır — bu ölçümler testi düşürmez, scripts/quality-gates.mjs
 * kendi kapılarında değerlendirir (tek kırmızı ölçüm tüm e2e sonucunu maskelemesin).
 * Rotalar yalnız okuma yapar; DB'ye yazan akışlar e2e/gates/flows.spec.ts'te ayrı.
 */

type Visit = { status: number | null; finalPath: string; consoleErrors: string[]; failedRequests: string[] };

const IGNORED_FAILURE = /net::ERR_ABORTED/; // gezinme/prefetch iptali — hata değil

async function visit(page: Page, route: string): Promise<Visit> {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`);
  });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (!IGNORED_FAILURE.test(why)) failedRequests.push(`${why} ${r.method()} ${r.url().slice(0, 200)}`);
  });
  const res = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  // Çerez bandı / ilk kullanım turu ölçümü örtmesin (yalnız kapatma; kayıt yazmaz).
  for (const name of [/tümünü reddet/i, /^atla$/i]) {
    await page.getByRole('button', { name }).first().click({ timeout: 800 }).catch(() => {});
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  return { status: res?.status() ?? null, finalPath: new URL(page.url()).pathname, consoleErrors, failedRequests };
}

function routeSuite(role: Role | null, routes: string[]) {
  test.describe(`rotalar: ${role ?? 'public'}`, () => {
    if (role) test.use({ storageState: statePath(role) });
    for (const route of routes) {
      test(`${role ?? 'public'} ${route}`, async ({ page }) => {
        test.setTimeout(180_000);
        const v = await visit(page, route);
        const scan = await scanPage(page);
        writeGateRecord(`${role ?? 'public'}${route}`, { role: role ?? 'public', route, ...v, ...scan });

        expect(v.status, `${route} HTTP durumu`).toBe(200);
        if (role) expect(v.finalPath.startsWith('/auth'), `${route} oturum düştü → ${v.finalPath}`).toBe(false);
        expect(v.consoleErrors, `${route} konsol hataları`).toEqual([]);
        expect(v.failedRequests, `${route} başarısız istekler`).toEqual([]);
      });
    }
  });
}

routeSuite(null, PUBLIC_ROUTES);
for (const role of Object.keys(ROLE_ROUTES) as Role[]) routeSuite(role, ROLE_ROUTES[role]);
