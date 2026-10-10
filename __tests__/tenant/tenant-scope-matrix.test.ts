/**
 * Rol × kapsam matrisi — kiracı uçları (P0-05, P0-06, P0-12).
 *
 * Her uç × {oturumsuz, CUSTOMER, DEALER (sahip / sahip değil), STAFF (aktif / pasif), ADMIN
 * (platform / açık bayi), tanınmayan rol}. Saldırı senaryoları:
 *  - STAFF hesabı, JWT'sindeki dealerId ne olursa olsun yalnız DB'deki AKTİF bayisini görür.
 *  - Müşteri `/api/ai/analyze` ile kendi yorumunun AI alanlarını yazdıramaz (P0-06).
 *  - Bayi başka bayinin yorumunu analiz edip üzerine yazamaz; metin istemciden alınmaz.
 *  - STAFF başka bayinin AI öğrenme profilini zehirleyemez.
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
  analyzeBulk: jest.fn(async () => new Map()),
  clusterThemes: jest.fn(async () => []),
  generateInsightReport: jest.fn(async () => null),
  askAI: jest.fn(async () => 'cevap'),
  getRecentUsageLogs: jest.fn(() => []),
}));
jest.mock('@/lib/openai', () => ({
  generateInsights: jest.fn(async () => null),
  chatWithAI: jest.fn(async () => 'ok'),
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

// ───────────────────────────── GET /api/ai/detailed ─────────────────────────────

describe('GET /api/ai/detailed — kapsam matrisi', () => {
  async function call(session: unknown, query = '') {
    setSession(session);
    db.feedback.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/ai/detailed/route');
    return GET(req(`/api/ai/detailed${query}`));
  }
  const wheres = () => db.feedback.findMany.mock.calls.map((c) => c[0].where);

  it.each([
    ['oturumsuz', null, 401],
    ['CUSTOMER', CUSTOMER, 403],
    ['tanınmayan rol', WEIRD, 403],
  ])('%s → %s', async (_label, session, status) => {
    expect((await call(session)).status).toBe(status);
    expect(db.feedback.findMany).not.toHaveBeenCalled();
  });

  it('STAFF → yalnız aktif bayisi (her iki sorgu)', async () => {
    staffLink('dealer-a');
    expect((await call(STAFF_A)).status).toBe(200);
    for (const w of wheres()) expect(w).toMatchObject({ qrCode: { dealerId: 'dealer-a' }, deletedAt: null });
  });

  it('STAFF pasif → 403', async () => {
    staffLink(null);
    expect((await call(STAFF_A)).status).toBe(403);
  });

  it('DEALER → kendi; ADMIN → platform ya da seçili bayi', async () => {
    expect((await call(DEALER_A)).status).toBe(200);
    for (const w of wheres()) expect(w.qrCode).toEqual({ dealerId: 'dealer-a' });
    db.feedback.findMany.mockClear();
    expect((await call(ADMIN)).status).toBe(200);
    for (const w of wheres()) expect(w.qrCode).toBeUndefined();
    db.feedback.findMany.mockClear();
    expect((await call(ADMIN, '?dealerId=dealer-b')).status).toBe(200);
    for (const w of wheres()) expect(w.qrCode).toEqual({ dealerId: 'dealer-b' });
  });
});

// ───────────────────────────── POST /api/ai/analyze?action=analyze (P0-06) ─────────────────────────────

describe('POST /api/ai/analyze?action=analyze — IDOR yazma (P0-06)', () => {
  async function call(session: unknown, body: unknown) {
    setSession(session);
    const { POST } = await import('@/app/api/ai/analyze/route');
    return POST(req('/api/ai/analyze?action=analyze', { method: 'POST', body }));
  }

  it('CUSTOMER kendi olumsuz yorumunu "olumlu" yazdıramaz → 403, yazma yok', async () => {
    const res = await call(CUSTOMER, { feedbackId: 'fb-own', text: 'Harika bir deneyimdi, çok memnun kaldım!' });
    expect(res.status).toBe(403);
    expect(analyzeWithFallback).not.toHaveBeenCalled();
    expect(db.feedback.update).not.toHaveBeenCalled();
  });

  it('DEALER başka bayinin yorumunu analiz edip yazamaz → 404 (sahiplik sorgu filtresinde)', async () => {
    db.feedback.findFirst.mockResolvedValue(null);
    const res = await call(DEALER_A, { feedbackId: 'fb-of-b' });
    expect(res.status).toBe(404);
    expect(db.feedback.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'fb-of-b',
      qrCode: { dealerId: 'dealer-a' },
    });
    expect(db.feedback.update).not.toHaveBeenCalled();
  });

  it('DEALER kendi yorumunda: metin DB’den okunur, istemci metni YOK SAYILIR', async () => {
    db.feedback.findFirst.mockResolvedValue({ text: 'Yemek soğuktu ve servis çok geç geldi.', qrCode: { dealerId: 'dealer-a' } });
    db.feedback.update.mockResolvedValue({});
    db.analyticsEvent.create.mockResolvedValue({});
    const res = await call(DEALER_A, { feedbackId: 'fb-a', text: 'Mükemmeldi, her şey kusursuz!' });
    expect(res.status).toBe(200);
    expect((analyzeWithFallback as jest.Mock).mock.calls[0][0]).toBe('Yemek soğuktu ve servis çok geç geldi.');
    expect((analyzeWithFallback as jest.Mock).mock.calls[0][1]).toMatchObject({ dealerId: 'dealer-a' });
    expect(db.feedback.update).toHaveBeenCalledTimes(1);
  });

  it('pasif STAFF → 403', async () => {
    staffLink(null);
    expect((await call(STAFF_A, { feedbackId: 'fb-a' })).status).toBe(403);
    expect(db.feedback.update).not.toHaveBeenCalled();
  });

  it('feedbackId olmadan metin → yalnız önizleme, hiçbir satır yazılmaz', async () => {
    db.analyticsEvent.create.mockResolvedValue({});
    const res = await call(DEALER_A, { text: 'Bu bir deneme metnidir.' });
    expect(res.status).toBe(200);
    expect(db.feedback.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/analyze — diğer eylemler kapsamlı', () => {
  async function call(session: unknown, action: string, body: unknown) {
    setSession(session);
    const { POST } = await import('@/app/api/ai/analyze/route');
    return POST(req(`/api/ai/analyze?action=${action}`, { method: 'POST', body }));
  }

  it('bulk_analyze: STAFF yalnız aktif bayisinin yorumlarını seçer', async () => {
    staffLink('dealer-a');
    db.feedback.findMany.mockResolvedValue([]);
    expect((await call(STAFF_A, 'bulk_analyze', { feedbackIds: ['x', 'y'] })).status).toBe(200);
    expect(db.feedback.findMany.mock.calls[0][0].where).toMatchObject({ qrCode: { dealerId: 'dealer-a' } });
  });

  it('update_settings: STAFF 403; ADMIN dealerId olmadan 400', async () => {
    staffLink('dealer-a');
    expect((await call(STAFF_A, 'update_settings', { isEnabled: false })).status).toBe(403);
    expect((await call(ADMIN, 'update_settings', { isEnabled: false })).status).toBe(400);
    expect(db.aISettings.upsert).not.toHaveBeenCalled();
  });

  it('DEALER başka bayinin ayarlarını gövdeden hedefleyemez → 403', async () => {
    expect((await call(DEALER_A, 'update_settings', { dealerId: 'dealer-b', isEnabled: false })).status).toBe(403);
    expect(db.aISettings.upsert).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── /api/ai/learning ─────────────────────────────

describe('POST /api/ai/learning?action=record_correction — profil zehirleme', () => {
  async function call(session: unknown, body: unknown) {
    setSession(session);
    const { POST } = await import('@/app/api/ai/learning/route');
    return POST(req('/api/ai/learning?action=record_correction', { method: 'POST', body }));
  }
  const body = { feedbackId: 'fb-of-b', field: 'sentiment', newValue: 'positive' };

  it('CUSTOMER → 403', async () => {
    expect((await call(CUSTOMER, body)).status).toBe(403);
    expect(recordFeedbackCorrection).not.toHaveBeenCalled();
  });

  it('A bayisinin STAFF’ı B’nin yorumuna düzeltme yazamaz → 403', async () => {
    staffLink('dealer-a');
    db.feedback.findUnique.mockResolvedValue({ qrCode: { dealerId: 'dealer-b' } });
    expect((await call(STAFF_A, body)).status).toBe(403);
    expect(recordFeedbackCorrection).not.toHaveBeenCalled();
  });

  it('DEALER B kendi yorumuna yazabilir (bayi kimliği yorumdan)', async () => {
    db.feedback.findUnique.mockResolvedValue({ qrCode: { dealerId: 'dealer-b' } });
    expect((await call(DEALER_B, body)).status).toBe(200);
    expect((recordFeedbackCorrection as jest.Mock).mock.calls[0][0]).toMatchObject({ dealerId: 'dealer-b' });
  });

  it('aşırı büyük düzeltme değeri → 400', async () => {
    const res = await call(DEALER_B, { ...body, newValue: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
  });
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
