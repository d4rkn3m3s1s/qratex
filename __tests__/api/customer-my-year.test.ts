/**
 * GET /api/customer/my-year — sunucu özeti (gerçek DB'ye gidilmez; prisma mock).
 *
 *  1. Yalnız CUSTOMER (defineRoute → requireAuth(['CUSTOMER'])), userId oturumdan.
 *  2. Geçersiz sorgu → 400 VALIDATION; gelecek yıl → varsayılan dönem + adjusted.
 *  3. Doğruluk: yanıt oranı yorum/yorum; birleşik yorum SQL'i (Feedback + ConsumptionReview,
 *     ikisinde deletedAt IS NULL); puan defteri iade/ters kayıt hariç; eski olaylar ledgerId'siz
 *     ve iade kategorisi hariç; dönem sınırları İstanbul.
 *  4. Lig yolculuğu: defter bakiyeleri + An Motoru anlarından; tablo yoksa bölüm boş, hata DEĞİL.
 *  5. Kapanmış dönem önbelleğe alınır, süren dönem alınmaz.
 */
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

// Test ortamında üretilmiş istemci yok: SQL şablon yardımcıları Prisma çalışma zamanından.
jest.mock('@prisma/client', () => {
  const r = jest.requireActual('@prisma/client/runtime/library');
  return { Prisma: { sql: r.sqltag, join: r.join, raw: r.raw, empty: r.empty, Sql: r.Sql } };
});

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));

const mockCached = jest.fn();
jest.mock('@/lib/redis', () => ({
  cachedJson: (key: string, ttl: number, fetcher: () => Promise<unknown>) => {
    mockCached(key, ttl);
    return fetcher();
  },
}));

type RawHandler = (sql: string, values: unknown[]) => unknown[];
const raw: { handler: RawHandler; calls: Array<{ sql: string; values: unknown[] }> } = { handler: () => [], calls: [] };

const db = {
  user: { findUnique: jest.fn() },
  settings: { findUnique: jest.fn(async () => null) },
  userBadge: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
  customerMoment: { findMany: jest.fn(async () => [] as unknown[]) },
  squadBattleParticipant: { findMany: jest.fn(async () => [] as unknown[]) },
  $queryRaw: jest.fn(async (q: Prisma.Sql) => {
    raw.calls.push({ sql: q.sql, values: q.values });
    return raw.handler(q.sql, q.values);
  }),
};
jest.mock('@/lib/prisma', () => ({
  prisma: db,
  default: db,
  isPrismaConnectivityError: () => false,
}));

const NOW = new Date('2026-10-10T12:00:00Z');

function get(qs = '') {
  return new NextRequest(`http://localhost/api/customer/my-year${qs}`, { method: 'GET' });
}
async function call(qs = '') {
  const { GET } = await import('@/app/api/customer/my-year/route');
  const res: Response = await GET(get(qs), {});
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

function defaultHandler(sql: string): unknown[] {
  if (sql.includes('"respondingDealers"')) {
    return [{ total: 10, previousTotal: 2, average: 4.36, replied: 10, respondingDealers: 1, r1: 0, r2: 0, r3: 1, r4: 4, r5: 5 }];
  }
  if (sql.includes('"placeCount"')) {
    return [
      { dealerId: 'd1', visits: 6, reviews: 10, businessName: 'Kafe Mor', name: null, businessLogo: null, businessCategory: 'cafe', placeCount: 2 },
      { dealerId: 'd2', visits: 1, reviews: 0, businessName: null, name: 'Fırın', businessLogo: 'https://x/l.png', businessCategory: null, placeCount: 2 },
    ];
  }
  if (sql.includes('Europe/Istanbul')) {
    return [
      { day: '2026-03-01', n: 2, morning: 0, noon: 0, evening: 2, night: 0 },
      { day: '2026-03-02', n: 1, morning: 0, noon: 1, evening: 0, night: 0 },
      { day: '2026-05-10', n: 3, morning: 0, noon: 0, evening: 3, night: 0 },
    ];
  }
  if (sql.includes('btrim')) {
    return [{ dealerId: 'd1', text: 'Geri bildirimin için teşekkürler, menüyü güncelledik!', at: new Date('2026-04-01T10:00:00Z'), businessName: 'Kafe Mor', name: null }];
  }
  if (sql.includes('"PointsLedger" l')) {
    return [{ earned: 900, peak: 5200, startBalance: 2500, endBalance: 4800 }];
  }
  if (sql.includes('"AnalyticsEvent"')) return [{ total: 150 }];
  if (sql.includes('"previousTotal"')) return [{ total: 7, previousTotal: 3 }]; // ziyaret
  return [];
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'queueMicrotask'] });
  jest.clearAllMocks();
  raw.calls = [];
  raw.handler = defaultHandler;
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
  db.user.findUnique.mockResolvedValue({ createdAt: new Date('2024-05-20T10:00:00Z'), points: 4800, level: 9 });
  db.userBadge.count.mockResolvedValue(2);
  db.userBadge.findMany.mockResolvedValue([
    { earnedAt: new Date('2026-02-01T10:00:00Z'), badge: { id: 'b1', name: 'İlk Yorum', icon: '🏆', rarity: 'rare', color: null } },
  ] as never);
  db.customerMoment.findMany.mockResolvedValue([
    { kind: 'league_up', payload: { fromKey: 'BASLANGIC', fromName: 'Başlangıç', toKey: 'KOR', toName: 'Kor', points: 3100 }, createdAt: new Date('2026-06-01T10:00:00Z') },
    { kind: 'level_up', payload: { from: 6, to: 7, xp: 700 }, createdAt: new Date('2026-04-01T10:00:00Z') },
    { kind: 'level_up', payload: { from: 7, to: 9, xp: 900 }, createdAt: new Date('2026-08-01T10:00:00Z') },
  ]);
  db.squadBattleParticipant.findMany.mockResolvedValue([
    { squadId: 's1', battle: { winnerId: 's1', status: 'completed' } },
    { squadId: 's1', battle: { winnerId: 's2', status: 'completed' } },
    { squadId: 's1', battle: { winnerId: null, status: 'active' } },
  ]);
});

afterEach(() => jest.useRealTimers());

describe('GET /api/customer/my-year', () => {
  it('yalnız CUSTOMER rolüyle ve oturumdaki kullanıcıyla çalışır', async () => {
    const { status } = await call('?year=2026');
    expect(status).toBe(200);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    for (const c of raw.calls) expect(c.values).toContain('u1');
  });

  it('yetkisiz → zarf v2 hata (200 + sıfırlar değil)', async () => {
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const { status, body } = await call();
    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('geçersiz sorgu → 400 VALIDATION', async () => {
    const { status, body } = await call('?year=20x6');
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION');
  });

  it('gelecek yıl → varsayılan dönem, adjusted=true', async () => {
    const { body } = await call('?year=2031');
    expect(body.data.period.year).toBe(2026);
    expect(body.data.adjusted).toBe(true);
  });

  it('özet doğru hesaplanır', async () => {
    const { body } = await call('?year=2026');
    const d = body.data;
    // Dönem İstanbul.
    expect(d.period.startIso).toBe('2025-12-31T21:00:00.000Z');
    expect(d.period.isCurrent).toBe(true);
    // Yanıt oranı yorum/yorum: 10 yorumun 10'u → %100 (eski kod 1/10 = %10 diyordu).
    expect(d.impact).toMatchObject({ repliedReviews: 10, replyRate: 100, respondingDealers: 1 });
    expect(d.impact.quote.dealerName).toBe('Kafe Mor');
    expect(d.reviews).toMatchObject({ total: 10, previousTotal: 2, average: 4.4, mostGiven: 5, distribution: [0, 0, 1, 4, 5] });
    // Ziyaret + aktif gün + seri.
    expect(d.visits).toMatchObject({ total: 7, previousTotal: 3, activeDays: 3, longestStreak: 2, places: 2 });
    // Favori: ziyaret ve yorum ayrı.
    expect(d.favorites[0]).toMatchObject({ dealerId: 'd1', name: 'Kafe Mor', visits: 6, reviews: 10 });
    expect(d.favorites[1]).toMatchObject({ name: 'Fırın', logo: 'https://x/l.png' });
    // Puan: defter + eski olaylar.
    expect(d.points.earned).toBe(1050);
    // Lig yolculuğu: başlangıç 2500 → Başlangıç; şu an 4800 → Kor; zirve 5200 → Veyra.
    expect(d.journey.startLeague).toEqual({ key: 'BASLANGIC', name: 'Başlangıç' });
    expect(d.journey.endLeague).toEqual({ key: 'KOR', name: 'Kor' });
    expect(d.journey.peakLeague).toEqual({ key: 'VEYRA', name: 'Veyra' });
    expect(d.journey.leagueUps).toHaveLength(1);
    expect(d.journey).toMatchObject({ levelFrom: 6, levelTo: 9, levelUps: 2 });
    // Klan: 3 katılım, 1 zafer (eski kod katılımı "battlesWon" diye adlandırıyordu).
    expect(d.squads).toEqual({ battles: 3, wins: 1 });
    // Ritim + kovalar.
    expect(d.rhythm.peak).toBe('evening');
    expect(d.activity.unit).toBe('month');
    expect(d.activity.buckets[2]).toBe(3);
    expect(d.activity.buckets[4]).toBe(3);
    expect(d.badges.total).toBe(2);
    expect(d.hasActivity).toBe(true);
  });

  it('SQL: birleşik yorum, soft-delete, iade/ters kayıt ve eski olay filtreleri', async () => {
    await call('?year=2026');
    const agg = raw.calls.find((c) => c.sql.includes('"respondingDealers"'))!;
    expect(agg.sql).toContain('"Feedback" f');
    expect(agg.sql).toContain('"ConsumptionReview" cr');
    expect(agg.sql).toContain('f."deletedAt" IS NULL');
    expect(agg.sql).toContain('cr."deletedAt" IS NULL');
    expect(agg.sql).toMatch(/COUNT\(\*\) FILTER \(WHERE at >= (\$\d+|\?)\)::int AS total/);
    const ledger = raw.calls.find((c) => c.sql.includes('"PointsLedger" l'))!;
    expect(ledger.values).toEqual(expect.arrayContaining(['squad_escrow_refund', 'reversal', 'opening_balance']));
    expect(ledger.sql).toContain(`"status" = 'posted'`);
    const legacy = raw.calls.find((c) => c.sql.includes('"AnalyticsEvent"'))!;
    expect(legacy.sql).toContain(`("data"->'ledgerId') IS NULL`);
    expect(legacy.sql).toContain(`jsonb_typeof("data"->'points') = 'number'`);
    expect(legacy.values).toEqual(expect.arrayContaining(['squad_battle_refund', 'squad_escrow_refund']));
    expect(raw.calls.some((c) => c.sql.includes('points_spent'))).toBe(false);
  });

  it('defter/an tablosu henüz yoksa bölüm boş kalır, uç 500 vermez', async () => {
    db.customerMoment.findMany.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2021' }));
    raw.handler = (sql) => {
      if (sql.includes('"PointsLedger" l')) throw Object.assign(new Error('relation "PointsLedger" does not exist'), { code: 'P2010', meta: { code: '42P01' } });
      return defaultHandler(sql);
    };
    const { status, body } = await call('?year=2026');
    expect(status).toBe(200);
    expect(body.data.journey.leagueUps).toEqual([]);
    expect(body.data.journey.startLeague).toBeNull();
    expect(body.data.journey.endLeague).toEqual({ key: 'KOR', name: 'Kor' }); // süren dönem: bugünkü bakiye
    expect(body.data.points.earned).toBe(150);
  });

  it('beklenmeyen DB hatası görünür (500), sıfırlarla gizlenmez', async () => {
    raw.handler = (sql) => {
      if (sql.includes('"respondingDealers"')) throw new Error('boom');
      return defaultHandler(sql);
    };
    const { status, body } = await call('?year=2026');
    expect(status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('kapanmış dönem önbelleğe alınır, süren dönem alınmaz', async () => {
    await call('?year=2026');
    expect(mockCached).not.toHaveBeenCalled();
    await call('?year=2025');
    expect(mockCached).toHaveBeenCalledWith('my-year:v1:u1:2025', 21600);
  });

  it('ay seçimi: kovalar günlük, kıyas önceki ay', async () => {
    const { body } = await call('?year=2026&month=3');
    expect(body.data.period).toMatchObject({ month: 3, key: '2026-03', days: 31, isClosed: true });
    expect(body.data.previous).toEqual({ year: 2026, month: 2, key: '2026-02' });
    expect(body.data.activity.unit).toBe('day');
    expect(body.data.activity.buckets).toHaveLength(31);
    expect(body.data.activity.buckets[0]).toBe(2);
  });
});
