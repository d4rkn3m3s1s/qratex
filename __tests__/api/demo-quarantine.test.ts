/**
 * P0-27 — demo/bootstrap araçları canlı veriye yazamaz; P0-23 — tüketim yorumu soft delete.
 *
 * Önceki senaryolar:
 *  - "AI verisini başlat" GERÇEK feedback'lere sahte sinyal + aiProcessedAt yazıyordu.
 *  - "Demo sektörünü sil" BÜTÜN bayilerin kategorisini null yapıyordu.
 *  - Fraud demosu GERÇEK müşterileri flagged yapıyor; temizlik 0.70–0.72 skorlu gerçek
 *    bayrakları da aklıyordu.
 *  - İnovasyon demo paketi GERÇEK bayiye müşteriye görünen flash teklif açıyordu.
 *  - Admin tüketim yorumunu hard delete edince müşteri aynı tüketime yeniden puanlı yorum
 *    yazabiliyordu.
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
jest.mock('@/lib/rate-limit', () => ({ checkAdminRateLimit: () => ({ ok: true }) }));
jest.mock('@/lib/innovation-weekly-brief', () => ({
  computeWeeklyBriefForDealer: jest.fn(async () => ({ topThemes: [], recommendedAction: 'x' })),
}));

import { prisma } from '@/lib/prisma';
import type { PrismaMock } from '../helpers/data-safety-prisma-mock';

const db = prisma as unknown as PrismaMock;
const ADMIN = { session: { user: { id: 'admin-1', role: 'ADMIN', email: 'a@x.com', name: 'Yönetici' } } };
const ENV = { ...process.env };

function post(url: string, body: unknown, method = 'POST') {
  return new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function setEnv(nodeEnv: string, flag?: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
  if (flag === undefined) delete process.env.ALLOW_DEMO_SEED;
  else process.env.ALLOW_DEMO_SEED = flag;
}

beforeEach(() => {
  db.__reset();
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue(ADMIN);
});
afterAll(() => {
  process.env = ENV;
});

describe('bootstrap demo kapısı', () => {
  it.each(['synthesize_ai_signals', 'seed_suspicious_activities', 'clear_insights_categories', 'seed_demo_cafes'])(
    'üretimde ALLOW_DEMO_SEED yokken %s → 403, yazım yok',
    async (action) => {
      setEnv('production');
      const { POST } = await import('@/app/api/admin/bootstrap/route');
      const res = await POST(post('http://localhost/api/admin/bootstrap', { action }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('DEMO_SEED_DISABLED');
      expect(db.feedback.updateMany).not.toHaveBeenCalled();
      expect(db.user.updateMany).not.toHaveBeenCalled();
      expect(db.user.create).not.toHaveBeenCalled();
    }
  );

  it('kurulum eylemleri (görev varsayılanları) kapıdan bağımsız çalışır ve audit yazar', async () => {
    setEnv('production');
    db.quest.count.mockResolvedValue(0);
    const { POST } = await import('@/app/api/admin/bootstrap/route');
    const res = await POST(post('http://localhost/api/admin/bootstrap', { action: 'quests_defaults' }));
    expect(res.status).toBe(200);
    expect(db.quest.create).toHaveBeenCalledTimes(3);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'ADMIN_BOOTSTRAP', entityId: 'quests_defaults' });
  });

  it('synthesize_ai_signals yalnız demo bayilerin geri bildirimlerini hedefler', async () => {
    setEnv('production', 'true');
    db.feedback.findMany.mockResolvedValue([{ id: 'f-1', rating: 2, sentiment: null }]);
    db.feedback.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/bootstrap/route');
    const res = await POST(post('http://localhost/api/admin/bootstrap', { action: 'synthesize_ai_signals' }));
    expect(res.status).toBe(200);
    expect(db.feedback.findMany.mock.calls[0][0].where).toMatchObject({ qrCode: { dealer: { isDemo: true } }, deletedAt: null });
    expect(db.feedback.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'f-1', aiProcessedAt: null, qrCode: { dealer: { isDemo: true } } });
    // Gerçek feedback'e tekil update yolu yok.
    expect(db.feedback.update).not.toHaveBeenCalled();
  });

  it('clear_insights_categories yalnız demo- önekli kategorileri temizler', async () => {
    setEnv('development');
    db.user.updateMany.mockResolvedValue({ count: 2 });
    const { POST } = await import('@/app/api/admin/bootstrap/route');
    await POST(post('http://localhost/api/admin/bootstrap', { action: 'clear_insights_categories' }));
    expect(db.user.updateMany.mock.calls[0][0].where).toEqual({ role: 'DEALER', businessCategory: { startsWith: 'demo-' } });
  });

  it('fraud demosu temizliği gerçek bayrakları aklamaz (yalnız izlenen + tam 0.71)', async () => {
    setEnv('development');
    db.settings.findUnique.mockResolvedValue({ value: { suspiciousFlaggedUserIds: ['demo-customer-1'], suspiciousIds: [], insightsDealerIds: [], aiQualitySampleIds: [] } });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/bootstrap/route');
    await POST(post('http://localhost/api/admin/bootstrap', { action: 'clear_suspicious_activities' }));
    expect(db.user.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ['demo-customer-1'] }, fraudStatus: 'flagged', fraudScore: 0.71,
    });
  });

  it('dryRun hiçbir şey yazmaz', async () => {
    setEnv('development');
    db.user.findMany.mockResolvedValue([{ id: 'demo-dealer-aroma' }]);
    const { POST } = await import('@/app/api/admin/bootstrap/route');
    const res = await POST(post('http://localhost/api/admin/bootstrap', { action: 'seed_insights_categories', dryRun: true }));
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.wouldUpdate).toBe(1);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('inovasyon demo paketi', () => {
  it('gerçek (isDemo=false) bayiye yazmaz: 409 DEMO_TARGET_REQUIRED', async () => {
    setEnv('development');
    db.user.findFirst.mockResolvedValue({ id: 'real-1', latitude: 41, longitude: 29, isDemo: false });
    const { POST } = await import('@/app/api/admin/innovation/demo-package/route');
    const res = await POST(post('http://localhost/api/admin/innovation/demo-package', { dealerId: 'real-1' }));
    expect(res.status).toBe(409);
    expect(db.dealerFlashOffer.create).not.toHaveBeenCalled();
  });

  it('üretimde kapı kapalıyken 403', async () => {
    setEnv('production');
    const { POST } = await import('@/app/api/admin/innovation/demo-package/route');
    const res = await POST(post('http://localhost/api/admin/innovation/demo-package', { dealerId: 'demo-dealer-aroma' }));
    expect(res.status).toBe(403);
  });

  it('senaryo metni seed olmadan döner; runSeed gerçek bayide 409', async () => {
    setEnv('development');
    db.user.findFirst.mockResolvedValue({ id: 'real-1', latitude: null, longitude: null, isDemo: false });
    const { POST } = await import('@/app/api/admin/innovation/demo-scenario/route');
    const r1 = await POST(post('http://localhost/api/admin/innovation/demo-scenario', { dealerId: 'real-1' }));
    expect(r1.status).toBe(200);
    const r2 = await POST(post('http://localhost/api/admin/innovation/demo-scenario', { dealerId: 'real-1', runSeed: true }));
    expect(r2.status).toBe(409);
    expect(db.dealerFlashOffer.create).not.toHaveBeenCalled();
  });

  it('demo bayide paket tek transaction içinde yazılır', async () => {
    setEnv('development');
    db.user.findFirst.mockResolvedValue({ id: 'demo-dealer-aroma', latitude: 41, longitude: 29, isDemo: true });
    const { POST } = await import('@/app/api/admin/innovation/demo-package/route');
    const res = await POST(post('http://localhost/api/admin/innovation/demo-package', { dealerId: 'demo-dealer-aroma' }));
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.dealerFlashOffer.create).toHaveBeenCalledTimes(1);
  });
});

describe('tüketim yorumu moderasyonu soft delete (P0-23)', () => {
  it('consumption tipinde deleteMany yok; deletedAt yazılır ve audit tx içinde', async () => {
    db.consumptionReview.updateMany.mockResolvedValue({ count: 2 });
    const { DELETE } = await import('@/app/api/admin/feedbacks/route');
    const res = await DELETE(post('http://localhost/api/admin/feedbacks', { feedbackIds: ['r1', 'r2'], type: 'consumption' }, 'DELETE'));
    expect(res.status).toBe(200);
    expect(db.consumptionReview.deleteMany).not.toHaveBeenCalled();
    const call = db.consumptionReview.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: { in: ['r1', 'r2'] }, deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('SOFT_DELETE_CONSUMPTION_REVIEWS');
    expect((await res.json()).deleted).toBe(2);
  });

  it('geri alma tüketim yorumunu da geri getirir', async () => {
    db.consumptionReview.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/feedbacks/restore/route');
    const res = await POST(post('http://localhost/api/admin/feedbacks/restore', { feedbackIds: ['r1'], type: 'consumption' }));
    expect(res.status).toBe(200);
    expect(db.consumptionReview.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['r1'] }, deletedAt: { not: null } }, data: { deletedAt: null } });
    expect(db.feedback.updateMany).not.toHaveBeenCalled();
  });

  it('admin listesi soft-delete edilmiş tüketim yorumlarını göstermez', async () => {
    const { GET } = await import('@/app/api/admin/feedbacks/route');
    await GET(new NextRequest('http://localhost/api/admin/feedbacks?type=consumption'));
    expect(db.consumptionReview.findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
  });
});
