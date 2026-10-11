/**
 * Tüketim yorumu yazma ucu (Seslerim çekmecesi).
 *  - POST: kapsam müşteri; puan yalnız mintPoints (tek seferlik anahtar, `feedback` tavanı);
 *    yanıttaki ödül GERÇEK kredi (tavan kısarsa 0 / kısılmış miktar).
 *  - PUT: PATCH semantiği — `text: null` metni ve üslup kategorisini siler; metin aynıysa AI
 *    yeniden çağrılmaz; yanıtlanmış yorum düzenlenince bayiye bildirim.
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
const mockDebit = jest.fn();
const mockLock = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
  debitPoints: (...a: unknown[]) => mockDebit(...a),
  lockUserForUpdate: (...a: unknown[]) => mockLock(...a),
}));
jest.mock('@/lib/ai-engine', () => ({ analyzeWithFallback: jest.fn() }));

const db = {
  consumption: { findFirst: jest.fn() },
  consumptionReview: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  notification: { create: jest.fn() },
  analyticsEvent: { create: jest.fn() },
  pointsLedger: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({
  prisma: { ...db, $transaction: (fn: (t: unknown) => unknown) => fn(db) },
  isPrismaConnectivityError: () => false,
}));

import { POST, PUT } from '@/app/api/customer/consumptions/[id]/review/route';

const CUSTOMER = { session: { user: { id: 'cust-1', role: 'CUSTOMER' } } };
const json = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/customer/consumptions/c1/review', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: 'c1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(CUSTOMER);
  db.notification.create.mockResolvedValue({});
  db.analyticsEvent.create.mockResolvedValue({});
});

describe('POST', () => {
  beforeEach(() => {
    db.consumption.findFirst.mockResolvedValue({ id: 'c1', dealerId: 'd1', product: { name: 'Latte' }, review: null });
    db.consumptionReview.create.mockResolvedValue({ id: 'r1', rating: 5, text: 'Harika', createdAt: new Date() });
  });

  it('başkasının tüketimi 404 (kapsam sorguda)', async () => {
    db.consumption.findFirst.mockResolvedValue(null);
    const res = await POST(json('POST', { rating: 5 }), ctx);
    expect(res.status).toBe(404);
    expect(db.consumption.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', customerId: 'cust-1' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('mintPoints: tek seferlik anahtar + feedback tavanı; yanıt gerçek krediyi taşır', async () => {
    mockMint.mockResolvedValue({ credited: 0, xpCredited: 0, capped: true, isLevelUp: false, level: 3, status: 'posted' });
    const res = await POST(json('POST', { rating: 5, text: 'Harika' }), ctx);
    expect(res.status).toBe(201);
    expect(mockMint).toHaveBeenCalledWith(db, expect.objectContaining({
      userId: 'cust-1', points: 50, xp: 25, source: 'review', sourceId: 'r1',
      idempotencyKey: 'consumption_review:c1', capCategory: 'feedback',
    }));
    const body = await res.json();
    expect(body.data.rewards).toMatchObject({ points: 0, requested: 50, capped: true });
    // Tavan doluyken "+0 puan 🎉" yok: dürüst bildirim.
    expect(db.notification.create.mock.calls[0][0].data.message).toMatch(/puan eklenmedi/);
    expect(mockAfter).toHaveBeenCalled(); // analiz + rozetler after() içinde
  });

  it('puan aralık dışı → 400 (zod), yazım yok', async () => {
    const res = await POST(json('POST', { rating: 9 }), ctx);
    expect(res.status).toBe(400);
    expect(db.consumptionReview.create).not.toHaveBeenCalled();
  });
});

describe('PUT', () => {
  const existing = {
    id: 'r1', rating: 4, text: 'Güzeldi ama biraz soğuktu', characterCategory: 'komedi',
    dealerRepliedAt: new Date(), consumption: { dealerId: 'd1' },
  };
  beforeEach(() => {
    db.consumptionReview.findFirst.mockResolvedValue(existing);
    db.consumptionReview.update.mockImplementation(async (a: { data: Record<string, unknown> }) => ({
      id: 'r1', rating: (a.data.rating as number) ?? 4, text: a.data.text ?? existing.text, dimensions: null, updatedAt: new Date(), dealerRepliedAt: existing.dealerRepliedAt,
    }));
  });

  it('text: null metni ve üslup kategorisini siler; bayiye "güncellendi" bildirimi', async () => {
    const res = await PUT(json('PUT', { text: null }), ctx);
    expect(res.status).toBe(200);
    expect(db.consumptionReview.findFirst.mock.calls[0][0].where).toEqual({ consumptionId: 'c1', customerId: 'cust-1', deletedAt: null });
    expect(db.consumptionReview.update.mock.calls[0][0].data).toEqual({ text: null, characterCategory: null });
    expect(db.notification.create.mock.calls[0][0].data.userId).toBe('d1');
  });

  it('yalnız puan değişti ve metin uzun → AI yeniden çağrılmaz', async () => {
    await PUT(json('PUT', { rating: 2 }), ctx);
    expect(db.consumptionReview.update.mock.calls[0][0].data).toEqual({ rating: 2 });
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('boş gövde 400', async () => {
    const res = await PUT(json('PUT', {}), ctx);
    expect(res.status).toBe(400);
    expect(db.consumptionReview.update).not.toHaveBeenCalled();
  });

  describe('ayrıntılı yorum kısaltılınca ayrıntı ödülü farkı geri alınır (denetim Y5 ek)', () => {
    const longText = 'Kahve çok güzeldi, servis hızlıydı, ortam da sessiz ve rahattı gerçekten.';
    beforeEach(() => {
      db.consumptionReview.findFirst.mockResolvedValue({ ...existing, text: longText, characterCategory: null });
      db.pointsLedger.findUnique.mockResolvedValue({ id: 'led-1', userId: 'cust-1', delta: 100, status: 'posted' });
      mockDebit.mockResolvedValue({ id: 'cust-1', points: 0, xp: 0, level: 1 });
    });

    it('metin eşiğin altına inince fark (100 − 50) tek seferlik anahtarla reversal olarak düşülür', async () => {
      db.user.findUnique.mockResolvedValue({ points: 500 });
      const res = await PUT(json('PUT', { text: 'Kısa' }), ctx);
      expect(res.status).toBe(200);
      expect(db.pointsLedger.findUnique.mock.calls[0][0].where).toEqual({ idempotencyKey: 'consumption_review:c1' });
      expect(mockLock).toHaveBeenCalledWith(db, 'cust-1');
      expect(mockDebit).toHaveBeenCalledWith(db, expect.objectContaining({
        userId: 'cust-1', points: 50, source: 'reversal', idempotencyKey: 'consumption_review_shrink:c1',
      }));
      expect(db.consumptionReview.update).toHaveBeenCalled();
    });

    it('metni silmek (KVKK) engellenmez; bakiye yetmezse bakiye kadar düşülür', async () => {
      db.user.findUnique.mockResolvedValue({ points: 20 });
      const res = await PUT(json('PUT', { text: null }), ctx);
      expect(res.status).toBe(200);
      expect(mockDebit).toHaveBeenCalledWith(db, expect.objectContaining({ points: 20 }));
      expect(db.consumptionReview.update.mock.calls[0][0].data).toMatchObject({ text: null });
    });

    it('ödül zaten temel düzeydeyse (tavan kısmış) geri alma yok', async () => {
      db.pointsLedger.findUnique.mockResolvedValue({ id: 'led-1', userId: 'cust-1', delta: 40, status: 'posted' });
      await PUT(json('PUT', { text: 'Kısa' }), ctx);
      expect(mockDebit).not.toHaveBeenCalled();
    });

    it('metin yine eşiğin üstündeyse geri alma yok', async () => {
      await PUT(json('PUT', { text: longText + ' Ek not.' }), ctx);
      expect(db.pointsLedger.findUnique).not.toHaveBeenCalled();
      expect(mockDebit).not.toHaveBeenCalled();
    });
  });
});
