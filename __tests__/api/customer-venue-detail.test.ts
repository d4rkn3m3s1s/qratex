/**
 * Mekân detayı uçları (denetim: docs/audit/2026-10-08/musteri/customer_experiences.md):
 *  - POST /api/customer/improvement-request: ziyaret uygunluğu (B1), günlük tavanlar (B1),
 *    müşteri SLA seçemez (B7), kayıt + İÇERİKLİ bildirim tek transaction'da (B6), modül kapısı (B10).
 *  - POST /api/customer/experience-share: yalnız kendi 4-5 puanlık deneyimi (B2), serbest metin
 *    yok, aynı kart yeniden kullanılır, günlük tavan.
 *  - GET  /api/customer/venue-detail/[dealerId]/history: imleçli, yalnız kendi kayıtları.
 *  - listImprovementRequests: "işletme gördü" = bildirimin readAt'i.
 * Gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));
const mockModuleBlocked = { value: false };
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: async () => (mockModuleBlocked.value ? new Response('{}', { status: 403 }) : null),
  getModuleControls: async () => ({}),
}));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

const db = {
  dealer: { id: 'dealer_000001', businessName: 'Kahve Durağı', name: null } as Record<string, unknown> | null,
  consumptionRecent: true,
  feedbackRecent: false,
  perDealerCount: 0,
  perUserCount: 0,
  replies: [] as Array<{ createdAt: Date; dealerRepliedAt: Date }>,
  created: [] as Array<Record<string, unknown>>,
  notifications: [] as Array<Record<string, unknown>>,
  feedbackRating: null as number | null,
  reviewRating: null as number | null,
  existingToken: null as Record<string, unknown> | null,
  tokensToday: 0,
  tokens: [] as Array<Record<string, unknown>>,
  lastFeedbackWhere: null as unknown,
};

const tx = {
  improvementRequest: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.created.push(data);
      return { id: 'ir_000001', templateKey: data.templateKey, message: data.message, createdAt: new Date('2026-10-10T10:00:00Z') };
    }),
  },
  notification: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.notifications.push(data);
      return data;
    }),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn(async () => db.dealer) },
    consumption: {
      findFirst: jest.fn(async () => (db.consumptionRecent ? { id: 'c1' } : null)),
      findMany: jest.fn(async () => []),
    },
    feedback: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ('id' in where) return db.feedbackRating == null ? null : { rating: db.feedbackRating };
        return db.feedbackRecent ? { id: 'f1' } : null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        db.lastFeedbackWhere = where;
        if ('dealerRepliedAt' in where) return db.replies;
        return [];
      }),
    },
    consumptionReview: {
      findFirst: jest.fn(async () => (db.reviewRating == null ? null : { rating: db.reviewRating })),
      findMany: jest.fn(async () => []),
    },
    improvementRequest: {
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => ('dealerId' in where ? db.perDealerCount : db.perUserCount)),
      findMany: jest.fn(async () => [
        { id: 'ir_a', templateKey: 'speed', message: 'Bekleme uzundu', createdAt: new Date('2026-10-09T10:00:00Z') },
        { id: 'ir_b', templateKey: 'tone', message: 'Daha güler yüz', createdAt: new Date('2026-10-08T10:00:00Z') },
      ]),
    },
    notification: {
      findMany: jest.fn(async () => [
        { data: { type: 'improvement_request', improvementRequestId: 'ir_a' }, readAt: new Date('2026-10-09T12:00:00Z'), isRead: true },
        { data: { type: 'improvement_request', improvementRequestId: 'ir_b' }, readAt: null, isRead: false },
      ]),
    },
    experienceShareToken: {
      findFirst: jest.fn(async () => db.existingToken),
      count: jest.fn(async () => db.tokensToday),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.tokens.push(data);
        return data;
      }),
    },
    analyticsEvent: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));

import { POST as improvePOST } from '@/app/api/customer/improvement-request/route';
import { POST as sharePOST } from '@/app/api/customer/experience-share/route';
import { GET as historyGET } from '@/app/api/customer/venue-detail/[dealerId]/history/route';
import { listImprovementRequests } from '@/lib/venue-detail/improvement';

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CUSTOMER = { session: { user: { id: 'user_000001', role: 'CUSTOMER' } } };

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue(CUSTOMER);
  mockModuleBlocked.value = false;
  Object.assign(db, {
    dealer: { id: 'dealer_000001', businessName: 'Kahve Durağı', name: null },
    consumptionRecent: true,
    feedbackRecent: false,
    perDealerCount: 0,
    perUserCount: 0,
    replies: [],
    created: [],
    notifications: [],
    feedbackRating: null,
    reviewRating: null,
    existingToken: null,
    tokensToday: 0,
    tokens: [],
  });
  tx.improvementRequest.create.mockClear();
  tx.notification.create.mockClear();
});

const validImprove = { dealerId: 'dealer_000001', templateKey: 'speed', message: 'Sipariş 25 dakika gecikti, haber verilmedi.' };

describe('POST /api/customer/improvement-request', () => {
  it('ziyareti olmayan müşteri gönderemez (B1) — kayıt ve bildirim yok', async () => {
    db.consumptionRecent = false;
    db.feedbackRecent = false;
    const res = await improvePOST(post('/api/customer/improvement-request', validImprove), {});
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('NO_RECENT_VISIT');
    expect(tx.improvementRequest.create).not.toHaveBeenCalled();
  });

  it('mekân başına günlük tavan aşılınca 429 (B1)', async () => {
    db.perDealerCount = 2;
    const res = await improvePOST(post('/api/customer/improvement-request', validImprove), {});
    expect(res.status).toBe(429);
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('kullanıcı başına günlük tavan aşılınca 429', async () => {
    db.perUserCount = 10;
    const res = await improvePOST(post('/api/customer/improvement-request', validImprove), {});
    expect(res.status).toBe(429);
  });

  it('başarılı istek: tek transaction, bildirim metni içerir, SLA sunucudan (B6, B7)', async () => {
    const created = (h: number) => ({ createdAt: new Date('2026-10-01T00:00:00Z'), dealerRepliedAt: new Date(Date.UTC(2026, 9, 1) + h * 3_600_000) });
    db.replies = [created(2), created(6), created(10)];
    const res = await improvePOST(
      post('/api/customer/improvement-request', { ...validImprove, expectedHours: 12 }),
      {}
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.request).toMatchObject({ id: 'ir_000001', seen: false, templateKey: 'speed' });
    expect(json.data.responseTime).toEqual({ hours: 6, sample: 3 });
    // müşterinin gönderdiği 12 saat YOK sayıldı; medyan (6) yazıldı
    expect(db.created[0]).toMatchObject({ userId: 'user_000001', dealerId: 'dealer_000001', expectedHours: 6 });
    expect(db.created[0].message).toBe(validImprove.message);
    expect(db.notifications[0]).toMatchObject({
      userId: 'dealer_000001',
      title: 'İyileştirme isteği · Hız ve bekleme',
      message: validImprove.message,
      data: { type: 'improvement_request', improvementRequestId: 'ir_000001', templateKey: 'speed' },
    });
  });

  it('kısa mesaj Türkçe doğrulama hatası döner', async () => {
    const res = await improvePOST(post('/api/customer/improvement-request', { ...validImprove, message: 'kısa' }), {});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details[0].message).toBe('En az 10 karakter yazın.');
  });

  it('modül kapalıyken 403 MODULE_DISABLED (B10)', async () => {
    mockModuleBlocked.value = true;
    const res = await improvePOST(post('/api/customer/improvement-request', validImprove), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
  });

  it('bilinmeyen/askıdaki mekân 404', async () => {
    db.dealer = null;
    const res = await improvePOST(post('/api/customer/improvement-request', validImprove), {});
    expect(res.status).toBe(404);
  });
});

const validShare = {
  dealerId: 'dealer_000001',
  experience: { kind: 'feedback', id: 'feedback_0001' },
  captionKey: 'recommend',
  mood: 'great',
};

describe('POST /api/customer/experience-share', () => {
  it('serbest caption kabul edilmez — şablon anahtarı zorunlu (B2)', async () => {
    db.feedbackRating = 5;
    const res = await sharePOST(
      post('/api/customer/experience-share', { dealerId: 'dealer_000001', caption: 'karalama', mood: 'great' }),
      {}
    );
    expect(res.status).toBe(400);
    expect(db.tokens).toHaveLength(0);
  });

  it('başkasının / bu mekâna ait olmayan deneyimi paylaşılamaz (404)', async () => {
    db.feedbackRating = null;
    const res = await sharePOST(post('/api/customer/experience-share', validShare), {});
    expect(res.status).toBe(404);
  });

  it('3 puanlık deneyim için kart yok (422)', async () => {
    db.feedbackRating = 3;
    const res = await sharePOST(post('/api/customer/experience-share', validShare), {});
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('NOT_SHAREABLE');
  });

  it('kart oluşturur: şablon metin + puan, 7 gün', async () => {
    db.feedbackRating = 5;
    const res = await sharePOST(post('/api/customer/experience-share', validShare), {});
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.link.url).toMatch(/\/experience\/[A-Za-z0-9_-]+$/);
    expect(db.tokens[0]).toMatchObject({
      creatorId: 'user_000001',
      dealerId: 'dealer_000001',
      caption: 'Gönül rahatlığıyla tavsiye ederim. · 5/5',
      mood: 'great',
    });
  });

  it('aynı kart varsa yeni token üretilmez', async () => {
    db.reviewRating = 4;
    db.existingToken = { token: 'tok_existing', caption: 'x', mood: 'great', viewCount: 3, expiresAt: new Date('2026-10-15T00:00:00Z') };
    const res = await sharePOST(
      post('/api/customer/experience-share', { ...validShare, experience: { kind: 'review', id: 'review_00001' } }),
      {}
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.link).toMatchObject({ token: 'tok_existing', reused: true, viewCount: 3 });
    expect(db.tokens).toHaveLength(0);
  });

  it('günlük kart tavanı 429', async () => {
    db.feedbackRating = 5;
    db.tokensToday = 10;
    const res = await sharePOST(post('/api/customer/experience-share', validShare), {});
    expect(res.status).toBe(429);
  });
});

describe('GET /api/customer/venue-detail/[dealerId]/history', () => {
  it('yalnız oturumdaki müşterinin kayıtları + imleç', async () => {
    const res = await historyGET(
      new NextRequest('http://localhost/api/customer/venue-detail/dealer_000001/history?cursor=2026-10-05T10:00:00.000Z'),
      { params: Promise.resolve({ dealerId: 'dealer_000001' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ items: [], nextCursor: null });
    expect(db.lastFeedbackWhere).toMatchObject({ userId: 'user_000001', deletedAt: null, qrCode: { dealerId: 'dealer_000001' } });
  });

  it('bozuk imleç 400', async () => {
    const res = await historyGET(
      new NextRequest('http://localhost/api/customer/venue-detail/dealer_000001/history?cursor=dun'),
      { params: Promise.resolve({ dealerId: 'dealer_000001' }) }
    );
    expect(res.status).toBe(400);
  });

  it('bayi rolü erişemez', async () => {
    mockRequireAuth.mockResolvedValueOnce({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const res = await historyGET(
      new NextRequest('http://localhost/api/customer/venue-detail/dealer_000001/history'),
      { params: Promise.resolve({ dealerId: 'dealer_000001' }) }
    );
    expect(res.status).toBe(403);
  });
});

describe('listImprovementRequests', () => {
  it('işletme gördü = bildirimin readAt değeri', async () => {
    const rows = await listImprovementRequests('user_000001', 'dealer_000001');
    expect(rows).toEqual([
      expect.objectContaining({ id: 'ir_a', seen: true, seenAt: '2026-10-09T12:00:00.000Z' }),
      expect.objectContaining({ id: 'ir_b', seen: false, seenAt: null }),
    ]);
  });
});
