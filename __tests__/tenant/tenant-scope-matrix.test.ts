/**
 * Rol × kapsam matrisi — kiracı uçları (P0-05, P0-06, P0-12).
 *
 * Her uç × {oturumsuz, CUSTOMER, DEALER (sahip / sahip değil), STAFF (aktif / pasif), ADMIN
 * (platform / açık bayi), tanınmayan rol}. Saldırı senaryoları:
 *  - STAFF hesabı, JWT'sindeki dealerId ne olursa olsun yalnız DB'deki AKTİF bayisini görür.
 *  - Eski AI uçları (/api/ai/*, /api/customer/ai-*) emekli: her rol 410, okuma/yazma/LLM yok
 *    (eskiden müşteri kendi yorumunun AI alanlarını yazdırabiliyor, STAFF profil zehirleyebiliyordu).
 *  - Bayi müşteri listesi platform geneli CLV'yi DEĞİL, bayi kapsamlı istatistiği okur.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async () => null),
  redisSetJson: jest.fn(async () => undefined),
  redisIncrWithTtl: jest.fn(async () => null),
}));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 10 })),
  checkFeedbackPerQrRateLimit: jest.fn(async () => ({ ok: true })),
  getClientIdentifier: () => '203.0.113.7',
}));
jest.mock('@/lib/ai-engine', () => ({
  analyzeWithFallback: jest.fn(),
  analyzeComprehensive: jest.fn(),
}));
jest.mock('@/lib/ai-learning', () => ({
  recordFeedbackCorrection: jest.fn(async () => ({ id: 'corr-1' })),
  updateAdaptiveProfile: jest.fn(async () => ({ ok: true })),
  getLearningRetrainSuggestion: jest.fn(async () => null),
  formatAdaptiveProfile: jest.fn(),
  getAdaptiveProfileForDealer: jest.fn(),
  maybeTriggerAdaptiveUpdate: jest.fn(),
  storeFeedbackEmbedding: jest.fn(),
}));

import { db, resetDb } from '../helpers/prisma-proxy';
import { as, setSession } from '../helpers/session-mock';
import { analyzeWithFallback } from '@/lib/ai-engine';
import { recordFeedbackCorrection } from '@/lib/ai-learning';

const ADMIN = as('admin-1', 'ADMIN');
const DEALER_A = as('dealer-a', 'DEALER');
const DEALER_B = as('dealer-b', 'DEALER');
/** JWT'si yanlışlıkla/bayat olarak B'yi gösteren, DB'de A'ya bağlı personel. */
const STAFF_A = as('staff-1', 'STAFF', { dealerId: 'dealer-b' });
const CUSTOMER = as('cust-1', 'CUSTOMER');
const WEIRD = as('x-1', 'SUPERUSER');

function staffLink(dealerId: string | null) {
  db.dealerStaff.findFirst.mockResolvedValue(dealerId ? { dealerId } : null);
}

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined
      ? { body: JSON.stringify(init.body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  });
}

const ANALYSIS = {
  sentiment: { label: 'positive', score: 0.9 },
  emotions: [],
  topics: [],
  toxicity: { isToxic: false },
  intent: null,
  modelUsed: 'test-model',
  version: '1',
};

beforeEach(() => {
  resetDb();
  setSession(null);
  db.user.findUnique.mockResolvedValue({ role: 'DEALER' });
  (analyzeWithFallback as jest.Mock).mockReset().mockResolvedValue(ANALYSIS);
  (recordFeedbackCorrection as jest.Mock).mockClear();
});

// ───────────────────────────── GET /api/feedbacks ─────────────────────────────

describe('GET /api/feedbacks — kapsam matrisi', () => {
  async function call(session: unknown, query = '') {
    setSession(session);
    db.feedback.findMany.mockResolvedValue([]);
    db.feedback.count.mockResolvedValue(0);
    const { GET } = await import('@/app/api/feedbacks/route');
    return GET(req(`/api/feedbacks${query}`));
  }
  const lastWhere = () => db.feedback.findMany.mock.calls.at(-1)?.[0]?.where;
  const lastSelect = () => db.feedback.findMany.mock.calls.at(-1)?.[0]?.select;

  it('oturumsuz → 401', async () => {
    expect((await call(null)).status).toBe(401);
    expect(db.feedback.findMany).not.toHaveBeenCalled();
  });

  it('tanınmayan rol → 403', async () => {
    expect((await call(WEIRD)).status).toBe(403);
  });

  it('CUSTOMER → yalnız kendi yorumları, e-posta seçilmez', async () => {
    expect((await call(CUSTOMER)).status).toBe(200);
    expect(lastWhere()).toMatchObject({ userId: 'cust-1', deletedAt: null });
    expect(lastWhere().qrCode).toBeUndefined();
    expect(lastSelect().user.select.email).toBe(false);
  });

  it('DEALER → kendi bayisi; başka bayiyi istemek 403', async () => {
    expect((await call(DEALER_A)).status).toBe(200);
    expect(lastWhere()).toMatchObject({ qrCode: { dealerId: 'dealer-a' } });
    expect((await call(DEALER_A, '?dealerId=dealer-b')).status).toBe(403);
  });

  it('STAFF → DB’deki AKTİF bayi (JWT dealerId yok sayılır); e-posta yok', async () => {
    staffLink('dealer-a');
    expect((await call(STAFF_A)).status).toBe(200);
    expect(lastWhere()).toMatchObject({ qrCode: { dealerId: 'dealer-a' } });
    expect(lastSelect().user.select.email).toBe(false);
  });

  it('STAFF pasif / bağsız → 403, sorgu yok (eski kod ADMIN gibi her şeyi döndürüyordu)', async () => {
    staffLink(null);
    const res = await call(STAFF_A);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('STAFF_INACTIVE');
    expect(db.feedback.findMany).not.toHaveBeenCalled();
  });

  it('ADMIN → platform geneli (filtre yok) ya da açık ?dealerId', async () => {
    expect((await call(ADMIN)).status).toBe(200);
    expect(lastWhere().qrCode).toBeUndefined();
    expect(lastSelect().user.select.email).toBe(true);
    expect((await call(ADMIN, '?dealerId=dealer-b')).status).toBe(200);
    expect(lastWhere()).toMatchObject({ qrCode: { dealerId: 'dealer-b' } });
  });
});

// ───────────────────────────── Emekli AI uçları (ai-ozellikleri Dalga 3) ─────────────────────────────

/**
 * Eski /api/ai/{analyze,detailed,learning} ve /api/customer/{ai-chat,ai-recommendations} hiçbir
 * ekrandan çağrılmıyordu; kapsam/IDOR/profil zehirleme matrisleri bu uçlarda artık geçerli değil
 * çünkü uçlar KAPALI: her rol için 410, hiçbir veritabanı okuması ya da LLM çağrısı yok.
 */
describe('Emekli AI uçları — her rol 410, yan etkisiz', () => {
  const RETIRED: Array<{ path: string; method: 'GET' | 'POST'; load: () => Promise<Record<string, unknown>> }> = [
    { path: '/api/ai/detailed', method: 'GET', load: () => import('@/app/api/ai/detailed/route') },
    { path: '/api/ai/analyze?action=analyze', method: 'POST', load: () => import('@/app/api/ai/analyze/route') },
    { path: '/api/ai/analyze?action=update_settings', method: 'POST', load: () => import('@/app/api/ai/analyze/route') },
    { path: '/api/ai/learning?action=record_correction', method: 'POST', load: () => import('@/app/api/ai/learning/route') },
    { path: '/api/customer/ai-chat', method: 'POST', load: () => import('@/app/api/customer/ai-chat/route') },
    { path: '/api/customer/ai-recommendations', method: 'GET', load: () => import('@/app/api/customer/ai-recommendations/route') },
  ];

  for (const r of RETIRED) {
    it(`${r.method} ${r.path} → 410 (oturumsuz, CUSTOMER, DEALER, STAFF, ADMIN)`, async () => {
      const mod = await r.load();
      const handler = mod[r.method] as (req: NextRequest) => Promise<Response>;
      for (const session of [null, CUSTOMER, DEALER_A, STAFF_A, ADMIN]) {
        setSession(session);
        const res = await handler(
          req(r.path, r.method === 'POST' ? { method: 'POST', body: { feedbackId: 'fb-b', text: 'harika bir deneyim' } } : undefined)
        );
        expect(res.status).toBe(410);
        expect((await res.json()).code).toBe('GONE');
      }
      expect(db.feedback.findFirst).not.toHaveBeenCalled();
      expect(db.feedback.findMany).not.toHaveBeenCalled();
      expect(db.feedback.update).not.toHaveBeenCalled();
      expect(analyzeWithFallback).not.toHaveBeenCalled();
      expect(recordFeedbackCorrection).not.toHaveBeenCalled();
    });
  }
});


// ───────────────────────────── Bayi müşteri listesi (P0-12) ─────────────────────────────

describe('GET /api/dealer/customers — bayi kapsamlı istatistik (P0-12)', () => {
  async function call(session: unknown, query = '') {
    setSession(session);
    const { GET } = await import('@/app/api/dealer/customers/route');
    return GET(req(`/api/dealer/customers${query}`));
  }

  it('platform geneli CLV OKUNMAZ; STAFF aktif bayisinin satırlarını görür, e-posta maskeli, güven skoru yok', async () => {
    staffLink('dealer-a');
    db.dealerCustomerStats.findMany.mockResolvedValue([
      {
        dealerId: 'dealer-a',
        customerId: 'cust-1',
        totalSpend: 120.5,
        visitCount: 3,
        avgOrderValue: 40.17,
        reviewCount: 1,
        avgRating: 4,
        firstVisitAt: new Date('2026-09-01'),
        lastVisitAt: new Date('2026-10-01'),
        churnRisk: 0.2,
        segmentKey: 'new',
        calculatedAt: new Date('2026-10-08'),
      },
    ]);
    db.dealerCustomerStats.count.mockResolvedValue(1);
    db.user.findMany.mockResolvedValue([
      { id: 'cust-1', name: 'Ayşe Yılmaz', email: 'ayse.yilmaz@ornek.com', image: null, trustTier: 'watch' },
    ]);
    const res = await call(STAFF_A);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(db.dealerCustomerStats.findMany.mock.calls[0][0].where).toEqual({ dealerId: 'dealer-a' });
    expect(db.customerLifetimeValue.findMany).not.toHaveBeenCalled();
    const c = data.customers[0];
    expect(c.totalSpent).toBe(120.5);
    expect(c.email).not.toContain('ayse.yilmaz');
    expect(c.trustScore).toBeNull();
    expect(c.trustTier).toBeNull();
    expect(c.ref).not.toContain('cust-1');
    expect(JSON.stringify(data)).not.toContain('cust-1');
  });

  it('kalıcı satır yoksa canlı hesap YALNIZ bu bayinin tüketimlerinden', async () => {
    db.dealerCustomerStats.findMany.mockResolvedValue([]);
    db.dealerCustomerStats.count.mockResolvedValue(0);
    db.consumption.groupBy.mockResolvedValue([]);
    db.feedback.groupBy.mockResolvedValue([]);
    db.consumptionReview.groupBy.mockResolvedValue([]);
    const res = await call(DEALER_A);
    expect(res.status).toBe(200);
    for (const [args] of db.consumption.groupBy.mock.calls) {
      expect(args.where).toMatchObject({ dealerId: 'dealer-a' });
    }
    expect(db.customerLifetimeValue.findMany).not.toHaveBeenCalled();
  });

  it('CUSTOMER → 403; pasif STAFF → 403; ADMIN bayi seçmeden → 400', async () => {
    expect((await call(CUSTOMER)).status).toBe(403);
    staffLink(null);
    expect((await call(STAFF_A)).status).toBe(403);
    expect((await call(ADMIN)).status).toBe(400);
  });
});

describe('GET /api/dealer/segment-actions — bayi kapsamlı segment (P0-12)', () => {
  it('segmentler DealerCustomerStats’tan, platform CLV’si okunmaz', async () => {
    setSession(DEALER_A);
    db.dealerCustomerStats.findMany.mockResolvedValue([
      { totalSpend: 6000, churnRisk: 0.1, segmentKey: 'vip' },
      { totalSpend: 50, churnRisk: 0.8, segmentKey: 'at_risk' },
    ]);
    const { GET } = await import('@/app/api/dealer/segment-actions/route');
    const res = await GET(req('/api/dealer/segment-actions'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalCustomers).toBe(2);
    expect(db.dealerCustomerStats.findMany.mock.calls[0][0].where).toEqual({ dealerId: 'dealer-a' });
    expect(db.customerLifetimeValue.findMany).not.toHaveBeenCalled();
    const names = data.segments.map((s: { name: string }) => s.name);
    expect(names).toEqual(expect.arrayContaining(['VIP', 'Risk Altında']));
  });
});
