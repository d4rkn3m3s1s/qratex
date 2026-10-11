import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { GATE_DEVICE, statePath, type Role } from '../support/accounts';

/**
 * Kritik akışlar (DB'ye YAZAR — kayıtlar "[TEST]" önekli). Yalnız E2E_WRITE=1 ile koşar;
 * kalite kapısının salt-okur turunda atlanır. Seri koşar: puan bakiyesi akışlar arasında
 * paylaşılan durumdur.
 *
 *  1. QR geri bildirim (oturumsuz) + talep belirteciyle hesaba bağlama → puan artar
 *  2. Kasa tüketimi (bayi, müşteri kartı) → müşteri puanı artar; aynı clientOpId tekrarı yeni puan üretmez
 *  3. Ödül alma (puanla) → bakiye ödül bedeli kadar düşer
 *  4. Oyun pratik turu → ödülsüz, bakiye değişmez
 *  5. Admin puan düzeltme → +1 / −1 (net sıfır), gerekçe kodu zorunlu
 *  6. KVKK (veri sahibi) başvurusu → oluşur ya da açık başvuru zaten vardır (409), listede görünür
 */
test.describe.configure({ mode: 'serial' });
test.skip(process.env.E2E_WRITE !== '1', 'DB yazan akışlar: E2E_WRITE=1 ile çalıştırın');

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const CARD_TOKEN = process.env.E2E_CUSTOMER_CARD ?? 'DEMO_AktifKartToken12345';
const QR_CODE = process.env.E2E_QR_CODE ?? 'DEMO-CAFE-002';

const ctx: Partial<Record<Role | 'anon', APIRequestContext>> = {};
const api = async (role: Role | 'anon') =>
  (ctx[role] ??= await pwRequest.newContext({
    baseURL: BASE,
    ...(role === 'anon' ? {} : { storageState: statePath(role) }),
    userAgent: GATE_DEVICE.userAgent,
    extraHTTPHeaders: { origin: BASE },
  }));

const uid = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function json(res: Awaited<ReturnType<APIRequestContext['get']>>) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

async function customerPoints(): Promise<number> {
  const res = await (await api('customer')).get('/api/customer/wallet/card');
  expect(res.status()).toBe(200);
  const body = await json(res);
  return Number(body.data.status.points);
}

test.afterAll(async () => {
  await Promise.all(Object.values(ctx).map((c) => c?.dispose()));
});

test('QR geri bildirim + hesaba bağlama puan verir', async () => {
  const before = await customerPoints();
  const sent = await (await api('anon')).post(`/api/public/feedback/${QR_CODE}`, {
    data: { rating: 4, text: '[TEST] e2e kalite kapısı geri bildirimi' },
  });
  const sentBody = await json(sent);
  expect(sent.status(), JSON.stringify(sentBody)).toBeLessThan(300);
  const token = sentBody.data?.reward?.claimToken;
  expect(token, 'talep belirteci').toBeTruthy();

  const claim = await (await api('customer')).post('/api/public/feedback-claim', { data: { token } });
  expect(claim.status(), JSON.stringify(await json(claim))).toBeLessThan(300);
  // Aynı belirteç ikinci kez puan basmaz.
  const again = await (await api('customer')).post('/api/public/feedback-claim', { data: { token } });
  const afterSecond = await customerPoints();
  expect(afterSecond).toBeGreaterThan(before);
  expect(again.status()).not.toBe(500);
});

test('kasa tüketimi müşteriye puan yazar, tekrar oynatma yeni puan üretmez', async () => {
  const before = await customerPoints();
  const clientOpId = uid();
  const payload = { cardToken: CARD_TOKEN, amount: 25, note: '[TEST] e2e kasa tüketimi', clientOpId };
  const dealer = await api('dealer');
  const first = await dealer.post('/api/dealer/consumptions', { data: payload });
  const firstBody = await json(first);
  expect(first.status(), JSON.stringify(firstBody)).toBeLessThan(300);
  const mid = await customerPoints();
  expect(mid).toBeGreaterThan(before);

  const replay = await dealer.post('/api/dealer/consumptions', { data: payload });
  const replayBody = await json(replay);
  expect(replay.status(), JSON.stringify(replayBody)).toBeLessThan(300);
  expect(replayBody.data?.duplicate ?? replayBody.duplicate).toBe(true);
});

test('ödül alma bakiyeden bedel kadar düşer', async () => {
  const customer = await api('customer');
  const list = await json(await customer.get('/api/gamification/rewards'));
  const rewards = (list.data as Array<{ id: string; cost: number; stock: number | null; isActive: boolean }>)
    .filter((r) => r.isActive && (r.stock === null || r.stock > 0))
    .sort((a, b) => a.cost - b.cost);
  expect(rewards.length, 'alınabilir ödül').toBeGreaterThan(0);
  const reward = rewards[0];
  const before = await customerPoints();
  expect(before, 'bakiye ödül için yeterli').toBeGreaterThanOrEqual(reward.cost);

  const res = await customer.post('/api/customer/wallet/rewards/claim', {
    data: { rewardId: reward.id },
    headers: { 'idempotency-key': uid() },
  });
  expect(res.status(), JSON.stringify(await json(res))).toBeLessThan(300);
  expect(await customerPoints()).toBeLessThanOrEqual(before - reward.cost);
});

test('oyun pratik turu ödülsüzdür (bakiye değişmez)', async () => {
  const before = await customerPoints();
  const res = await (await api('customer')).post('/api/customer/games/fake-hunter/practice', { data: {} });
  const body = await json(res);
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.mode ?? body.data?.mode).toBe('practice');
  expect(await customerPoints()).toBe(before);
});

test('admin puan düzeltmesi (+1 / −1, net sıfır)', async () => {
  const admin = await api('admin');
  const list = await json(await admin.get('/api/admin/users/list?q=customer%40qratex.com'));
  const rows = (list.data?.rows ?? list.data?.items ?? list.data?.users ?? []) as Array<{ id: string; email: string }>;
  const target = rows.find((r) => r.email === 'customer@qratex.com');
  expect(target, `müşteri bulunamadı: ${JSON.stringify(list).slice(0, 300)}`).toBeTruthy();

  const before = await customerPoints();
  for (const delta of [1, -1]) {
    const res = await admin.post(`/api/admin/users/${target!.id}/points`, {
      data: { delta, xp: 0, reasonCode: 'correction', note: '[TEST] e2e kalite kapısı düzeltmesi', requestId: uid() },
    });
    expect(res.status(), JSON.stringify(await json(res))).toBeLessThan(300);
  }
  // Düzeltme çifti net sıfırdır (bu sırada müşteri hesabında başka akış koşmuyor: seri mod).
  expect(await customerPoints()).toBe(before);
});

test('KVKK başvurusu oluşturulur ve listede görünür', async () => {
  const customer = await api('customer');
  const res = await customer.post('/api/customer/privacy-request', {
    data: { type: 'objection', message: '[TEST] e2e kalite kapısı KVKK başvurusu' },
  });
  const body = await json(res);
  expect([200, 201, 409], JSON.stringify(body)).toContain(res.status());
  const list = await json(await customer.get('/api/customer/privacy-request'));
  const open = (list.requests as Array<{ type: string; status: string }>).filter((r) => r.type === 'objection');
  expect(open.length, 'itiraz başvurusu listede').toBeGreaterThan(0);
});
