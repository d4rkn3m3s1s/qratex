import fs from 'node:fs';
import path from 'node:path';
import { devices, type Browser } from '@playwright/test';

/**
 * Kalite kapısı e2e paketinin rol hesapları ve oturum durumu (storageState) üretimi.
 *
 * Demo hesaplar seed'den gelir; STAFF hesabı e2e turunda bayi davet akışıyla oluşturuldu
 * (`.wf-tmp/e2e/accounts.json`). Ortam değişkeniyle ezilebilir: E2E_<ROL>_EMAIL / _PASSWORD.
 * ADMIN için giriş sonrası gizli kapı cevabı (E2E_ADMIN_GATE, varsayılan "7") girilir.
 */
export type Role = 'admin' | 'dealer' | 'customer' | 'staff';

export const ROLES: Role[] = ['admin', 'dealer', 'customer', 'staff'];

const DEFAULTS: Record<Role, { email: string; password: string; home: string }> = {
  admin: { email: 'admin@qratex.com', password: 'Admin123!', home: '/admin' },
  dealer: { email: 'dealer@qratex.com', password: 'Dealer123!', home: '/dealer' },
  customer: { email: 'customer@qratex.com', password: 'Customer123!', home: '/customer' },
  staff: { email: 'e2e.staff.bekip@qratex.test', password: 'StaffTest123!', home: '/staff' },
};

export function account(role: Role) {
  const d = DEFAULTS[role];
  const up = role.toUpperCase();
  return {
    email: process.env[`E2E_${up}_EMAIL`] ?? d.email,
    password: process.env[`E2E_${up}_PASSWORD`] ?? d.password,
    home: d.home,
  };
}

/**
 * Kapı paketinin cihaz profili. Oturum belirteci tarayıcı imzasına bağlıdır (lib/token-replay.ts:
 * farklı User-Agent → SESSION_REPLAY ve oturum iptali); giriş, rota taraması ve API akışları
 * AYNI profille koşmalı.
 */
export const GATE_DEVICE = devices['Pixel 7'];

export const AUTH_DIR = path.join(process.cwd(), 'test-results', '.auth');

export function statePath(role: Role) {
  return path.join(AUTH_DIR, `${role}.json`);
}

/** Giriş formuyla oturum açar (ADMIN'de kapıyı geçer) ve storageState dosyasını yazar. */
export async function createState(browser: Browser, baseURL: string, role: Role) {
  const acc = account(role);
  const context = await browser.newContext({ ...GATE_DEVICE, baseURL });
  const page = await context.newPage();
  await page.goto(`/auth/login?callbackUrl=${encodeURIComponent(acc.home)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email],input[name=email]').first().fill(acc.email);
  await page.locator('input[type=password]').first().fill(acc.password);
  await page.locator('input[type=password]').first().press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 90_000 });

  if (role === 'admin') {
    // Kök neden (ölçüldü): kapı sayfası dev'de derlenirken input SSR ile görünür olur ama React
    // henüz hidrate olmamıştır → yazılan rakam/Enter kaybolur, POST hiç atılmaz, URL beklemesi
    // 30 sn'de düşer. Hidrasyonun işareti sayfanın kendi GET /api/admin/gate çağrısıdır; onu
    // bekle, sonra POST yanıtına (çerez) bak, en son /admin'e kendimiz gideriz (derleme süresi).
    const gateGet = (r: import('@playwright/test').Response) =>
      r.url().includes('/api/admin/gate') && r.request().method() === 'GET';
    const hydrated = page.waitForResponse(gateGet, { timeout: 120_000 }).catch(() => null);
    if (!page.url().includes('/admin-gate')) await page.goto('/admin-gate', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    if (page.url().includes('/admin-gate')) {
      await hydrated;
      const input = page.locator('input').first();
      await input.waitFor({ state: 'visible', timeout: 30_000 });
      // Mobil profilde çerez onay bandı inputun üstüne biniyor → click sonsuza dek bekliyordu.
      const reject = page.getByRole('button', { name: 'Tümünü reddet' });
      if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => {});
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        await input.focus();
        const post = page.waitForResponse(
          (r) => r.url().includes('/api/admin/gate') && r.request().method() === 'POST',
          { timeout: 30_000 },
        ).catch(() => null);
        await page.keyboard.type(process.env.E2E_ADMIN_GATE ?? '7', { delay: 80 });
        await page.keyboard.press('Enter');
        const res = await post;
        if (res && res.ok()) ok = true;
        else if (res && res.status() !== 400) throw new Error(`admin-gate POST ${res.status()}`);
      }
      if (!ok) throw new Error('admin-gate: kapı cevabı gönderilemedi (POST yok)');
      // Sayfa 900 ms sonra kendisi yönlendirir (ayrı goto onu ERR_ABORTED ile keser); /admin'in
      // dev derlemesi 30 sn'yi aşabildiği için gerçekçi süre; /admin akışı (streaming) yükte
      // dakikalarca bitmediği için DCL değil 'commit' beklenir — çerez zaten POST'ta yazıldı.
      await page.waitForURL((u) => !u.pathname.startsWith('/admin-gate'), { timeout: 180_000, waitUntil: 'commit' });
      if (new URL(page.url()).pathname.startsWith('/admin-gate')) throw new Error('admin-gate: kapı çerezi kabul edilmedi');
    }
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: statePath(role) });
  const finalPath = new URL(page.url()).pathname;
  await context.close();
  return finalPath;
}
