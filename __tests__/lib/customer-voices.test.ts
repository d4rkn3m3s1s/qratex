/**
 * Seslerim (/customer/me/voices) — sunucu katmanı ve telafi puan teslimi.
 *
 *  - Birleşik imleç sayfalaması iki tablodan kayıpsız/tekrarsız akar.
 *  - Kapsam her sorguda müşteridir; başkasının kaydı 404, moderasyonla silinen 404 (açıklamalı).
 *  - Yolculuk kronolojiktir ve uydurma adım üretmez (otomatik yanıt sonrası "inceledi" geriye akmaz).
 *  - Telafi kartı güncel teklifi gösterir (açık > en yeni kabul > süresi dolmuş).
 *  - Özet sayıları kod hesaplar; yorum yokken ortalama "0" değil null.
 *  - "AI ne anladı" bayi triyaj alanlarını taşımaz ve modül kapısına bağlıdır.
 *  - Telafi "puan" türü kabulde mintPoints ile tek seferlik, tavanlı ve bayi atıflı kredilenir.
 */
const mockFeedbackFindMany = jest.fn();
const mockFeedbackFindFirst = jest.fn();
const mockReviewFindMany = jest.fn();
const mockLedgerFindMany = jest.fn();
const mockConsumptionFindFirst = jest.fn();
const mockOfferFindUnique = jest.fn();
const mockOfferUpdateMany = jest.fn();
const mockTimelineCreate = jest.fn();
const mockNotificationCreate = jest.fn();
const mockFeedbackAggregate = jest.fn();
const mockReviewAggregate = jest.fn();
const mockFeedbackCount = jest.fn();
const mockReviewCount = jest.fn();
const mockQueryRaw = jest.fn();
const mockConsumptionCount = jest.fn();
const mockConsumptionFindMany = jest.fn();
const mockOfferCount = jest.fn();
const mockFeedbackGroupBy = jest.fn();
const mockReviewGroupBy = jest.fn();
const mockUserFindUnique = jest.fn();
const mockMint = jest.fn();
const mockModuleControls = jest.fn();

const tx = {
  // Bayi günlük telafi bütçesi: kilit + defter toplamı (boş gün).
  $executeRaw: jest.fn(async () => 1),
  pointsLedger: { aggregate: jest.fn(async () => ({ _sum: { delta: 0 } })) },
  remedyOffer: { updateMany: (...a: unknown[]) => mockOfferUpdateMany(...a) },
  remedyTimelineEvent: { create: (...a: unknown[]) => mockTimelineCreate(...a) },
  notification: { create: (...a: unknown[]) => mockNotificationCreate(...a) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
    feedback: {
      findMany: (...a: unknown[]) => mockFeedbackFindMany(...a),
      findFirst: (...a: unknown[]) => mockFeedbackFindFirst(...a),
      aggregate: (...a: unknown[]) => mockFeedbackAggregate(...a),
      count: (...a: unknown[]) => mockFeedbackCount(...a),
      groupBy: (...a: unknown[]) => mockFeedbackGroupBy(...a),
    },
    consumptionReview: {
      findMany: (...a: unknown[]) => mockReviewFindMany(...a),
      aggregate: (...a: unknown[]) => mockReviewAggregate(...a),
      count: (...a: unknown[]) => mockReviewCount(...a),
      groupBy: (...a: unknown[]) => mockReviewGroupBy(...a),
    },
    consumption: {
      findFirst: (...a: unknown[]) => mockConsumptionFindFirst(...a),
      count: (...a: unknown[]) => mockConsumptionCount(...a),
      findMany: (...a: unknown[]) => mockConsumptionFindMany(...a),
    },
    pointsLedger: { findMany: (...a: unknown[]) => mockLedgerFindMany(...a) },
    remedyOffer: {
      findUnique: (...a: unknown[]) => mockOfferFindUnique(...a),
      count: (...a: unknown[]) => mockOfferCount(...a),
    },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
}));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: () => mockModuleControls() }));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({
    consumptionReview: { longTextThreshold: 50, base: { points: 50, xp: 25 }, detailed: { points: 100, xp: 50 } },
  })),
}));
jest.mock('@/lib/economy', () => ({
  getCapRule: () => ({ daily: 500, weekly: 2000, countCategories: ['feedback'] }),
  sumEarnedInWindow: jest.fn(async () => ({ today: 450, week: 600, todayFromActor: 0 })),
}));
jest.mock('@/lib/economy/mint', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

import {
  buildVoiceJourney,
  customerAnalysis,
  cursorWhere,
  decodeVoiceCursor,
  encodeVoiceCursor,
  istanbulMonthStart,
  mediaUrls,
  mergeVoicePages,
  normalizeDimensions,
  parseVoiceKey,
  pickActiveRemedy,
  voiceKey,
} from '@/lib/customer-voices/core';
import { customerRemedyWhere, getVoiceDetail, getVoiceSummary, listVoices, VoiceNotFoundError } from '@/lib/customer-voices/server';
import { acceptRemedyOffer } from '@/lib/remedy-offer-service';

const dealer = { id: 'd1', name: 'Ayşe', businessName: 'Kahve Durağı', businessLogo: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockLedgerFindMany.mockResolvedValue([]);
  mockModuleControls.mockResolvedValue({});
  mockQueryRaw.mockResolvedValue([]);
});

describe('anahtar ve imleç', () => {
  it('anahtar gidiş-dönüş; bozuk anahtar null', () => {
    expect(parseVoiceKey(voiceKey('qr', 'abc123'))).toEqual({ kind: 'qr', id: 'abc123' });
    expect(parseVoiceKey('cs-xyz')).toEqual({ kind: 'review', id: 'xyz' });
    expect(parseVoiceKey('xx-1')).toBeNull();
    expect(parseVoiceKey('fb-')).toBeNull();
    expect(parseVoiceKey("fb-1'; DROP")).toBeNull();
  });

  it('imleç gidiş-dönüş; kurcalanmış imleç yok sayılır', () => {
    const c = { at: '2026-10-01T10:00:00.000Z', key: 'fb-a1' };
    expect(decodeVoiceCursor(encodeVoiceCursor(c))).toEqual(c);
    expect(decodeVoiceCursor('bozuk')).toBeNull();
    expect(decodeVoiceCursor(Buffer.from(JSON.stringify(['x', 'fb-1'])).toString('base64url'))).toBeNull();
  });

  it('aynı önekte eşit anda id karşılaştırır; farklı önekte eşit anlı satırları doğru dahil eder', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const fbCursor = { at, key: 'fb-m' };
    expect(cursorWhere(fbCursor, 'fb', 'id')).toEqual({
      OR: [{ createdAt: { lt: new Date(at) } }, { AND: [{ createdAt: new Date(at) }, { id: { lt: 'm' } }] }],
    });
    // "cs-" < "fb-": imleç fb iken eşit anlı tüm cs satırları SONRA gelir → lte.
    expect(cursorWhere(fbCursor, 'cs', 'consumptionId')).toEqual({ createdAt: { lte: new Date(at) } });
    // imleç cs iken eşit anlı fb satırları ÖNCE gelmişti → lt.
    expect(cursorWhere({ at, key: 'cs-m' }, 'fb', 'id')).toEqual({ createdAt: { lt: new Date(at) } });
    expect(cursorWhere(null, 'fb', 'id')).toBeNull();
  });

  it('birleşik sayfa sıralı, kırpılmış ve devam imleçli', () => {
    const qr = [
      { key: 'fb-3', createdAt: '2026-10-05T00:00:00.000Z' },
      { key: 'fb-2', createdAt: '2026-10-03T00:00:00.000Z' },
      { key: 'fb-1', createdAt: '2026-10-01T00:00:00.000Z' },
    ];
    const rv = [{ key: 'cs-9', createdAt: '2026-10-04T00:00:00.000Z' }];
    const page = mergeVoicePages([{ rows: qr, exhausted: false }, { rows: rv, exhausted: true }], 2);
    expect(page.items.map((i) => i.key)).toEqual(['fb-3', 'cs-9']);
    expect(decodeVoiceCursor(page.nextCursor)).toEqual({ at: '2026-10-04T00:00:00.000Z', key: 'cs-9' });
    const last = mergeVoicePages([{ rows: qr.slice(0, 1), exhausted: true }, { rows: [], exhausted: true }], 5);
    expect(last.nextCursor).toBeNull();
  });
});

describe('telafi önceliği ve yolculuk', () => {
  it('açık teklif kabul edilmişten önce; aynı durumda en yeni', () => {
    const offers = [
      { id: 'old-acc', status: 'accepted', createdAt: '2026-09-01' },
      { id: 'new-acc', status: 'accepted', createdAt: '2026-09-10' },
      { id: 'pend', status: 'pending', createdAt: '2026-08-01' },
      { id: 'queued', status: 'awaiting_dealer_approval', createdAt: '2026-10-01' },
    ];
    expect(pickActiveRemedy(offers)?.id).toBe('pend');
    expect(pickActiveRemedy(offers.filter((o) => o.id !== 'pend'))?.id).toBe('new-acc');
    expect(pickActiveRemedy([{ id: 'q', status: 'rejected', createdAt: '2026-01-01' }])).toBeNull();
  });

  it('otomatik yanıttan SONRA açılan kayıt "inceledi" adımını geriye akıtmaz', () => {
    const j = buildVoiceJourney({
      createdAt: '2026-10-01T10:00:00Z',
      repliedAt: '2026-10-01T10:00:05Z',
      viewedAt: '2026-10-02T09:00:00Z',
    });
    expect(j.map((e) => e.kind)).toEqual(['submitted', 'replied']);
  });

  it('kronolojik; teklif zamanı bildirim anı; puan kredisi ayrı adım', () => {
    const j = buildVoiceJourney({
      createdAt: '2026-10-01T10:00:00Z',
      viewedAt: '2026-10-01T11:00:00Z',
      repliedAt: '2026-10-01T12:00:00Z',
      remedies: [
        {
          id: 'o1',
          status: 'accepted',
          createdAt: '2026-10-01T11:30:00Z', // onay kuyruğundaki taslak anı
          acceptedAt: '2026-10-02T08:00:00Z',
          selectionLabel: '100 puan',
          events: [
            { kind: 'notified', createdAt: '2026-10-01T13:00:00Z' },
            { kind: 'completed', createdAt: '2026-10-02T08:00:00Z', meta: { creditedPoints: 100 } },
          ],
        },
      ],
    });
    expect(j.map((e) => e.kind)).toEqual(['submitted', 'viewed', 'replied', 'remedy_offered', 'remedy_accepted', 'remedy_credited']);
    expect(j.find((e) => e.kind === 'remedy_offered')?.at).toBe('2026-10-01T13:00:00.000Z');
    expect(j.find((e) => e.kind === 'remedy_credited')?.detail).toBe('100');
  });

  it('müşteri analizi bayi triyaj alanlarını taşımaz; boş analiz null', () => {
    const a = customerAnalysis({
      aiAnalysis: { summary: 'Kahve soğuktu ama personel ilgiliydi.', churnRisk: 0.9 },
      themes: [{ theme: 'Servis', sentiment: 'positive', score: 0.9 }, { bogus: true }],
      statementSentiments: [{ statement: 'Kahve soğuktu', sentiment: 'negative' }],
      topics: ['temperature', 3],
    });
    expect(a).toEqual({
      summary: 'Kahve soğuktu ama personel ilgiliydi.',
      themes: [{ theme: 'Servis', sentiment: 'positive' }],
      statements: [{ statement: 'Kahve soğuktu', sentiment: 'negative' }],
      topics: ['temperature'],
    });
    expect(JSON.stringify(a)).not.toMatch(/churn|urgency|effort|action/i);
    expect(customerAnalysis({})).toBeNull();
  });

  it('medya yalnız güvenli görseller; boyutlar yalnız bilinen 1-5', () => {
    expect(mediaUrls(['https://cdn/x.jpg', 'http://insecure', 'javascript:alert(1)', { url: 'https://cdn/a.mp3', type: 'audio' }])).toEqual([
      'https://cdn/x.jpg',
    ]);
    expect(normalizeDimensions({ taste: 5, service: 9, hack: 3 })).toEqual({ taste: 5 });
    expect(normalizeDimensions('x')).toBeNull();
  });

  it('İstanbul ay başı UTC+3 sınırında doğru', () => {
    // 31 Ekim 22:30 UTC = 1 Kasım 01:30 İstanbul → ay başı 31 Ekim 21:00 UTC.
    expect(istanbulMonthStart(new Date('2026-10-31T22:30:00Z')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(istanbulMonthStart(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });
});

describe('listVoices', () => {
  const params = { type: 'all' as const, status: 'all' as const, q: '', cursor: null, limit: 2 };

  it('iki tabloyu kullanıcı kapsamında birleştirir; silinmişleri dışlar; puanı defterden bağlar', async () => {
    mockFeedbackFindMany.mockResolvedValue([
      {
        id: 'f1', rating: 2, text: 'Soğuktu', createdAt: new Date('2026-10-05'), dealerRepliedAt: null,
        dealerFirstViewedAt: new Date('2026-10-05T01:00:00Z'), qrCode: { name: 'Masa 4', dealer }, remedyOffers: [],
      },
    ]);
    mockReviewFindMany.mockResolvedValue([
      {
        id: 'r1', consumptionId: 'c1', rating: 5, text: 'Harika', createdAt: new Date('2026-10-06'),
        dealerRepliedAt: new Date('2026-10-06T05:00:00Z'), consumption: { dealer, product: { name: 'Latte' } },
        remedyOffers: [{ id: 'o1', status: 'pending', createdAt: new Date(), selectedType: null, selectedValue: null, options: [] }],
      },
    ]);
    mockLedgerFindMany.mockImplementation(async (args: { where: { source: string } }) =>
      args.where.source === 'review' ? [{ sourceId: 'r1', delta: 100, xpDelta: 50 }] : []
    );

    const page = await listVoices('u1', params);
    expect(mockFeedbackFindMany.mock.calls[0][0].where.AND[0]).toEqual({ userId: 'u1', deletedAt: null });
    expect(mockReviewFindMany.mock.calls[0][0].where.AND[0]).toEqual({ customerId: 'u1', deletedAt: null });
    expect(page.items.map((i) => i.key)).toEqual(['cs-c1', 'fb-f1']);
    const [rv, fb] = page.items;
    expect(rv).toMatchObject({ kind: 'review', place: 'Latte', stage: 'replied', pointsEarned: 100, remedy: { id: 'o1', status: 'pending' } });
    // İşletme adı QR adı DEĞİL, bayinin işletme adı (eski hata: "Masa 4" + "Masa 4").
    expect(fb).toMatchObject({ business: { name: 'Kahve Durağı' }, place: 'Masa 4', stage: 'viewed', pointsEarned: null });
    expect(page.nextCursor).toBeNull();
  });

  it('tür filtresi diğer tabloyu hiç sorgulamaz; arama ve durum filtresi sunucuda', async () => {
    mockFeedbackFindMany.mockResolvedValue([]);
    await listVoices('u1', { ...params, type: 'qr', status: 'remedy', q: 'kahve' });
    expect(mockReviewFindMany).not.toHaveBeenCalled();
    const and = mockFeedbackFindMany.mock.calls[0][0].where.AND;
    expect(and).toEqual(
      expect.arrayContaining([
        { remedyOffers: { some: { status: { in: ['pending', 'accepted', 'expired'] } } } },
        expect.objectContaining({ OR: expect.arrayContaining([{ text: { contains: 'kahve', mode: 'insensitive' } }]) }),
      ])
    );
  });
});

describe('getVoiceDetail', () => {
  it('başkasının (ya da olmayan) kaydı 404; sorgu kullanıcıya kapsanır', async () => {
    mockFeedbackFindFirst.mockResolvedValue(null);
    await expect(getVoiceDetail('u1', 'fb-other')).rejects.toBeInstanceOf(VoiceNotFoundError);
    expect(mockFeedbackFindFirst.mock.calls[0][0].where).toEqual({ id: 'other', userId: 'u1' });
    await expect(getVoiceDetail('u1', 'zz-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('moderasyonla silinen QR geri bildirimi açıklamalı 404', async () => {
    mockFeedbackFindFirst.mockResolvedValue({ id: 'f1', deletedAt: new Date() });
    await expect(getVoiceDetail('u1', 'fb-f1')).rejects.toMatchObject({ code: 'VOICE_REMOVED' });
  });

  const fbRow = {
    id: 'f1', rating: 4, text: 'İyi', media: null, createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01'),
    deletedAt: null, dealerReply: null, dealerRepliedAt: null, dealerFirstViewedAt: null,
    topics: ['service'], themes: [], statementSentiments: [], aiAnalysis: { summary: 'Memnun' },
    qrCode: { name: 'Masa 1', dealer }, remedyOffers: [],
  };

  it('"AI ne anladı" modül kapalıyken gelmez; yanıt beklenirken bayi medyan süresi', async () => {
    mockFeedbackFindFirst.mockResolvedValue(fbRow);
    mockModuleControls.mockResolvedValue({ customer_ai_insights: false });
    mockQueryRaw.mockResolvedValue([{ med: 3 * 3600, n: 12 }]);
    const d = await getVoiceDetail('u1', 'fb-f1');
    expect(d.analysis).toBeNull();
    expect(d.expectation).toEqual({ medianHours: 3, sample: 12 });
    expect(d.stage).toBe('sent');

    mockModuleControls.mockResolvedValue({});
    mockQueryRaw.mockResolvedValue([{ med: 3600, n: 2 }]); // düşük örneklem → gösterilmez
    const d2 = await getVoiceDetail('u1', 'fb-f1');
    expect(d2.analysis?.summary).toBe('Memnun');
    expect(d2.expectation).toBeNull();
  });

  it('yorumsuz tüketim: yazma izni + sunucu ödül önizlemesi (kalan tavan)', async () => {
    mockConsumptionFindFirst.mockResolvedValue({
      id: 'c1', createdAt: new Date('2026-10-01'), amount: 0, note: null, dealer, product: { name: 'Latte', category: null }, review: null,
    });
    const d = await getVoiceDetail('u1', 'cs-c1');
    expect(mockConsumptionFindFirst.mock.calls[0][0].where).toEqual({ id: 'c1', customerId: 'u1' });
    expect(d.composer).toEqual({
      mode: 'create',
      reward: { base: { points: 50, xp: 25 }, detailed: { points: 100, xp: 50 }, threshold: 50, remainingToday: 50 },
    });
    expect(d.consumption?.amount).toBeNull(); // 0 tutar "0" diye basılmaz
    expect(d.voice).toBeNull();
  });

  it('moderasyonla silinen tüketim yorumu: makbuz var, düzenleme yok', async () => {
    mockConsumptionFindFirst.mockResolvedValue({
      id: 'c1', createdAt: new Date(), amount: 120, note: null, dealer, product: null,
      review: { id: 'r1', deletedAt: new Date(), rating: 1, text: 'x', dimensions: null, createdAt: new Date(), updatedAt: new Date(), dealerReply: null, dealerRepliedAt: null, remedyOffers: [] },
    });
    const d = await getVoiceDetail('u1', 'cs-c1');
    expect(d).toMatchObject({ moderated: true, voice: null, composer: null });
  });
});

describe('getVoiceSummary', () => {
  function baseMocks() {
    mockFeedbackAggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } });
    mockReviewAggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } });
    mockFeedbackCount.mockResolvedValue(0);
    mockReviewCount.mockResolvedValue(0);
    mockConsumptionCount.mockResolvedValue(0);
    mockConsumptionFindMany.mockResolvedValue([]);
    mockOfferCount.mockResolvedValue(0);
    mockFeedbackGroupBy.mockResolvedValue([]);
    mockReviewGroupBy.mockResolvedValue([]);
    mockFeedbackFindMany.mockResolvedValue([]);
  }

  it('yorum yokken ortalama ve yanıt oranı null (0 değil); puan defter olayından', async () => {
    baseMocks();
    mockQueryRaw.mockResolvedValueOnce([{ total: 0, month: 0 }]).mockResolvedValueOnce([]);
    const s = await getVoiceSummary('u1');
    expect(s.totals).toEqual({ voices: 0, qr: 0, reviews: 0, avgRating: null, replied: 0, replyRate: null });
    expect(s.insights).toBeNull();
  });

  it('ağırlıklı ortalama, yanıt oranı, gerçek puan, analiz edilenden duygu/konu', async () => {
    baseMocks();
    mockFeedbackAggregate.mockResolvedValue({ _count: { _all: 3 }, _avg: { rating: 4 } });
    mockReviewAggregate.mockResolvedValue({ _count: { _all: 1 }, _avg: { rating: 2 } });
    mockFeedbackCount.mockResolvedValue(2);
    mockReviewCount.mockResolvedValue(1);
    mockQueryRaw.mockResolvedValueOnce([{ total: 350, month: 100 }]).mockResolvedValueOnce([{ dealerId: 'd1', n: 3, avg: 4.33 }]);
    mockUserFindUnique.mockResolvedValue(dealer);
    mockFeedbackGroupBy.mockResolvedValue([{ sentiment: 'positive', _count: { _all: 2 } }]);
    mockReviewGroupBy.mockResolvedValue([{ sentiment: 'negative', _count: { _all: 1 } }]);
    mockFeedbackFindMany.mockResolvedValue([{ topics: ['service', 'price'] }, { topics: ['service', 'service'] }]);
    const s = await getVoiceSummary('u1');
    expect(s.totals).toEqual({ voices: 4, qr: 3, reviews: 1, avgRating: 3.5, replied: 3, replyRate: 75 });
    expect(s.points).toEqual({ total: 350, thisMonth: 100 });
    expect(s.favoritePlace).toEqual({ business: { id: 'd1', name: 'Kahve Durağı', logo: null }, count: 3, avgRating: 4.3 });
    expect(s.insights).toEqual({
      analyzed: 3,
      sentiment: { positive: 2, neutral: 0, negative: 1 },
      topTopics: [{ key: 'service', count: 2 }, { key: 'price', count: 1 }],
      topicSample: 2,
    });
  });
});

describe('telafi kabulü — puan teslimi', () => {
  const pending = {
    id: 'o1', userId: 'u1', dealerId: 'd1', status: 'pending',
    options: [
      { type: 'points', label: 'Puan', unit: 'puan', values: [50, 100] },
      { type: 'discount', label: 'İndirim', unit: '%', values: [10] },
    ],
  };
  beforeEach(() => {
    mockOfferFindUnique.mockResolvedValue(pending);
    mockOfferUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('puan türü: aynı tx\'te tek seferlik, tavanlı, bayi atıflı mint + "completed" olayı', async () => {
    mockMint.mockResolvedValue({ credited: 100, capped: false, status: 'posted' });
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: '100' });
    expect(r.creditedPoints).toBe(100);
    expect(mockMint).toHaveBeenCalledWith(tx, expect.objectContaining({
      userId: 'u1', points: 100, source: 'remedy', sourceId: 'o1', idempotencyKey: 'remedy:o1', actorId: 'd1', capCategory: 'remedy',
    }));
    const kinds = mockTimelineCreate.mock.calls.map((c) => c[0].data.kind);
    expect(kinds).toEqual(['accepted', 'completed']);
    expect(mockTimelineCreate.mock.calls[1][0].data.meta).toMatchObject({ creditedPoints: 100, requestedPoints: 100 });
  });

  it('tavan seçimi kısarsa kabul EDİLMEZ (tx geri alınır, teklif bekler; kalan telafi kaybolmaz)', async () => {
    mockMint.mockResolvedValue({ credited: 40, capped: true, status: 'posted' });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 100 })
    ).rejects.toMatchObject({ code: 'REMEDY_POINTS_CAP', status: 409, message: expect.stringContaining('en fazla 40 puan') });
    // Tavan tamamen doluysa da aynı: sessizce 0 puanla "kabul edildi" yok.
    mockMint.mockResolvedValue({ credited: 0, capped: true, status: 'posted' });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 50 })
    ).rejects.toMatchObject({ code: 'REMEDY_POINTS_CAP' });
    expect(mockTimelineCreate.mock.calls.map((c) => c[0].data.kind)).not.toContain('completed');
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('gölge banlı hesap: tavan kısmadıysa void kredi başarı gibi yansır (ban sızdırılmaz)', async () => {
    mockMint.mockResolvedValue({ credited: 50, capped: false, status: 'void' });
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 50 });
    expect(r.creditedPoints).toBe(50);
  });

  it('indirim türü puan basmaz; yarışta kaybeden kabul mint çağırmaz', async () => {
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'discount', selectedValue: '10' });
    expect(r.creditedPoints).toBeNull();
    expect(mockMint).not.toHaveBeenCalled();

    mockOfferUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: '50' })
    ).rejects.toMatchObject({ code: 'NOT_PENDING' });
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('müşteri telafi görünürlüğü', () => {
  it('kaynağı moderasyonla kaldırılmış BEKLEYEN teklif listeden/sayaçtan düşer; geçmiş kayıtlar kalır', () => {
    const w = customerRemedyWhere('u1');
    expect(w.userId).toBe('u1');
    expect(w.status).toEqual({ in: ['pending', 'accepted', 'expired'] });
    expect(w.NOT).toEqual({
      status: 'pending',
      OR: [
        { feedback: { is: { deletedAt: { not: null } } } },
        { consumptionReview: { is: { deletedAt: { not: null } } } },
      ],
    });
  });

  it('özet sayacı aynı filtreyi kullanır', async () => {
    mockFeedbackAggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } });
    mockReviewAggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } });
    mockFeedbackCount.mockResolvedValue(0);
    mockReviewCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([]);
    mockConsumptionCount.mockResolvedValue(0);
    mockConsumptionFindMany.mockResolvedValue([]);
    mockOfferCount.mockResolvedValue(0);
    mockFeedbackGroupBy.mockResolvedValue([]);
    mockReviewGroupBy.mockResolvedValue([]);
    mockFeedbackFindMany.mockResolvedValue([]);
    await getVoiceSummary('u1').catch(() => null);
    expect(mockOfferCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'u1', status: 'pending', NOT: expect.objectContaining({ status: 'pending' }) }),
    });
  });
});
