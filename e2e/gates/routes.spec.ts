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

type Visit = {
  status: number | null;
  finalPath: string;
  consoleErrors: string[];
  failedRequests: string[];
  /** Üçüncü taraf görsel hataları (ör. Google profil fotoğrafı CDN'i ORB/429) — bilgi, kapıyı düşürmez. */
  externalImageFailures: string[];
};

const IGNORED_FAILURE = /net::ERR_ABORTED/; // gezinme/prefetch iptali — hata değil

/**
 * Bildirim SSE akışı sabit, boş bir akışla yanıtlanır. Akış kullanıcı başına dakikada 6 açılışla
 * sınırlıdır (lib/notification-stream-policy.ts, güvenlik kararı); 3 işçi bayi rotalarını tam sayfa
 * yükleyerek gezdiğinde sınır aşılıp 429 + konsol hatası üretiyordu (ölçülen: 4 bayi rotası) ve
 * açık akış networkidle'ı her rotada 20 sn bekletiyordu. Akışın kendisi birim testlerinde.
 */
async function stubNotificationStream(page: Page) {
  await page.route('**/api/dealer/notifications/stream*', (r) =>
    r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }, body: ': e2e\n\n' })
  );
}

async function visit(page: Page, route: string): Promise<Visit> {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const externalImageFailures: string[] = [];
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000').origin;
  const isExternalImage = (r: import('@playwright/test').Request) => r.resourceType() === 'image' && new URL(r.url()).origin !== origin;
  await stubNotificationStream(page);
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && isExternalImage(r.request())) externalImageFailures.push(`${r.status()} ${r.url().slice(0, 120)}`);
    else if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`);
  });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (IGNORED_FAILURE.test(why)) return;
    if (isExternalImage(r)) externalImageFailures.push(`${why} ${r.url().slice(0, 120)}`);
    else failedRequests.push(`${why} ${r.method()} ${r.url().slice(0, 200)}`);
  });
  const res = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  // Çerez bandı / ilk kullanım turu ölçümü örtmesin (yalnız kapatma; kayıt yazmaz).
  for (const name of [/tümünü reddet/i, /^atla$/i]) {
    await page.getByRole('button', { name }).first().click({ timeout: 800 }).catch(() => {});
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  return { status: res?.status() ?? null, finalPath: new URL(page.url()).pathname, consoleErrors, failedRequests, externalImageFailures };
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
