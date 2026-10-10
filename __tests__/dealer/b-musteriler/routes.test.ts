/**
 * Müşteriler 360 — route + sunucu mantığı (prisma mock; gerçek DB YOK).
 *
 * Senaryolar:
 *  - Aksiyon önizleme ve gönderim: alıcıları SUNUCU çözer; izin kapalı / 7 gün içinde ulaşılmış /
 *    kapalı hesap elenir; bildirim `data.kind` kampanya grubunda ve `data.dealerId` taşır.
 *  - Başka işletmenin müşteri referansı aksiyona sızmaz; personel ve yönetici gönderemez.
 *  - Kişisel teklif müşteriye bağlı gerçek teklif kaydı açar (telafi servisi).
 *  - 360 detay: başka işletmenin referansı / bu işletmenin müşterisi olmayan kişi → 404.
 *  - Risk sekmesi: yorum değil MÜŞTERİ tekilleşir; durum (açık / ilgilenildi / geri döndü).
 *  - Liste: arama yalnız ad + tam e-posta; e-posta maskeli; ham kimlik dönmez.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../../helpers/prisma-proxy'));
jest.mock('next-auth', () => require('../../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../../helpers/session-mock').apiAuthMock);
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async () => null),
  redisSetJson: jest.fn(async () => undefined),
  redisIncrWithTtl: jest.fn(async () => null),
}));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 10 })) }));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => null), getModuleControls: jest.fn(async () => ({})) }));
jest.mock('@/lib/push', () => ({ sendPushNotification: jest.fn(async () => true) }));
const mockCreateRemedyOffer = jest.fn();
jest.mock('@/lib/remedy-offer-service', () => ({
  createRemedyOffer: (...a: unknown[]) => mockCreateRemedyOffer(...a),
  isRemedyOfferError: (e: unknown) => !!(e && typeof e === 'object' && (e as { name?: string }).name === 'RemedyOfferError'),
}));
jest.mock('@/lib/remedy-options', () => ({
  getRemedyOptions: jest.fn(async () => [{ type: 'discount', label: 'İndirim', unit: '%', values: [10, 15] }]),
}));
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (fn: () => unknown) => void fn() };
});

import { db, resetDb } from '../../helpers/prisma-proxy';
import { as, setSession } from '../../helpers/session-mock';
import { encodeCustomerRef } from '@/lib/dealer-customers/ref';

const DEALER_A = as('dealer-a', 'DEALER');
const STAFF_A = as('staff-1', 'STAFF');
const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000);

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

/** dealer-a'nın müşteri evreni: hepsi 60+ gündür gelmeyen (uyuyan) müşteriler. */
function seedUniverse() {
  db.dealerCustomerStats.findMany.mockResolvedValue(
    ['fresh', 'optedOut', 'recent', 'closed', 'pushOnly'].map((id, i) => ({
      customerId: id,
      totalSpend: 500 - i * 10,
      visitCount: 3,
      avgOrderValue: 100,
      reviewCount: 0,
      avgRating: null,
      firstVisitAt: daysAgo(200),
      lastVisitAt: daysAgo(90),
      churnRisk: id === 'fresh' ? 0.7 : null,
      calculatedAt: daysAgo(0),
    }))
  );
  db.user.findMany.mockImplementation(async (args: { where?: { id?: { in?: string[] } } }) => {
    const all = [
      { id: 'fresh', role: 'CUSTOMER', anonymizedAt: null, notificationPrefs: null, preferredLanguage: 'tr' },
      { id: 'optedOut', role: 'CUSTOMER', anonymizedAt: null, notificationPrefs: { campaign: { app: false, push: false } }, preferredLanguage: 'tr' },
      { id: 'recent', role: 'CUSTOMER', anonymizedAt: null, notificationPrefs: null, preferredLanguage: 'en' },
      { id: 'closed', role: 'CUSTOMER', anonymizedAt: daysAgo(3), notificationPrefs: null, preferredLanguage: 'tr' },
      { id: 'pushOnly', role: 'CUSTOMER', anonymizedAt: null, notificationPrefs: { campaign: { app: false, push: true } }, preferredLanguage: 'tr' },
    ];
    const ids = args?.where?.id?.in;
    return ids ? all.filter((u) => ids.includes(u.id)) : all;
  });
  // 'recent' bu işletmeden 3 gün önce ileti almış.
  db.notification.findMany.mockResolvedValue([{ userId: 'recent', createdAt: daysAgo(3), data: { dealerId: 'dealer-a', kind: 'campaign-win-back' } }]);
  db.remedyOffer.findMany.mockResolvedValue([]);
  db.analyticsEvent.findMany.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue({ businessName: 'Kahve Durağı', name: 'Ahmet Yılmaz' });
  db.notification.createMany.mockImplementation(async (args: { data: unknown[] }) => ({ count: args.data.length }));
  db.analyticsEvent.create.mockResolvedValue({ id: 'ev-1' });
}

async function postAction(session: unknown, body: unknown) {
  setSession(session);
  const { POST } = await import('@/app/api/dealer/customers/actions/route');
  return POST(req('/api/dealer/customers/actions', { method: 'POST', body }), {});
}

beforeEach(() => {
  resetDb();
  mockCreateRemedyOffer.mockReset();
});

describe('POST /api/dealer/customers/actions', () => {
  const winback = { audience: { kind: 'band', band: 'all' }, action: { type: 'message', template: 'winback' } };

  it('önizleme: izin kapalı, 7 gün içinde ulaşılmış ve kapalı hesap elenir; sayılar gerçek', async () => {
    seedUniverse();
    const res = await postAction(DEALER_A, { mode: 'preview', ...winback });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ candidates: 5, eligible: 2, skipped: { optedOut: 1, cooldown: 1, ineligible: 1, overCap: 0 } });
    expect(data.sample.message).toContain('Kahve Durağı'); // kişi adı değil işletme adı
    expect(data.sample.message).not.toContain('Ahmet');
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('gönderim: yalnız uygun alıcılar; data.kind kampanya grubunda + data.dealerId; push yalnız push açık olana; çalışma kaydı', async () => {
    seedUniverse();
    const res = await postAction(DEALER_A, { mode: 'execute', ...winback });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ sent: 2, offersCreated: 0 });
    const rows = db.notification.createMany.mock.calls.flatMap((c: [{ data: Array<{ userId: string; data: Record<string, unknown>; type: string }> }]) => c[0].data);
    expect(rows.map((r) => r.userId)).toEqual(['fresh']);
    expect(rows[0]!.data).toMatchObject({ kind: 'campaign-win-back', dealerId: 'dealer-a' });
    expect(rows[0]!.type).toBe('campaign');
    const { sendPushNotification } = jest.requireMock('@/lib/push') as { sendPushNotification: jest.Mock };
    expect(sendPushNotification.mock.calls.map((c) => c[0]).sort()).toEqual(['fresh', 'pushOnly']);
    const ev = db.analyticsEvent.create.mock.calls[0][0].data;
    expect(ev).toMatchObject({ userId: 'dealer-a', event: 'dealer_customer_action' });
    expect(ev.data.recipients.sort()).toEqual(['fresh', 'pushOnly']);
  });

  it('başka işletmenin müşteri referansı sızmaz: yalnız bu işletmenin müşterileri hedeflenir', async () => {
    seedUniverse();
    const foreign = encodeCustomerRef('dealer-b', 'fresh');
    const own = encodeCustomerRef('dealer-a', 'fresh');
    const stranger = encodeCustomerRef('dealer-a', 'not-a-customer');
    const res = await postAction(DEALER_A, {
      mode: 'preview',
      audience: { kind: 'customers', refs: [foreign, own, stranger] },
      action: { type: 'message', template: 'checkin' },
    });
    const { data } = await res.json();
    expect(data.candidates).toBe(1);
    expect(data.eligible).toBe(1);
  });

  it('uygun alıcı yoksa 409 ve hiçbir şey gönderilmez (sahte "hazırlandı ✓" yok)', async () => {
    seedUniverse();
    const res = await postAction(DEALER_A, {
      mode: 'execute',
      audience: { kind: 'customers', refs: [encodeCustomerRef('dealer-a', 'optedOut')] },
      action: { type: 'message', template: 'checkin' },
    });
    expect(res.status).toBe(409);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('kişisel teklif: müşteriye bağlı gerçek teklif kaydı (send modu, şablon seçenekleri); açık teklif çakışması sayılır', async () => {
    seedUniverse();
    mockCreateRemedyOffer.mockResolvedValueOnce({ offerId: 'o1', status: 'pending', notificationSent: true });
    const res = await postAction(DEALER_A, {
      mode: 'execute',
      audience: { kind: 'segment', tag: 'at_risk' },
      action: { type: 'personal_offer', note: 'Tekrar bekleriz' },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ offersCreated: 1, conflicts: 0 });
    expect(mockCreateRemedyOffer).toHaveBeenCalledWith(
      expect.objectContaining({ source: { kind: 'personal' }, dealerId: 'dealer-a', userId: 'fresh', mode: 'send', message: 'Tekrar bekleriz' })
    );
  });

  it('personel gönderemez (403); bilinmeyen şablon 400', async () => {
    seedUniverse();
    expect((await postAction(STAFF_A, { mode: 'preview', ...winback })).status).toBe(403);
    const bad = await postAction(DEALER_A, { mode: 'preview', audience: { kind: 'band', band: 'all' }, action: { type: 'message', template: '5x_points' } });
    expect(bad.status).toBe(400);
  });
});

describe('GET /api/dealer/customers/[ref]', () => {
  async function get(ref: string) {
    setSession(DEALER_A);
    const { GET } = await import('@/app/api/dealer/customers/[ref]/route');
    return GET(req(`/api/dealer/customers/${ref}`), { params: Promise.resolve({ ref }) });
  }

  it('başka işletmenin referansı ve bu işletmede tüketimi olmayan kişi → 404', async () => {
    seedUniverse();
    expect((await get(encodeCustomerRef('dealer-b', 'fresh'))).status).toBe(404);
    expect((await get(encodeCustomerRef('dealer-a', 'stranger'))).status).toBe(404);
  });

  it('detay: gerekçeler, ulaşılabilirlik, yanıtlanmamış olumsuz yorum → önerilen adım "reply"; e-posta maskeli', async () => {
    seedUniverse();
    db.user.findUnique.mockResolvedValue({
      id: 'fresh', name: 'Ayşe Yılmaz', email: 'ayse.yilmaz@ornek.com', image: null, trustTier: null, anonymizedAt: null, role: 'CUSTOMER', notificationPrefs: null,
    });
    db.consumption.findMany.mockResolvedValue([{ id: 'c1', createdAt: daysAgo(90), amount: 100, product: { name: 'Latte' } }]);
    db.feedback.findMany.mockResolvedValue([
      { id: 'f1', rating: 1, text: 'Soğuktu', sentiment: 'negative', churnRisk: 0.8, dealerReply: null, createdAt: daysAgo(91), trustFlagged: false },
    ]);
    db.consumptionReview.findMany.mockResolvedValue([]);
    db.notification.findMany.mockResolvedValue([]);
    const res = await get(encodeCustomerRef('dealer-a', 'fresh'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.email).not.toContain('ayse.yilmaz');
    expect(data.suggestion).toBe('reply');
    expect(data.reachable).toBe(true);
    expect(data.reasons.join(' ')).toMatch(/yanıtlanmadı/);
    expect(data.timeline.some((t: { title: string }) => t.title.includes('Latte'))).toBe(true);
    expect(JSON.stringify(data)).not.toContain('"fresh"');
  });
});

describe('GET /api/dealer/customers/risk', () => {
  it('müşteri tekilleşir (aynı kişinin 3 yorumu = 1 satır); durum: geri döndü / ilgilenildi / açık', async () => {
    setSession(DEALER_A);
    db.dealerCustomerStats.findMany.mockResolvedValue([
      { customerId: 'back', totalSpend: 100, visitCount: 3, avgOrderValue: 30, reviewCount: 3, avgRating: 2, firstVisitAt: daysAgo(100), lastVisitAt: daysAgo(1), churnRisk: 0.7, calculatedAt: daysAgo(0) },
      { customerId: 'handled', totalSpend: 100, visitCount: 3, avgOrderValue: 30, reviewCount: 1, avgRating: 2, firstVisitAt: daysAgo(100), lastVisitAt: daysAgo(30), churnRisk: 0.6, calculatedAt: daysAgo(0) },
      { customerId: 'open', totalSpend: 100, visitCount: 3, avgOrderValue: 30, reviewCount: 1, avgRating: 2, firstVisitAt: daysAgo(100), lastVisitAt: daysAgo(30), churnRisk: 0.55, calculatedAt: daysAgo(0) },
      { customerId: 'calm', totalSpend: 100, visitCount: 3, avgOrderValue: 30, reviewCount: 1, avgRating: 5, firstVisitAt: daysAgo(100), lastVisitAt: daysAgo(2), churnRisk: 0.1, calculatedAt: daysAgo(0) },
    ]);
    db.feedback.findMany.mockImplementation(async (args: { where: { userId?: unknown } }) =>
      args.where.userId
        ? [
            { id: 'f1', userId: 'back', rating: 1, text: 'a', sentiment: 'negative', churnRisk: 0.7, dealerReply: null, createdAt: daysAgo(5) },
            { id: 'f2', userId: 'back', rating: 1, text: 'b', sentiment: 'negative', churnRisk: 0.7, dealerReply: null, createdAt: daysAgo(6) },
            { id: 'f3', userId: 'back', rating: 2, text: 'c', sentiment: 'negative', churnRisk: 0.7, dealerReply: null, createdAt: daysAgo(7) },
            { id: 'f4', userId: 'handled', rating: 1, text: 'd', sentiment: 'negative', churnRisk: 0.6, dealerReply: 'Özür dileriz', createdAt: daysAgo(25) },
            { id: 'f5', userId: 'open', rating: 2, text: 'e', sentiment: 'negative', churnRisk: 0.55, dealerReply: null, createdAt: daysAgo(25) },
          ]
        : []
    );
    db.consumptionReview.findMany.mockResolvedValue([]);
    db.remedyOffer.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    db.feedback.count.mockResolvedValue(2);
    db.user.findUnique.mockResolvedValue({ dealerChurnIntervention: { enabled: true, churnThreshold: 0.6 } });
    db.analyticsEvent.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/dealer/customers/risk/route');
    const res = await GET(req('/api/dealer/customers/risk'), {});
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.rows).toHaveLength(3);
    const status = Object.fromEntries(data.rows.map((r: { ref: string; status: string }) => [r.ref, r.status]));
    expect(status[encodeCustomerRef('dealer-a', 'back')]).toBe('recovered');
    expect(status[encodeCustomerRef('dealer-a', 'handled')]).toBe('handled');
    expect(status[encodeCustomerRef('dealer-a', 'open')]).toBe('open');
    expect(data.counts).toEqual({ open: 1, handled: 1, recovered: 1 });
    expect(data.distribution).toMatchObject({ high: 3, low: 1 });
    expect(data.anonymousHighRisk30d).toBe(2);
    expect(data.intervention.config).toMatchObject({ enabled: true, thresholdPercent: 60 });
    // Risk sinyali sorguları güvenilmez işaretli yorumları dışlar ve bayi kapsamlıdır.
    const sigCall = db.feedback.findMany.mock.calls.find((c: [{ where: { userId?: unknown } }]) => c[0].where.userId)[0];
    expect(sigCall.where).toMatchObject({ qrCode: { dealerId: 'dealer-a' }, trustFlagged: false });
  });
});

describe('GET /api/dealer/customers — arama', () => {
  it('arama yalnız ad (contains) + TAM e-posta eşleşmesi; anonimleştirilmiş hesap aranmaz', async () => {
    seedUniverse();
    setSession(DEALER_A);
    const { GET } = await import('@/app/api/dealer/customers/route');
    await GET(req('/api/dealer/customers?q=ayse@ornek.com'), {});
    const searchCall = db.user.findMany.mock.calls.find((c: [{ where: { OR?: unknown } }]) => c[0]?.where?.OR)[0];
    expect(searchCall.where.anonymizedAt).toBeNull();
    expect(searchCall.where.OR).toEqual([
      { name: { contains: 'ayse@ornek.com', mode: 'insensitive' } },
      { email: { equals: 'ayse@ornek.com', mode: 'insensitive' } },
    ]);
  });
});
