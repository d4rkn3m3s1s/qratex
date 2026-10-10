/**
 * Tüketim yorumu — oyunlaştırma kötüye kullanımı regresyonları (güvenlik incelemesi).
 *
 *  1. Karakter rozeti "geri dönüşüm": PUT `text:null` kategoriyi temizliyor, ardından yeni
 *     üslupta metin yazılınca yorum YENİDEN sınıflandırılıyordu → aynı 6 yorum kategoriden
 *     kategoriye taşınıp her kategorinin karakterini (ve rozet ödül puanını) açtırıyordu.
 *     Artık bir yorum en fazla BİR kez sınıflandırılır (işaret olayı; silmede aynı tx'te yazılır).
 *  2. Defter anahtarı daha önce işlenmiş POST (duplicate mint) "X puan kazandın" demez.
 *  3. Karakter barı moderasyonla kaldırılmış / metni silinmiş yorumu saymaz.
 */
import { NextRequest } from 'next/server';

const mockAfter = jest.fn();
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (fn: () => unknown) => mockAfter(fn) };
});
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 10 })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn(async () => ({ key: null, cached: false })),
  storeIdempotency: jest.fn(async () => undefined),
}));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({
    consumptionReview: { longTextThreshold: 50, base: { points: 50, xp: 25 }, detailed: { points: 100, xp: 50 } },
  })),
  getConsumptionReviewReward: (text: string | null) =>
    text && text.trim().length >= 50 ? { points: 100, xp: 50 } : { points: 50, xp: 25 },
}));
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));
jest.mock('@/lib/ai-engine', () => ({
  analyzeWithFallback: jest.fn(async () => ({ sentiment: { label: 'positive' }, churnRisk: null })),
}));
const mockClassify = jest.fn();
jest.mock('@/lib/character-badges', () => ({
  processConsumptionReviewForCharacterBadge: (...a: unknown[]) => mockClassify(...a),
}));
jest.mock('@/lib/surprise-badges', () => ({ awardEligibleSurpriseBadges: jest.fn(async () => undefined) }));
jest.mock('@/lib/activity-badges', () => ({ awardActivityBadges: jest.fn(async () => undefined) }));
jest.mock('@/lib/referral', () => ({ maybeQualifyReferral: jest.fn(async () => undefined) }));

const mockTransaction = jest.fn();
const db = {
  consumption: { findFirst: jest.fn() },
  consumptionReview: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  notification: { create: jest.fn() },
  analyticsEvent: { create: jest.fn(), findFirst: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (t: unknown) => unknown) => {
      mockTransaction();
      return fn(db);
    },
  },
  isPrismaConnectivityError: () => false,
}));

import { POST, PUT } from '@/app/api/customer/consumptions/[id]/review/route';

/** Route dosyası yalnız HTTP fiillerini dışa verebilir (Next.js) → işaret adı burada sabit. */
const CHARACTER_MARK_EVENT = 'consumption_review_character_classified';

const CUSTOMER = { session: { user: { id: 'cust-1', role: 'CUSTOMER' } } };
const json = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/customer/consumptions/c1/review', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: 'c1' }) };

/** after() ile ertelenen işleri çalıştırır (serverless'ta yanıt sonrası). */
async function runAfter() {
  for (const [fn] of mockAfter.mock.calls) await (fn as () => Promise<unknown>)();
}
const markerCreates = () =>
  db.analyticsEvent.create.mock.calls.filter((c) => c[0]?.data?.event === CHARACTER_MARK_EVENT);

const NEW_STYLE_TEXT = 'Bu sefer bambaşka bir üslupla, uzun ve özenli bir yorum yazıyorum.';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(CUSTOMER);
  db.notification.create.mockResolvedValue({});
  db.analyticsEvent.create.mockResolvedValue({});
  db.analyticsEvent.findFirst.mockResolvedValue(null);
  mockClassify.mockResolvedValue(undefined);
  db.consumptionReview.update.mockImplementation(async (a: { data: Record<string, unknown> }) => ({
    id: 'r1', rating: 4, text: a.data?.text ?? null, dimensions: null, updatedAt: new Date(), dealerRepliedAt: null,
  }));
});

describe('PUT — karakter rozeti geri dönüşümü kapalı', () => {
  const classified = {
    id: 'r1', rating: 4, text: 'Kahve fena değildi ama biraz soğuktu', characterCategory: 'komedi',
    dealerRepliedAt: null, consumption: { dealerId: 'd1' },
  };
  const cleared = { ...classified, text: null, characterCategory: null };

  it('sınıflandırılmış yorumun metni silinince "işlendi" işareti kategori temizliğiyle AYNI tx\'te yazılır', async () => {
    db.consumptionReview.findFirst.mockResolvedValue(classified);
    const res = await PUT(json('PUT', { text: null }), ctx);
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(markerCreates()).toHaveLength(1);
    expect(markerCreates()[0][0].data).toMatchObject({ userId: 'cust-1', data: { reviewId: 'r1', reason: 'text_deleted' } });
    expect(db.consumptionReview.update.mock.calls[0][0].data).toEqual({ text: null, characterCategory: null });
  });

  it('SALDIRI: sil → yeni üslupta yeniden yaz → yorum İKİNCİ kez sınıflandırılmaz', async () => {
    db.consumptionReview.findFirst.mockResolvedValue(cleared);
    db.analyticsEvent.findFirst.mockResolvedValue({ id: 'mark-1' }); // daha önce sınıflandırılmış
    const res = await PUT(json('PUT', { text: NEW_STYLE_TEXT }), ctx);
    expect(res.status).toBe(200);
    await runAfter();
    expect(mockClassify).not.toHaveBeenCalled();
    expect(markerCreates()).toHaveLength(0);
    // İşaret sorgusu bu kullanıcının bu yorumuna kapsamlı.
    expect(db.analyticsEvent.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'cust-1', event: CHARACTER_MARK_EVENT, data: { path: ['reviewId'], equals: 'r1' },
    });
  });

  it('meşru akış: hiç sınıflandırılmamış (puan-yalnız) yoruma metin eklenince BİR kez sınıflandırılır', async () => {
    db.consumptionReview.findFirst.mockResolvedValue(cleared);
    db.analyticsEvent.findFirst.mockResolvedValue(null);
    await PUT(json('PUT', { text: NEW_STYLE_TEXT }), ctx);
    await runAfter();
    expect(markerCreates()).toHaveLength(1);
    expect(markerCreates()[0][0].data.data).toEqual({ reviewId: 'r1', reason: 'edit' });
    expect(mockClassify).toHaveBeenCalledTimes(1);
    expect(mockClassify).toHaveBeenCalledWith('cust-1', 'r1', NEW_STYLE_TEXT);
  });

  it('fail-closed: işaret okunamazsa sınıflandırma yok', async () => {
    db.consumptionReview.findFirst.mockResolvedValue(cleared);
    db.analyticsEvent.findFirst.mockRejectedValue(new Error('db down'));
    const res = await PUT(json('PUT', { text: NEW_STYLE_TEXT }), ctx);
    expect(res.status).toBe(200);
    await runAfter();
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it('fail-closed: işaret yazılamazsa sınıflandırma yok', async () => {
    db.consumptionReview.findFirst.mockResolvedValue(cleared);
    db.analyticsEvent.create.mockRejectedValue(new Error('db down'));
    const res = await PUT(json('PUT', { text: NEW_STYLE_TEXT }), ctx);
    expect(res.status).toBe(200);
    await runAfter();
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it('kategorisi olan yorumda metin değişikliği yeniden sınıflandırmaz (işaret sorgusu bile yok)', async () => {
    db.consumptionReview.findFirst.mockResolvedValue(classified);
    await PUT(json('PUT', { text: NEW_STYLE_TEXT }), ctx);
    await runAfter();
    expect(mockClassify).not.toHaveBeenCalled();
    expect(db.analyticsEvent.findFirst).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled(); // kategori temizlenmiyor → işaret tx'i yok
  });
});

describe('POST — ilk sınıflandırma işaretlenir; duplicate mint sahte "kazandın" demez', () => {
  beforeEach(() => {
    db.consumption.findFirst.mockResolvedValue({ id: 'c1', dealerId: 'd1', product: { name: 'Latte' }, review: null });
    db.consumptionReview.create.mockResolvedValue({ id: 'r1', rating: 5, text: NEW_STYLE_TEXT, createdAt: new Date() });
  });

  it('metinli yorum: "create" işareti yazılır ve sınıflandırma bir kez planlanır', async () => {
    mockMint.mockResolvedValue({ credited: 100, xpCredited: 50, capped: false, isLevelUp: false, level: 2, status: 'posted', duplicate: false });
    const res = await POST(json('POST', { rating: 5, text: NEW_STYLE_TEXT }), ctx);
    expect(res.status).toBe(201);
    expect(markerCreates()).toHaveLength(1);
    expect(markerCreates()[0][0].data.data).toEqual({ reviewId: 'r1', reason: 'create' });
    await runAfter();
    expect(mockClassify).toHaveBeenCalledTimes(1);
  });

  it('kısa/boş metin: işaret yok, sınıflandırma yok (sonradan metin eklenebilir)', async () => {
    mockMint.mockResolvedValue({ credited: 50, xpCredited: 25, capped: false, isLevelUp: false, level: 2, status: 'posted', duplicate: false });
    await POST(json('POST', { rating: 5 }), ctx);
    await runAfter();
    expect(markerCreates()).toHaveLength(0);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it('defter anahtarı zaten işlenmiş (duplicate): yanıt ve bildirim 0 puan, seviye kutlaması yok', async () => {
    mockMint.mockResolvedValue({ credited: 100, xpCredited: 50, capped: false, isLevelUp: true, level: 3, status: 'posted', duplicate: true });
    const res = await POST(json('POST', { rating: 5, text: NEW_STYLE_TEXT }), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.rewards).toMatchObject({ points: 0, xp: 0, leveledUp: false });
    const note = db.notification.create.mock.calls[0][0].data;
    expect(note.message).not.toMatch(/kazandın/);
    expect(note.data).toMatchObject({ pointsEarned: 0, xpEarned: 0, leveledUp: false });
  });
});
