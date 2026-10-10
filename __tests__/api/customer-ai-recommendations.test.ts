/**
 * P0-39 (müşteri · AI öneriler): çökme + sınırsız LLM.
 *
 * Yeniden üretilen senaryolar:
 *  - 1 yazılı geri bildirimli müşteri: eski uç `stats: { totalFeedbacks }` döndürüyordu ve
 *    istemci `stats.topBusinesses.length` ile çöküyordu → artık stats tam şekilli + status.
 *  - Döngüyle 500 istek: eski uç her GET'te askAI çağırıyordu → artık aynı külliyat için
 *    tek LLM çağrısı (önbellek), kota dolunca LLM çağrılmaz.
 *  - askAI hata metni ("Bir hata oluştu…") öneri gibi dönmez ve önbelleğe yazılmaz.
 *  - Silinmiş (soft-delete) geri bildirimler sorguya girmez; DEALER erişemez; modül kapısı.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: { feedback: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
  isPrismaConnectivityError: () => false,
}));

const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (...args: unknown[]) => mockRateLimit(...args),
}));

const redisStore = new Map<string, unknown>();
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async (k: string) => (redisStore.has(k) ? redisStore.get(k) : null)),
  redisSetJson: jest.fn(async (k: string, v: unknown) => {
    redisStore.set(k, v);
  }),
}));

const mockAskAI = jest.fn();
jest.mock('@/lib/ai-engine', () => ({
  askAI: (...args: unknown[]) => mockAskAI(...args),
}));

const mockModuleGate = jest.fn();
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: (...args: unknown[]) => mockModuleGate(...args),
}));

jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

import { GET } from '@/app/api/customer/ai-recommendations/route';
import { resetRecommendationMemoryCache } from '@/app/api/customer/ai-recommendations/cache';
import {
  computeRecommendationStats,
  corpusFingerprint,
  normalizeAskAiResult,
  redactContactInfo,
  sentimentPercentages,
  type RecommendationFeedbackRow,
} from '@/app/api/customer/ai-recommendations/core';

const customer = { session: { user: { id: 'cust-1', role: 'CUSTOMER' }, expires: '2099-01-01' } };

function row(i: number, over: Partial<RecommendationFeedbackRow> = {}): RecommendationFeedbackRow {
  return {
    id: `fb-${i}`,
    text: `Yorum ${i}`,
    rating: 4,
    sentiment: 'positive',
    topics: ['lezzet'],
    urgency: 0.2,
    effortScore: 0.3,
    churnRisk: 0.1,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, i)),
    updatedAt: new Date(Date.UTC(2026, 9, 1, 12, i)),
    qrCode: { name: 'Masa 1', dealer: { businessName: 'Kahve Evi' } },
    ...over,
  };
}

function call() {
  return GET(new NextRequest('http://localhost/api/customer/ai-recommendations'), {});
}

beforeEach(() => {
  jest.clearAllMocks();
  redisStore.clear();
  resetRecommendationMemoryCache();
  mockRequireAuth.mockResolvedValue(customer);
  mockRateLimit.mockResolvedValue({ ok: true, remaining: 10 });
  mockModuleGate.mockResolvedValue(null);
  mockAskAI.mockResolvedValue('- Öneri bir\n- Öneri iki');
});

describe('GET /api/customer/ai-recommendations', () => {
  it('1 geri bildirimde çökmez: stats tam şekilli, status=insufficient, LLM çağrılmaz', async () => {
    mockFindMany.mockResolvedValue([row(1)]);
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('insufficient');
    expect(body.recommendations).toBeNull();
    expect(body.have).toBe(1);
    expect(body.required).toBe(2);
    expect(typeof body.message).toBe('string');
    // Eski çökme: stats.topBusinesses undefined idi.
    expect(Array.isArray(body.stats.topBusinesses)).toBe(true);
    expect(Array.isArray(body.stats.topTopics)).toBe(true);
    expect(body.stats.sentimentDist).toEqual(expect.objectContaining({ positive: expect.any(Number) }));
    expect(['up', 'down', 'stable']).toContain(body.stats.ratingTrend);
    // Zarf v2 de dolu.
    expect(body.data.stats.topBusinesses).toEqual(body.stats.topBusinesses);
    expect(mockAskAI).not.toHaveBeenCalled();
  });

  it('0 geri bildirimde de tam şekilli stats döner', async () => {
    mockFindMany.mockResolvedValue([]);
    const body = await (await call()).json();
    expect(body.status).toBe('insufficient');
    expect(body.stats.totalFeedbacks).toBe(0);
    expect(body.stats.topBusinesses).toEqual([]);
  });

  it('boş metinli kayıtlar yeterli veri sayılmaz', async () => {
    mockFindMany.mockResolvedValue([row(1), row(2, { text: '   ' })]);
    const body = await (await call()).json();
    expect(body.status).toBe('insufficient');
    expect(body.have).toBe(1);
  });

  it('silinmiş geri bildirimleri sorgudan dışlar ve yalnız kendi kayıtlarını okur', async () => {
    mockFindMany.mockResolvedValue([row(1), row(2)]);
    await call();
    const args = mockFindMany.mock.calls[0][0];
    expect(args.where).toEqual(expect.objectContaining({ userId: 'cust-1', deletedAt: null }));
  });

  it('aynı külliyat için 50 istek = 1 LLM çağrısı (önbellek)', async () => {
    mockFindMany.mockResolvedValue([row(1), row(2), row(3)]);
    const first = await (await call()).json();
    expect(first.recommendationsStatus).toBe('ready');
    expect(first.recommendations).toContain('Öneri bir');
    expect(first.cached).toBe(false);
    for (let i = 0; i < 49; i++) {
      const b = await (await call()).json();
      expect(b.recommendations).toContain('Öneri bir');
      expect(b.cached).toBe(true);
    }
    expect(mockAskAI).toHaveBeenCalledTimes(1);
  });

  it('eşzamanlı ıskalar tek LLM çağrısında birleşir', async () => {
    mockFindMany.mockResolvedValue([row(1), row(2)]);
    let release: (v: string) => void = () => {};
    mockAskAI.mockImplementation(() => new Promise<string>((r) => (release = r)));
    const p1 = call();
    const p2 = call();
    await new Promise((r) => setTimeout(r, 10));
    release('- Tek öneri');
    const [a, b] = await Promise.all([p1, p2]);
    expect((await a.json()).recommendations).toBe('- Tek öneri');
    expect((await b.json()).recommendations).toBe('- Tek öneri');
    expect(mockAskAI).toHaveBeenCalledTimes(1);
  });

  it('yeni geri bildirim gelince önbellek geçersizleşir', async () => {
    mockFindMany.mockResolvedValueOnce([row(1), row(2)]);
    await call();
    mockFindMany.mockResolvedValueOnce([row(3), row(1), row(2)]);
    await call();
    expect(mockAskAI).toHaveBeenCalledTimes(2);
  });

  it('LLM kotası dolunca askAI çağrılmaz, stats yine döner (rate_limited)', async () => {
    mockFindMany.mockResolvedValue([row(1), row(2)]);
    mockRateLimit.mockImplementation(async (bucket: string) =>
      bucket.startsWith('ai_rec_llm:h:') ? { ok: false, retryAfterMs: 120_000 } : { ok: true }
    );
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendationsStatus).toBe('rate_limited');
    expect(body.recommendations).toBeNull();
    expect(body.retryAfterSec).toBe(120);
    expect(Array.isArray(body.stats.topBusinesses)).toBe(true);
    expect(mockAskAI).not.toHaveBeenCalled();
  });

  it('kota sayacı hata verirse kapalı başarısız olur (LLM çağrılmaz)', async () => {
    mockFindMany.mockResolvedValue([row(1), row(2)]);
    mockRateLimit.mockImplementation(async (bucket: string) => {
      if (bucket.startsWith('ai_rec_llm:')) throw new Error('db down');
      return { ok: true };
    });
    const body = await (await call()).json();
    expect(body.recommendationsStatus).toBe('rate_limited');
    expect(mockAskAI).not.toHaveBeenCalled();
  });

  it('okuma tavanı aşılınca 429 döner', async () => {
    mockRateLimit.mockImplementation(async (bucket: string) =>
      bucket.startsWith('route:') ? { ok: false, retryAfterMs: 30_000 } : { ok: true }
    );
    const res = await call();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('askAI hata metni öneri sayılmaz ve önbelleğe yazılmaz', async () => {
    mockFindMany.mockResolvedValue([row(1), row(2)]);
    mockAskAI.mockResolvedValueOnce('Bir hata oluştu. Lütfen tekrar deneyin.');
    const body = await (await call()).json();
    expect(body.recommendationsStatus).toBe('unavailable');
    expect(body.recommendations).toBeNull();
    expect(redisStore.size).toBe(0);
    mockAskAI.mockResolvedValueOnce('- Gerçek öneri');
    const again = await (await call()).json();
    expect(again.recommendations).toBe('- Gerçek öneri');
  });

  it('DEALER erişemez (403) ve LLM/DB çağrılmaz', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    mockRequireAuth.mockResolvedValue({ error: forbidden });
    const res = await call();
    expect(res.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockAskAI).not.toHaveBeenCalled();
  });

  it('modül kapalıyken 403 MODULE_DISABLED', async () => {
    mockModuleGate.mockResolvedValue(new Response('{}', { status: 403 }));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(mockModuleGate.mock.calls[0][0]).toBe('customer_ai_insights');
    expect(mockAskAI).not.toHaveBeenCalled();
  });

  it('LLM istemi işletme triyaj metriklerini içermez, metinlerden iletişim bilgisi çıkarılır', async () => {
    mockFindMany.mockResolvedValue([row(1, { text: 'Beni 0532 123 45 67 ara, ali@ornek.com' }), row(2)]);
    await call();
    const [question, context] = mockAskAI.mock.calls[0];
    expect(question).not.toMatch(/aciliyet|efor|churn|kayıp riski/i);
    expect(question).toMatch(/MÜŞTERİ/);
    const texts = context.recentFeedbacks.map((f: { text: string }) => f.text).join(' ');
    expect(texts).not.toContain('ali@ornek.com');
    expect(texts).not.toContain('123 45 67');
  });
});

describe('ai-recommendations core', () => {
  it('trend en az 3+3 kayıt olmadan güvenilir sayılmaz', () => {
    const s = computeRecommendationStats([row(1, { rating: 5 }), row(2, { rating: 1 })]);
    expect(s.trendReliable).toBe(false);
    expect(s.ratingTrend).toBe('stable');
    const up = computeRecommendationStats([
      ...[1, 2, 3].map((i) => row(i, { rating: 5 })),
      ...[4, 5, 6].map((i) => row(i, { rating: 2 })),
    ]);
    expect(up.trendReliable).toBe(true);
    expect(up.ratingTrend).toBe('up');
  });

  it('duygu yüzdeleri toplamı 100', () => {
    const p = sentimentPercentages({ positive: 1, negative: 1, neutral: 1 });
    expect(p.positive + p.negative + p.neutral).toBe(100);
    expect(sentimentPercentages({ positive: 0, negative: 0, neutral: 0 })).toEqual({ positive: 0, negative: 0, neutral: 0 });
  });

  it('parmak izi kayıt güncellenince değişir', () => {
    const a = corpusFingerprint([row(1), row(2)]);
    const b = corpusFingerprint([row(1), row(2, { updatedAt: new Date(Date.UTC(2026, 9, 2)) })]);
    expect(a).not.toBe(b);
    expect(corpusFingerprint([row(1), row(2)])).toBe(a);
  });

  it('askAI sonucu ayrıştırılır (metin / {ok,text} / hata)', () => {
    expect(normalizeAskAiResult('- a')).toEqual({ ok: true, text: '- a' });
    expect(normalizeAskAiResult({ ok: true, text: '- b' })).toEqual({ ok: true, text: '- b' });
    expect(normalizeAskAiResult({ ok: false, reason: 'error' }).ok).toBe(false);
    expect(normalizeAskAiResult(null).ok).toBe(false);
    expect(normalizeAskAiResult('AI asistanı şu anda kullanılamıyor.').ok).toBe(false);
    expect(normalizeAskAiResult('Bu mesaj güvenlik nedeniyle işlenemiyor.').ok).toBe(false);
  });

  it('iletişim bilgisi maskelenir', () => {
    expect(redactContactInfo('mail: x.y@z.com')).toBe('mail: [e-posta]');
    expect(redactContactInfo('tel +90 532 123 45 67')).not.toMatch(/532/);
    expect(redactContactInfo('Kart 4111 1111 1111 1111')).toContain('[numara]');
    expect(redactContactInfo('Kahve 3 kez içtim')).toBe('Kahve 3 kez içtim');
  });
});
