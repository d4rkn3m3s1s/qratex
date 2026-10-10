/**
 * P0-23 — tüketim yorumu moderasyonu SOFT DELETE + tekrar kredi koruması.
 *
 * Önceki saldırı: müşteri tüketime puanlı yorum yazar → admin moderasyonla yorumu siler
 * (`consumptionReview.deleteMany`, satır yok olur, `consumptionId @unique` serbest kalır) →
 * müşteri aynı tüketime yeniden yorum yazıp İKİNCİ kez puan alır (döngü = sınırsız kredi).
 *
 * Şimdi: silme `deletedAt` yazar, satır kalır → yeni yorum reddedilir, kredi yazılmaz.
 * Moderasyonla kaldırılan yorum bayinin listesinde ve istatistiğinde görünmez.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  prisma: require('../helpers/data-safety-prisma-mock').createPrismaMock(),
  isPrismaConnectivityError: () => false,
}));
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
jest.mock('@/lib/rate-limit', () => ({
  checkAdminRateLimit: () => ({ ok: true }),
  checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 10 })),
}));
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));
const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn(async () => ({ key: null, cached: false })),
  storeIdempotency: jest.fn(async () => undefined),
}));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getConsumptionReviewReward: jest.fn(() => ({ points: 25, xp: 10 })),
}));
const mockCredit = jest.fn(async () => ({ points: 25, xp: 10, leveledUp: false }));
jest.mock('@/lib/points-wallet', () => ({ creditPointsAndXp: (...a: unknown[]) => mockCredit(...(a as [])) }));
jest.mock('@/lib/points-caps', () => ({ capFeedbackPoints: jest.fn(async (_u: string, p: number) => p) }));
jest.mock('@/lib/ai-engine', () => ({ analyzeWithFallback: jest.fn() }));

import { prisma } from '@/lib/prisma';
import type { PrismaMock } from '../helpers/data-safety-prisma-mock';

const db = prisma as unknown as PrismaMock;
const ADMIN = { session: { user: { id: 'admin-1', role: 'ADMIN', email: 'a@x.com', name: 'Yönetici' } } };

function json(url: string, body: unknown, method = 'POST') {
  return new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  db.__reset();
  mockRequireAuth.mockReset();
  mockCredit.mockClear();
  mockGetServerSession.mockReset();
});

describe('P0-23 tekrar kredi döngüsü', () => {
  it('SALDIRI: moderasyonla silinen yorumun tüketimine yeniden puanlı yorum yazılamaz', async () => {
    // 1) Admin yorumu siler → soft delete (satır kalır).
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.consumptionReview.updateMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/admin/feedbacks/route');
    const del = await DELETE(json('http://localhost/api/admin/feedbacks', { feedbackIds: ['rev-1'], type: 'consumption' }, 'DELETE'));
    expect(del.status).toBe(200);
    expect(db.consumptionReview.deleteMany).not.toHaveBeenCalled();
    expect(db.consumptionReview.delete).not.toHaveBeenCalled();

    // 2) Müşteri aynı tüketime yeniden yorum yazmayı dener: soft-delete edilmiş satır hâlâ bağlı.
    //    (Seslerim yazma ucu defineRoute + mintPoints: çakışma 409 CONFLICT, kredi yok.)
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'cust-1', role: 'CUSTOMER' } } });
    db.consumption.findFirst.mockResolvedValue({
      id: 'cons-1',
      dealerId: 'dealer-1',
      review: { id: 'rev-1' },
      product: null,
    });
    const { POST } = await import('@/app/api/customer/consumptions/[id]/review/route');
    const res = await POST(json('http://localhost/api/customer/consumptions/cons-1/review', { rating: 5, text: 'Yine harikaydı' }), {
      params: Promise.resolve({ id: 'cons-1' }),
    });
    expect(res.status).toBe(409);
    expect(db.consumption.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'cons-1', customerId: 'cust-1' });
    expect(db.consumptionReview.create).not.toHaveBeenCalled();
    expect(mockCredit).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('geri alma bozuk gövdede 400 döner (500 değil) ve yazmaz', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    const { POST } = await import('@/app/api/admin/feedbacks/restore/route');
    const res = await POST(
      new NextRequest('http://localhost/api/admin/feedbacks/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bozuk',
      })
    );
    expect(res.status).toBe(400);
    expect(db.consumptionReview.updateMany).not.toHaveBeenCalled();
    expect(db.feedback.updateMany).not.toHaveBeenCalled();
  });

  it('geri alma denetim satırı aktör anlık görüntüsüyle ve yazımla aynı tx içinde', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.consumptionReview.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/feedbacks/restore/route');
    const res = await POST(json('http://localhost/api/admin/feedbacks/restore', { feedbackIds: ['rev-1'], type: 'consumption' }));
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'RESTORE_CONSUMPTION_REVIEWS', entity: 'ConsumptionReview', userId: 'admin-1' });
    expect(audit.actorSnapshot).toMatchObject({ email: 'a@x.com', role: 'ADMIN' });
  });
});

describe('P0-23 görünürlük', () => {
  it('bayi gelen kutusu listesi ve özeti soft-delete edilmiş yorumları dışlar', async () => {
    db.consumptionReview.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    db.feedback.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    const { listInbox, getInboxSummary } = await import('@/lib/dealer-inbox/server');
    const { normalizeInboxFilters } = await import('@/lib/dealer-inbox/core');
    await listInbox('dealer-1', 'dealer-1', normalizeInboxFilters({ status: 'all' }));
    expect(JSON.stringify(db.consumptionReview.findMany.mock.calls[0][0].where)).toContain('"deletedAt":null');
    expect(JSON.stringify(db.feedback.findMany.mock.calls[0][0].where)).toContain('"deletedAt":null');
    await getInboxSummary('dealer-1', { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') });
    expect(JSON.stringify(db.consumptionReview.groupBy.mock.calls[0][0].where)).toContain('"deletedAt":null');
    expect(JSON.stringify(db.consumptionReview.aggregate.mock.calls[0][0].where)).toContain('"deletedAt":null');
  });
});
