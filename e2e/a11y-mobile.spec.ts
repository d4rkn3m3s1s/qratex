import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

/**
 * Mobil erişilebilirlik kapısı (mobil-erisilebilirlik-i18n B13) — `mobile-android` ve
 * `mobile-iphone` projelerinde koşar (playwright.config.ts).
 *
 *  - axe-core (eslint-plugin-jsx-a11y bağımlılığıyla zaten kurulu; ek paket yok) WCAG 2.0/2.1/2.2
 *    A+AA etiketleriyle taranır; "critical" ve "serious" ihlal 0 olmalı.
 *  - Yatay taşma yok (telefon genişliğinde sayfa yana kaymaz).
 *  - `<html lang>` dil çerezini izler (EN kullanıcıda ekran okuyucu İngilizce telaffuz eder).
 *
 * Oturum gerektirmeyen giriş yüzeyleri taranır; panel rotaları için oturumlu tarama
 * `E2E_CUSTOMER_EMAIL` / `E2E_CUSTOMER_PASSWORD` verilirse aynı denetimi müşteri sekmelerinde yapar.
 */
const AXE_PATH = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

const PUBLIC_ROUTES = ['/', '/auth/login', '/auth/register', '/neden-qratex', '/guven', '/blog'];
const CUSTOMER_ROUTES = ['/customer', '/customer/scan', '/customer/wallet/card', '/customer/wallet/rewards', '/customer/me/settings'];

type AxeViolation = { id: string; impact: string | null; help: string; nodes: Array<{ target: unknown }> };

async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: AxeViolation[] }> } }).axe;
    const res = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      resultTypes: ['violations'],
    });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target })) }));
  });
}

async function assertAccessible(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const violations = (await runAxe(page)).filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(violations, `${route} axe critical/serious: ${JSON.stringify(violations, null, 2)}`).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${route} yatay taşma (px)`).toBeLessThanOrEqual(1);
}

test.describe('Mobil erişilebilirlik — giriş yüzeyleri', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`axe + taşma: ${route}`, async ({ page }) => {
      await assertAccessible(page, route);
    });
  }

  test('html lang dil çerezini izler (EN)', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'qratex-locale', value: 'en', url: baseURL ?? 'http://localhost:3000' }]);
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('Mobil erişilebilirlik — müşteri paneli (oturumlu)', () => {
  const email = process.env.E2E_CUSTOMER_EMAIL;
  const password = process.env.E2E_CUSTOMER_PASSWORD;
  test.skip(!email || !password, 'E2E_CUSTOMER_EMAIL / E2E_CUSTOMER_PASSWORD verilmedi');

  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel(/e-posta|email/i).fill(email!);
    await page.getByLabel(/şifre|password/i).first().fill(password!);
    await page.getByRole('button', { name: /giriş yap|sign in|log in/i }).first().click();
    await page.waitForURL(/\/customer/, { timeout: 20_000 });
  });

  for (const route of CUSTOMER_ROUTES) {
    test(`axe + taşma: ${route}`, async ({ page }) => {
      await assertAccessible(page, route);
      // Alt sekme çubuğu: mobilde birincil işler tek dokunuş (B5).
      await expect(page.getByRole('navigation').filter({ has: page.locator('[aria-current="page"]') }).first()).toBeVisible();
    });
  }
});
