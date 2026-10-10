/**
 * Keşfet BFF uçları — route düzeyi (prisma sahte). Denetimdeki doğrulanmış hataların yeniden
 * üretilemediğini kanıtlar:
 *  - nearby: puan/çarpan ekrandaki mekân için hesaplanır (eski "ilk 8" hatası yok), platform geneli
 *    mutlu saat bir mekâna ATFEDİLMEZ, demo/askıdaki/adsız bayi vitrine çıkmaz, konum yuvarlanır.
 *  - saved: yalnız herkese açık işletme kaydedilir, kullanıcı başı üst sınır, IDOR yok.
 *  - seasonal-event: çoğul + uygunluk (BIRTHDAY herkese değil), bitişten sonra talep süresi,
 *    tek-kez + mintPoints defter anahtarı, tamamlanmamış görev ödül basmaz.
 */
import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/http/define-route';

// jest `@prisma/client`'ı node_modules taslağına çözer; `Prisma.sql/empty` üretilmiş istemcide.
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
const mockGate = jest.fn();
jest.mock('@/lib/places/gate.server', () => ({ assertPlacesAccess: (...a: unknown[]) => mockGate(...a) }));
jest.mock('@/lib/redis', () => ({ cachedJson: (_k: string, _t: number, f: () => unknown) => f() }));
jest.mock('@/lib/business-of-month', () => ({ getBusinessOfMonth: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/churn-intervention-core', () => ({ EXCLUDE_LEGACY_CHURN_FLASH: { NOT: { title: 'Seni özledik 🎁' } } }));
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));
const mockAward = jest.fn();
jest.mock('@/lib/badges/award', () => ({ awardBadgeInTx: (...a: unknown[]) => mockAward(...a) }));

type Fn = jest.Mock;
const db = {
  user: { findMany: jest.fn() as Fn, findFirst: jest.fn() as Fn, findUnique: jest.fn() as Fn },
  productCategory: { findMany: jest.fn() as Fn },
  happyHour: { findMany: jest.fn() as Fn },
  dealerFlashOffer: { findMany: jest.fn() as Fn },
  customerFavoriteDealer: {
    findMany: jest.fn() as Fn,
    findUnique: jest.fn() as Fn,
    count: jest.fn() as Fn,
    upsert: jest.fn() as Fn,
    deleteMany: jest.fn() as Fn,
  },
  seasonalCampaign: { findMany: jest.fn() as Fn, findUnique: jest.fn() as Fn },
  seasonalChallengeClaim: { findMany: jest.fn() as Fn, createMany: jest.fn() as Fn },
  badge: { findMany: jest.fn() as Fn },
  miniGameSession: { count: jest.fn() as Fn },
  consumptionReview: { count: jest.fn() as Fn },
  notification: { findMany: jest.fn() as Fn, create: jest.fn() as Fn },
  $queryRaw: jest.fn() as Fn,
  $transaction: jest.fn() as Fn,
};
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return db;
  },
  isPrismaConnectivityError: () => false,
}));

import { GET as nearbyGET } from '@/app/api/customer/places/nearby/route';
import { PUT as savePUT, DELETE as saveDELETE } from '@/app/api/customer/places/saved/[dealerId]/route';
import { GET as eventGET, POST as eventPOST } from '@/app/api/customer/seasonal-event/route';

const DAY = 24 * 60 * 60 * 1000;
const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } } : {}),
  });
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
const sqlText = (q: unknown) => ((q as { strings?: string[] }).strings ?? []).join(' ');

function dealer(id: string, lat: number, lng: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    businessName: `Mekan ${id}`,
    image: null,
    businessLogo: null,
    address: 'Kadıköy',
    latitude: lat,
    longitude: lng,
    businessHours: '7/24',
    holidayMode: false,
    businessCategory: 'cafe',
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    if (process.env.PLACES_DEBUG) process.stderr.write(a.map((x) => (x instanceof Error ? String(x.stack) : String(x))).join(' | ') + String.fromCharCode(10));
  });
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' }, expires: '2099-01-01' } });
  mockGate.mockResolvedValue(undefined);
  db.productCategory.findMany.mockResolvedValue([]);
  db.happyHour.findMany.mockResolvedValue([]);
  db.dealerFlashOffer.findMany.mockResolvedValue([]);
  db.customerFavoriteDealer.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
  db.notification.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ seasonalChallengeClaim: db.seasonalChallengeClaim, notification: db.notification }),
  );
});

describe('GET /api/customer/places/nearby', () => {
  it('yarıçap dışını eler; puan ekrandaki mekân için; global mutlu saat mekâna atfedilmez', async () => {
    db.user.findMany.mockResolvedValue([dealer('d1', 41.0, 29.0), dealer('d2', 41.3, 29.0)]);
    db.happyHour.findMany.mockResolvedValue([
      { id: 'hg', dealerId: null, name: 'Hafta sonu 2x', description: null, multiplier: 2, startTime: '00:00', endTime: '23:59', daysOfWeek: [], isActive: true, validFrom: null, validUntil: null, dealer: null },
      { id: 'hd', dealerId: 'd1', name: 'Öğle', description: null, multiplier: 1.5, startTime: '00:00', endTime: '23:59', daysOfWeek: [], isActive: true, validFrom: null, validUntil: null, dealer: { id: 'd1', businessName: 'Mekan d1', image: null, businessLogo: null, latitude: 41, longitude: 29, isDemo: false, suspendedAt: null } },
    ]);
    db.$queryRaw.mockImplementation(async (q: unknown) => (sqlText(q).includes('DISTINCT ON') ? [{ dealerId: 'd1', n: 4, avg: 4.5 }] : []));

    const res = await nearbyGET(req('/api/customer/places/nearby?lat=41.0001234&lng=29.0004321&radius=5'), params({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe('nearby');
    expect(body.data.items.map((i: { dealerId: string }) => i.dealerId)).toEqual(['d1']);
    expect(body.data.items[0].rating).toEqual({ avg: 4.5, n: 4 });
    expect(body.data.items[0].liveBoost).toMatchObject({ happyHourId: 'hd', multiplier: 1.5, scope: 'dealer' });
    expect(body.data.globalBoost).toMatchObject({ happyHourId: 'hg', multiplier: 2, scope: 'global' });
    expect(body.data.items[0].openState).toMatchObject({ status: 'open' });
    expect(body.data.categories).toEqual(['kahve']);

    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ role: 'DEALER', isDemo: false, suspendedAt: null, anonymizedAt: null });
    expect(JSON.stringify(where.AND)).toContain('businessName');
    expect(JSON.stringify(where.AND)).toContain('latitude');
  });

  it('konum yoksa "konumsuz göz at" — puana göre, mesafesiz', async () => {
    db.user.findMany.mockResolvedValue([dealer('a', 41, 29), dealer('b', 39, 32)]);
    db.$queryRaw.mockImplementation(async (q: unknown) => (sqlText(q).includes('DISTINCT ON') ? [{ dealerId: 'b', n: 10, avg: 4.8 }, { dealerId: 'a', n: 3, avg: 3 }] : []));
    const res = await nearbyGET(req('/api/customer/places/nearby'), params({}));
    const body = await res.json();
    expect(body.data.mode).toBe('browse');
    expect(body.data.items.map((i: { dealerId: string }) => i.dealerId)).toEqual(['b', 'a']);
    expect(body.data.items[0].distanceKm).toBeNull();
  });

  it('yalnız enlem → 400 VALIDATION; kapı kapalı → 403 MODULE_DISABLED (hata boş liste gibi görünmez)', async () => {
    const bad = await nearbyGET(req('/api/customer/places/nearby?lat=41'), params({}));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('VALIDATION');
    mockGate.mockRejectedValueOnce(new ApiError('MODULE_DISABLED'));
    const off = await nearbyGET(req('/api/customer/places/nearby'), params({}));
    expect(off.status).toBe(403);
    expect((await off.json()).code).toBe('MODULE_DISABLED');
  });

  it('müşteri dışı rol reddedilir', async () => {
    mockRequireAuth.mockResolvedValueOnce({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const res = await nearbyGET(req('/api/customer/places/nearby'), params({}));
    expect(res.status).toBe(403);
  });
});

describe('PUT/DELETE /api/customer/places/saved/:dealerId', () => {
  it('herkese açık olmayan (demo/askıda/adsız) işletme kaydedilemez → 404', async () => {
    db.user.findFirst.mockResolvedValue(null);
    const res = await savePUT(req('/api/customer/places/saved/d9', { method: 'PUT' }), params({ dealerId: 'd9' }));
    expect(res.status).toBe(404);
    expect(db.customerFavoriteDealer.upsert).not.toHaveBeenCalled();
    expect(db.user.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'd9', isDemo: false, role: 'DEALER' });
  });

  it('üst sınır dolu → 409; yeni kayıt oturum kullanıcısına yazılır', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'd1' });
    db.customerFavoriteDealer.findUnique.mockResolvedValue(null);
    db.customerFavoriteDealer.count.mockResolvedValueOnce(200);
    const full = await savePUT(req('/api/customer/places/saved/d1', { method: 'PUT' }), params({ dealerId: 'd1' }));
    expect(full.status).toBe(409);

    db.customerFavoriteDealer.count.mockResolvedValueOnce(3);
    db.customerFavoriteDealer.upsert.mockResolvedValue({});
    const ok = await savePUT(req('/api/customer/places/saved/d1', { method: 'PUT' }), params({ dealerId: 'd1' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual({ dealerId: 'd1', saved: true, count: 4 });
    expect(db.customerFavoriteDealer.upsert.mock.calls[0][0].create).toEqual({ userId: 'u1', dealerId: 'd1' });
  });

  it('silme yalnız kendi kaydını siler (IDOR yok)', async () => {
    db.customerFavoriteDealer.deleteMany.mockResolvedValue({ count: 1 });
    db.customerFavoriteDealer.count.mockResolvedValue(0);
    const res = await saveDELETE(req('/api/customer/places/saved/d1', { method: 'DELETE' }), params({ dealerId: 'd1' }));
    expect(res.status).toBe(200);
    expect(db.customerFavoriteDealer.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', dealerId: 'd1' } });
  });

  it('geçersiz kimlik biçimi → 404 (sorguya gitmez)', async () => {
    const res = await savePUT(req('/api/customer/places/saved/..%2Fx', { method: 'PUT' }), params({ dealerId: '../x' }));
    expect(res.status).toBe(404);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('/api/customer/seasonal-event', () => {
  const now = Date.now();
  const campaign = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'Kış Şenliği',
    description: 'Kışa özel',
    type: 'SEASONAL',
    multiplier: 2,
    bonusPoints: 0,
    imageUrl: null,
    conditions: null,
    isActive: true,
    startDate: new Date(now - 10 * DAY),
    endDate: new Date(now + 5 * DAY),
    challengeType: 'games_played',
    challengeGoal: 3,
    challengeRewardPoints: 300,
    challengeRewardBadgeId: null,
    ...over,
  });

  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', level: 3, createdAt: new Date(now - 400 * DAY), birthday: null });
    db.seasonalChallengeClaim.findMany.mockResolvedValue([]);
    db.badge.findMany.mockResolvedValue([]);
    db.miniGameSession.count.mockResolvedValue(3);
  });

  it('GET çoğul + uygunluk: doğum günü kampanyası doğum günü olmayana gösterilmez; eski alanlar korunur', async () => {
    db.seasonalCampaign.findMany.mockResolvedValue([campaign(), campaign({ id: 'bday', type: 'BIRTHDAY', multiplier: 3 })]);
    const res = await eventGET(req('/api/customer/seasonal-event'), params({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.events.map((e: { id: string }) => e.id)).toEqual(['c1']);
    expect(body.data.events[0].challenge).toMatchObject({ current: 3, goal: 3, complete: true, claimed: false, rewardPoints: 300 });
    expect(body.data.events[0].appliesTo).toEqual(['feedback', 'consumption']);
    expect(body.active).toBe(true);
    expect(body.challenge).toMatchObject({ complete: true });
  });

  it('POST: etkinlik dün bitti ama talep süresinde → ödül mintPoints ile, tek-kez anahtarıyla', async () => {
    db.seasonalCampaign.findUnique.mockResolvedValue(campaign({ endDate: new Date(now - 1 * DAY) }));
    db.seasonalChallengeClaim.createMany.mockResolvedValue({ count: 1 });
    mockMint.mockResolvedValue({ credited: 300 });
    const res = await eventPOST(req('/api/customer/seasonal-event', { method: 'POST', body: { campaignId: 'c1' } }), params({}));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ points: 300, campaignId: 'c1' });
    expect(mockMint).toHaveBeenCalledTimes(1);
    expect(mockMint.mock.calls[0][1]).toMatchObject({
      userId: 'u1',
      points: 300,
      xp: 300,
      source: 'seasonal_challenge',
      idempotencyKey: 'seasonal_challenge:c1:u1',
      capCategory: null,
    });
  });

  it('POST: talep süresi geçti → 400; ikinci talep → 409; tamamlanmamış → 400 ve puan yok', async () => {
    db.seasonalCampaign.findUnique.mockResolvedValueOnce(campaign({ endDate: new Date(now - 4 * DAY) }));
    const expired = await eventPOST(req('/api/customer/seasonal-event', { method: 'POST', body: { campaignId: 'c1' } }), params({}));
    expect(expired.status).toBe(400);
    expect((await expired.json()).details).toEqual({ reason: 'CLAIM_EXPIRED' });

    db.seasonalCampaign.findUnique.mockResolvedValueOnce(campaign());
    db.seasonalChallengeClaim.createMany.mockResolvedValueOnce({ count: 0 });
    const dup = await eventPOST(req('/api/customer/seasonal-event', { method: 'POST', body: { campaignId: 'c1' } }), params({}));
    expect(dup.status).toBe(409);

    db.seasonalCampaign.findUnique.mockResolvedValueOnce(campaign());
    db.miniGameSession.count.mockResolvedValueOnce(1);
    const incomplete = await eventPOST(req('/api/customer/seasonal-event', { method: 'POST', body: { campaignId: 'c1' } }), params({}));
    expect(incomplete.status).toBe(400);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('POST gövdesiz (eski istemci) uygun görevli etkinliği hedefler', async () => {
    db.seasonalCampaign.findMany.mockResolvedValue([campaign()]);
    db.seasonalCampaign.findUnique.mockResolvedValue(campaign());
    db.seasonalChallengeClaim.createMany.mockResolvedValue({ count: 1 });
    mockMint.mockResolvedValue({ credited: 300 });
    const res = await eventPOST(req('/api/customer/seasonal-event', { method: 'POST' }), params({}));
    expect(res.status).toBe(200);
    expect(db.seasonalCampaign.findUnique.mock.calls[0][0].where).toEqual({ id: 'c1' });
  });

  it('POST: geçersiz rozet ödülü tüm ödülü düşürmez (rozet atlanır, puan verilir)', async () => {
    db.seasonalCampaign.findUnique.mockResolvedValue(campaign({ challengeRewardBadgeId: 'silinmis' }));
    db.seasonalChallengeClaim.createMany.mockResolvedValue({ count: 1 });
    mockMint.mockResolvedValue({ credited: 300 });
    mockAward.mockResolvedValue({ awarded: false, reason: 'BADGE_NOT_FOUND', badge: null });
    const res = await eventPOST(req('/api/customer/seasonal-event', { method: 'POST', body: { campaignId: 'c1' } }), params({}));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ points: 300, badgeAwarded: false });
  });
});

import { GET as dealsGET } from '@/app/api/customer/places/deals/route';
import { GET as topGET } from '@/app/api/customer/places/top/route';

describe('GET /api/customer/places/deals', () => {
  it('kısa süreli teklifler: yakın + kaydedilen; demo/dolmuş/kişisel churn taslağı yok; kişisel mesajlar', async () => {
    const now = Date.now();
    db.customerFavoriteDealer.findMany.mockResolvedValue([{ dealerId: 'far' }]);
    db.seasonalCampaign.findMany.mockResolvedValue([]);
    db.notification.findMany.mockResolvedValue([
      { id: 'n1', title: 'Sana özel', message: '%10', createdAt: new Date(now - 1000), data: { proposalId: 'p1', dealerId: 'near' }, isRead: false },
    ]);
    db.user.findMany.mockResolvedValue([{ id: 'near', businessName: 'Yakın Kafe' }]);
    const offer = (id: string, dealerId: string, lat: number, extra: Record<string, unknown> = {}) => ({
      id,
      title: `Teklif ${id}`,
      body: 'b',
      offerType: 'PERCENT',
      value: 15,
      validTo: new Date(now + 3600_000),
      maxRedemptions: 50,
      redemptionCount: 0,
      dealer: { id: dealerId, businessName: `Mekan ${dealerId}`, latitude: lat, longitude: 29, isDemo: false, suspendedAt: null, ...extra },
    });
    db.dealerFlashOffer.findMany.mockResolvedValue([
      offer('o1', 'near', 41.001),
      offer('o2', 'far', 45),
      offer('o3', 'other-far', 46),
      offer('o4', 'demo', 41.001, { isDemo: true }),
      { ...offer('o5', 'near', 41.001), redemptionCount: 50 },
    ]);
    const res = await dealsGET(req('/api/customer/places/deals?lat=41&lng=29'), params({}));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.flash.map((f: { id: string }) => f.id).sort()).toEqual(['o1', 'o2']);
    expect(data.located).toBe(true);
    expect(data.personal[0]).toMatchObject({ proposalId: 'p1', dealerId: 'near', venueName: 'Yakın Kafe' });
    expect(db.dealerFlashOffer.findMany.mock.calls[0][0].where.NOT).toEqual({ title: 'Seni özledik 🎁' });
    expect(mockGate).toHaveBeenCalledWith('u1', expect.anything(), 'deals');
  });
});

describe('GET /api/customer/places/top', () => {
  it('güvenilir oy SQL filtresi + Bayes sırası + kategori sayımı', async () => {
    db.$queryRaw.mockImplementation(async (q: unknown) =>
      sqlText(q).includes('DISTINCT ON (dealer_id, user_id)') && !sqlText(q).includes('"customerId" =')
        ? [
            { dealerId: 'small', n: 3, avg: 5 },
            { dealerId: 'big', n: 120, avg: 4.8 },
            { dealerId: 'few', n: 2, avg: 5 },
          ]
        : [],
    );
    db.user.findMany.mockResolvedValue([
      { id: 'small', businessName: 'Küçük', image: null, businessLogo: null, address: null, businessCategory: 'cafe' },
      { id: 'big', businessName: 'Büyük', image: null, businessLogo: null, address: null, businessCategory: 'restaurant' },
    ]);
    db.customerFavoriteDealer.findMany.mockResolvedValue([{ dealerId: 'big', createdAt: new Date() }]);
    const res = await topGET(req('/api/customer/places/top'), params({}));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.entries.map((e: { dealerId: string }) => e.dealerId)).toEqual(['big', 'small']);
    expect(data.entries[0]).toMatchObject({ rank: 1, isSaved: true, reviewers: 120 });
    expect(data.categories).toEqual([
      { slug: 'kahve', rankedCount: 1 },
      { slug: 'restoran', rankedCount: 1 },
    ]);
    const sql = sqlText(db.$queryRaw.mock.calls[0][0]);
    for (const guard of ['"trustFlagged" = false', '"isToxic" = false', 'shadow_ban', '"userId" IS NOT NULL', '"isDemo" = false']) {
      expect(sql).toContain(guard);
    }
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ isDemo: false, role: 'DEALER' });

    const cat = await topGET(req('/api/customer/places/top?category=kahve'), params({}));
    expect((await cat.json()).data.entries.map((e: { dealerId: string }) => e.dealerId)).toEqual(['small']);
  });
});
