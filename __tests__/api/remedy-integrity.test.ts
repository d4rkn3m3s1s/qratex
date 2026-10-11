/**
 * P0-22 · Telafi bütünlüğü — route düzeyi yeniden üretim testleri.
 *  1) Bayi: 501 karakter + "önce onay kuyruğuna al" → eskiden 200 + müşteriye ONAYSIZ bildirim;
 *     şimdi 400 ve hiçbir kayıt/bildirim yok.
 *  2) Bayi: aynı yoruma açık teklif varken ikinci teklif → 409.
 *  3) Bayi: anonim geri bildirim → 422 (sahte "Telafi tetiklendi" yok).
 *  4) Müşteri: PATCH {discount, "100"} → eskiden 200 "%100 indirim kabul edildi"; şimdi 400.
 *  5) Churn müdahalesi: herkese açık DealerFlashOffer AÇMAZ; hedef müşteriye bağlı kuyruk taslağı açar.
 *  6) Yakınımdaki flash teklifler: eski kişisel churn taslakları herkese açık listeden dışlanır.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn().mockResolvedValue(null) }));
// Keşfet kapısı (menü + modül) — yakın flash ucu artık oturum + kapı ister.
jest.mock('@/lib/places/gate.server', () => ({ assertPlacesAccess: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn().mockResolvedValue({ cached: false, key: '' }),
  storeIdempotency: jest.fn(),
}));
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn().mockResolvedValue(null),
  redisSetJson: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: jest.fn().mockResolvedValue({ features: { flashOffers: true, nearbyRadar: true } }),
}));

const m = {
  feedbackFindUnique: jest.fn(),
  offerFindFirst: jest.fn(),
  offerFindUnique: jest.fn(),
  offerCreate: jest.fn(),
  offerUpdateMany: jest.fn(),
  timelineCreate: jest.fn(),
  notificationCreate: jest.fn(),
  analyticsCreate: jest.fn(),
  analyticsFindMany: jest.fn(),
  templateFindMany: jest.fn(),
  consumptionGroupBy: jest.fn(),
  clvFindMany: jest.fn(),
  atRisk: jest.fn(),
  flashCreate: jest.fn(),
  flashFindMany: jest.fn(),
  executeRaw: jest.fn(),
};

// P0-12: churn müdahalesi platform geneli CLV yerine bayi kapsamlı risk listesini okur.
jest.mock('@/lib/dealer-customer-stats', () => ({
  listDealerAtRiskCustomers: (...a: unknown[]) => m.atRisk(...a),
}));

jest.mock('@/lib/prisma', () => {
  const tx = {
    $executeRaw: (...a: unknown[]) => m.executeRaw(...a),
    remedyOffer: {
      findFirst: (...a: unknown[]) => m.offerFindFirst(...a),
      create: (...a: unknown[]) => m.offerCreate(...a),
      updateMany: (...a: unknown[]) => m.offerUpdateMany(...a),
    },
    remedyTimelineEvent: { create: (...a: unknown[]) => m.timelineCreate(...a) },
    notification: { create: (...a: unknown[]) => m.notificationCreate(...a) },
    // İşletme içi (sahip/personel) alıcı kontrolü (isDealerInsider): müşteri personel değil.
    dealerStaff: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return {
    isPrismaConnectivityError: () => false,
    prisma: {
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
      feedback: { findUnique: (...a: unknown[]) => m.feedbackFindUnique(...a) },
      remedyOffer: {
        findFirst: (...a: unknown[]) => m.offerFindFirst(...a),
        findUnique: (...a: unknown[]) => m.offerFindUnique(...a),
        create: (...a: unknown[]) => m.offerCreate(...a),
      },
      remedyTemplate: { findMany: (...a: unknown[]) => m.templateFindMany(...a) },
      notification: { create: (...a: unknown[]) => m.notificationCreate(...a) },
      analyticsEvent: {
        create: (...a: unknown[]) => m.analyticsCreate(...a),
        findMany: (...a: unknown[]) => m.analyticsFindMany(...a),
      },
      consumption: { groupBy: (...a: unknown[]) => m.consumptionGroupBy(...a) },
      customerLifetimeValue: { findMany: (...a: unknown[]) => m.clvFindMany(...a) },
      dealerFlashOffer: {
        create: (...a: unknown[]) => m.flashCreate(...a),
        findMany: (...a: unknown[]) => m.flashFindMany(...a),
      },
      qRCode: { findUnique: jest.fn().mockResolvedValue(null) },
      dealerStaff: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    },
  };
});

import { POST as dealerRemedyPOST } from '@/app/api/dealer/feedbacks/[id]/remedy/route';
import { PATCH as customerRemedyPATCH, GET as customerRemedyGET } from '@/app/api/customer/remedy/[offerId]/route';
import { runChurnInterventionForDealer } from '@/lib/churn-intervention-core';
import { GET as nearbyGET } from '@/app/api/customer/innovation/nearby/route';

const session = (id: string, role: string) => ({ session: { user: { id, role }, expires: '2099-01-01' } });

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  m.offerFindFirst.mockResolvedValue(null);
  m.offerCreate.mockResolvedValue({ id: 'offer-new' });
  m.offerUpdateMany.mockResolvedValue({ count: 1 });
  m.timelineCreate.mockResolvedValue({});
  m.notificationCreate.mockResolvedValue({});
  m.analyticsCreate.mockResolvedValue({});
  m.analyticsFindMany.mockResolvedValue([]);
  m.templateFindMany.mockResolvedValue([]);
  m.executeRaw.mockResolvedValue(1);
  m.feedbackFindUnique.mockResolvedValue({ id: 'fb1', userId: 'cust1', qrCode: { dealerId: 'dealer1', locationId: null } });
});

describe('POST /api/dealer/feedbacks/[id]/remedy', () => {
  beforeEach(() => mockRequireAuth.mockResolvedValue(session('dealer1', 'DEALER')));

  it('onay kuyruğu bypass: 501 karakter mesaj → 400, teklif ve müşteri bildirimi YOK', async () => {
    const res = await dealerRemedyPOST(
      jsonReq('/api/dealer/feedbacks/fb1/remedy', 'POST', {
        message: 'a'.repeat(501),
        sendNotification: false,
        queueForApproval: true,
      }),
      ctx({ id: 'fb1' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/500 karakter/);
    expect(m.offerCreate).not.toHaveBeenCalled();
    expect(m.notificationCreate).not.toHaveBeenCalled();
  });

  it('kuyruk tercihi korunur: awaiting_dealer_approval, müşteriye bildirim yok', async () => {
    const res = await dealerRemedyPOST(
      jsonReq('/api/dealer/feedbacks/fb1/remedy', 'POST', { message: 'Özür', sendNotification: false, queueForApproval: true }),
      ctx({ id: 'fb1' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queuedForApproval).toBe(true);
    expect(body.notificationSent).toBe(false);
    expect(m.offerCreate.mock.calls[0][0].data.status).toBe('awaiting_dealer_approval');
    expect(m.notificationCreate).not.toHaveBeenCalled();
  });

  it('açık teklif varken 409', async () => {
    m.offerFindFirst.mockResolvedValue({ id: 'old', status: 'pending' });
    const res = await dealerRemedyPOST(jsonReq('/api/dealer/feedbacks/fb1/remedy', 'POST', {}), ctx({ id: 'fb1' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('OPEN_OFFER_EXISTS');
    expect(m.offerCreate).not.toHaveBeenCalled();
  });

  it('anonim geri bildirim → 422, analitik olayı yazılmaz', async () => {
    m.feedbackFindUnique.mockResolvedValue({ id: 'fb1', userId: null, qrCode: { dealerId: 'dealer1', locationId: null } });
    const res = await dealerRemedyPOST(jsonReq('/api/dealer/feedbacks/fb1/remedy', 'POST', {}), ctx({ id: 'fb1' }));
    expect(res.status).toBe(422);
    expect(m.analyticsCreate).not.toHaveBeenCalled();
  });

  it('başka bayinin yorumu → 403', async () => {
    mockRequireAuth.mockResolvedValue(session('dealer2', 'DEALER'));
    const res = await dealerRemedyPOST(jsonReq('/api/dealer/feedbacks/fb1/remedy', 'POST', {}), ctx({ id: 'fb1' }));
    expect(res.status).toBe(403);
  });

  it('allowlist dışı seçenek enjeksiyonu → 400', async () => {
    const res = await dealerRemedyPOST(
      jsonReq('/api/dealer/feedbacks/fb1/remedy', 'POST', {
        options: [{ type: 'points', label: 'Puan', unit: 'puan', values: [999] }],
      }),
      ctx({ id: 'fb1' })
    );
    expect(res.status).toBe(400);
    expect(m.offerCreate).not.toHaveBeenCalled();
  });
});

describe('/api/customer/remedy/[offerId]', () => {
  const offer = {
    id: 'o1',
    userId: 'cust1',
    dealerId: 'dealer1',
    status: 'pending',
    message: 'Özür',
    options: [{ type: 'discount', label: 'İndirim', unit: '%', values: [10, 20] }],
    selectedType: null,
    selectedValue: null,
    feedbackId: 'fb1',
    consumptionReviewId: null,
    createdAt: new Date(),
    acceptedAt: null,
    feedback: null,
    consumptionReview: null,
    dealer: { id: 'dealer1', name: 'Kafe', businessName: 'Kafe' },
  };
  beforeEach(() => mockRequireAuth.mockResolvedValue(session('cust1', 'CUSTOMER')));

  it('SALDIRI: teklifte olmayan %100 indirim → 400, durum değişmez', async () => {
    m.offerFindUnique.mockResolvedValue(offer);
    const res = await customerRemedyPATCH(
      jsonReq('/api/customer/remedy/o1', 'PATCH', { selectedType: 'discount', selectedValue: '100' }),
      ctx({ offerId: 'o1' })
    );
    expect(res.status).toBe(400);
    expect(m.offerUpdateMany).not.toHaveBeenCalled();
  });

  it('geçerli seçim → 200 ve sunucu anlık görüntüsü', async () => {
    m.offerFindUnique.mockResolvedValue(offer);
    const res = await customerRemedyPATCH(
      jsonReq('/api/customer/remedy/o1', 'PATCH', { selectedType: 'discount', selectedValue: '20' }),
      ctx({ offerId: 'o1' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.offer.selection).toEqual({ type: 'discount', label: 'İndirim', unit: '%', value: 20 });
  });

  it('onay kuyruğundaki teklif müşteriye 404', async () => {
    m.offerFindUnique.mockResolvedValue({ ...offer, status: 'awaiting_dealer_approval' });
    const res = await customerRemedyGET(jsonReq('/api/customer/remedy/o1', 'GET'), ctx({ offerId: 'o1' }));
    expect(res.status).toBe(404);
  });

  it('GET bozuk options Json\'unu güvenli diziye indirger', async () => {
    m.offerFindUnique.mockResolvedValue({ ...offer, options: { not: 'array' } });
    const res = await customerRemedyGET(jsonReq('/api/customer/remedy/o1', 'GET'), ctx({ offerId: 'o1' }));
    const body = await res.json();
    expect(body.offer.options).toEqual([]);
  });

  it('kaynağı moderasyonla kaldırılmış BEKLEYEN teklif → 404 (seçim formu çıkmazı yok)', async () => {
    m.offerFindUnique.mockResolvedValue({
      ...offer,
      feedback: { id: 'fb1', rating: 1, text: 'sahte', createdAt: new Date(), deletedAt: new Date() },
    });
    const res = await customerRemedyGET(jsonReq('/api/customer/remedy/o1', 'GET'), ctx({ offerId: 'o1' }));
    expect(res.status).toBe(404);
  });

  it('kabul edilmiş teklifte kaldırılmış kaynağın metni dönmez; canlı kaynak bağlamı (consumptionId) döner', async () => {
    m.offerFindUnique.mockResolvedValue({
      ...offer,
      status: 'accepted',
      selectedType: 'discount',
      selectedValue: '20',
      feedback: { id: 'fb1', rating: 1, text: 'sahte', createdAt: new Date(), deletedAt: new Date() },
    });
    let res = await customerRemedyGET(jsonReq('/api/customer/remedy/o1', 'GET'), ctx({ offerId: 'o1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).offer.feedback).toBeNull();

    m.offerFindUnique.mockResolvedValue({
      ...offer,
      feedbackId: null,
      consumptionReviewId: 'cr1',
      consumptionReview: { id: 'cr1', consumptionId: 'c1', rating: 2, text: 'soğuktu', createdAt: new Date(), deletedAt: null },
    });
    res = await customerRemedyGET(jsonReq('/api/customer/remedy/o1', 'GET'), ctx({ offerId: 'o1' }));
    const body = await res.json();
    expect(body.offer.consumptionReview).toMatchObject({ consumptionId: 'c1', rating: 2, text: 'soğuktu' });
    expect(body.offer.consumptionReview).not.toHaveProperty('deletedAt');
  });
});

describe('churn müdahalesi kişisel teklif', () => {
  it('herkese açık flash teklif açmaz; hedef müşteriye bağlı kuyruk taslağı açar', async () => {
    m.atRisk.mockResolvedValue([{ customerId: 'cust1', churnRisk: 0.9, lastVisitAt: null }]);
    const r = await runChurnInterventionForDealer({
      id: 'dealer1',
      dealerChurnIntervention: { enabled: true, autoFlashOffer: true },
    });
    expect(r.offersCreated).toBe(1);
    expect(m.flashCreate).not.toHaveBeenCalled();
    // Platform geneli CLV okunmaz; risk listesi bu bayinin kapsamında istenir.
    expect(m.clvFindMany).not.toHaveBeenCalled();
    expect(m.atRisk).toHaveBeenCalledWith('dealer1', expect.objectContaining({ churnThreshold: 0.6, limit: 20 }));
    const data = m.offerCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 'cust1',
      dealerId: 'dealer1',
      status: 'awaiting_dealer_approval',
      feedbackId: null,
      consumptionReviewId: null,
    });
    // Müşteriye bildirim yok (yalnız bayiye özet).
    const notified = m.notificationCreate.mock.calls.map((c) => c[0].data.userId);
    expect(notified).toEqual(['dealer1']);
  });

  it('açık kişisel teklif varken ikinci taslak açılmaz', async () => {
    m.atRisk.mockResolvedValue([{ customerId: 'cust1', churnRisk: 0.9, lastVisitAt: null }]);
    m.offerFindFirst.mockResolvedValue({ id: 'open', status: 'awaiting_dealer_approval' });
    const r = await runChurnInterventionForDealer({
      id: 'dealer1',
      dealerChurnIntervention: { enabled: true, autoFlashOffer: true },
    });
    expect(r.offersCreated).toBe(0);
    expect(m.offerCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/customer/innovation/nearby', () => {
  it('eski kişisel churn taslaklarını herkese açık sorgudan dışlar', async () => {
    mockRequireAuth.mockResolvedValue(session('cust1', 'CUSTOMER'));
    m.flashFindMany.mockResolvedValue([]);
    const res = await nearbyGET(jsonReq('/api/customer/innovation/nearby?lat=41&lng=29', 'GET'));
    expect(res.status).toBe(200);
    const where = m.flashFindMany.mock.calls[0][0].where;
    expect(where.NOT).toEqual({
      title: 'Seni özledik 🎁',
      body: 'Sizi tekrar ağırlamak isteriz — size özel indirim.',
      maxRedemptions: 1,
    });
  });
});
