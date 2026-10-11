/**
 * Ben → İlerleme sunucu katmanı (prisma mock'lu; DB'ye bağlanmaz).
 *  - Özet: count() ile gerçek sayılar, bölüm hatası `partial` (200 + sıfır yok), İstanbul serisi,
 *    katkı modülü kapalıyken bölüm yok, en yakın GERÇEK ödül.
 *  - Trendler: defter yoksa puan KPI'sı kıyassız, bölüm hatası partial, önceki 0 → "new".
 *  - Yolculuk: kaynak birleşimi, işletme yanıtı olayı, süzgeç yalnız ilgili kaynağı sorgular.
 */
const mockUser = { findUnique: jest.fn(), findMany: jest.fn() };
const mockReward = { findFirst: jest.fn(), count: jest.fn() };
const mockUserBadge = { count: jest.fn(), findMany: jest.fn() };
const mockConsumption = { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() };
const mockLedger = { aggregate: jest.fn(), findFirst: jest.fn() };
const mockQueryRaw = jest.fn();
const mockSettings = { findUnique: jest.fn() };
const mockProduct = { findMany: jest.fn() };
const mockFeedback = { findMany: jest.fn() };
const mockReview = { findMany: jest.fn() };
const mockUserReward = { findMany: jest.fn() };
const mockUserQuest = { findMany: jest.fn() };
const mockMoment = { findMany: jest.fn() };

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: mockUser,
    reward: mockReward,
    userBadge: mockUserBadge,
    consumption: mockConsumption,
    pointsLedger: mockLedger,
    settings: mockSettings,
    product: mockProduct,
    feedback: mockFeedback,
    consumptionReview: mockReview,
    userReward: mockUserReward,
    userQuest: mockUserQuest,
    customerMoment: mockMoment,
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
  },
  isPrismaConnectivityError: () => false,
}));
// jest `@prisma/client`'ı node_modules taslağına çözer; tsconfig yolu üretilmiş istemcidir
// (`Prisma.sql` / `Prisma.raw` orada). Yalnız SQL şablon yardımcıları için gerçek modül.
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn().mockResolvedValue(null),
  redisSetJson: jest.fn().mockResolvedValue(undefined),
  cachedJson: (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
}));

import { getProgressSummary, streakStateOf } from '@/components/customer/m-ben-ilerleme/server/summary';
import { computeProgressTrends } from '@/components/customer/m-ben-ilerleme/server/trends';
import { getJourneyPage } from '@/components/customer/m-ben-ilerleme/server/journey';

const NOW = new Date('2026-10-10T12:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSettings.findUnique.mockResolvedValue(null);
});

describe('getProgressSummary', () => {
  beforeEach(() => {
    mockUser.findUnique.mockResolvedValue({
      points: 420,
      level: 2,
      xp: 2000,
      createdAt: new Date('2025-03-01T10:00:00Z'),
      loginStreakCount: 6,
      loginStreakLongest: 9,
      loginStreakLastDay: new Date('2026-10-09T09:00:00Z'),
      loginStreakClaimedMilestones: [3],
    });
    mockReward.findFirst.mockResolvedValue({ id: 'rw1', name: 'Kahve', cost: 500 });
    mockReward.count.mockResolvedValue(2);
    mockUserBadge.count.mockResolvedValue(14);
    mockUserBadge.findMany.mockResolvedValue([
      { earnedAt: new Date('2026-10-01T10:00:00Z'), badge: { id: 'b1', name: 'Yeni Ses', icon: '/images/badges/YENİ SES.svg', rarity: 'RARE', color: '#ff00aa' } },
      { earnedAt: new Date('2026-09-01T10:00:00Z'), badge: { id: 'b2', name: 'Eski', icon: '🏆', rarity: 'common', color: 'red' } },
    ]);
    mockConsumption.count.mockResolvedValue(3);
    mockLedger.aggregate.mockResolvedValue({ _sum: { xpDelta: 300 } });
    mockQueryRaw.mockResolvedValue([
      { at: new Date('2026-10-08T10:00:00Z'), len: 150, flagged: false, replied: null },
      { at: new Date('2026-10-01T10:00:00Z'), len: 20, flagged: true, replied: new Date('2026-10-02T10:00:00Z') },
    ]);
  });

  it('doğru seviye, gerçek sayımlar, en yakın gerçek ödül, İstanbul serisi', async () => {
    const s = await getProgressSummary('u1', { contributionEnabled: true, now: NOW });
    expect(s.level).toMatchObject({ level: 2, xpIntoLevel: 1000, xpForLevel: 1500, percent: 66 });
    expect(s.points.nextReward).toEqual({ id: 'rw1', name: 'Kahve', cost: 500, remaining: 80 });
    expect(mockReward.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ cost: { gt: 420 }, archivedAt: null }) }));
    expect(s.badges.total).toBe(14); // eski uç take:10 ile 10'da kesiyordu
    expect(s.badges.recent[0]).toMatchObject({ id: 'b1', rarity: 'rare', color: '#ff00aa', emoji: null });
    expect(s.badges.recent[0].imageSrc).toBeTruthy();
    expect(s.badges.recent[1]).toMatchObject({ emoji: '🏆', imageSrc: null, color: null });
    expect(s.pendingReviews).toBe(3);
    expect(s.streak).toMatchObject({ state: 'at_risk', current: 6, longest: 9, nextMilestone: { days: 7, points: 150, remaining: 1 } });
    expect(s.daysToNextLevel).toBe(50); // 500 XP / (300/30)
    expect(s.contribution?.components.find((c) => c.key === 'detail')?.count).toBe(1);
    expect(s.contribution?.components.find((c) => c.key === 'impact')?.count).toBe(1);
    expect(s.partial).toEqual([]);
  });

  it('bir bölüm çökerse yalnız o işaretlenir (sıfır uydurulmaz)', async () => {
    mockReward.findFirst.mockRejectedValue(new Error('db'));
    mockUserBadge.count.mockRejectedValue(new Error('db'));
    const s = await getProgressSummary('u1', { contributionEnabled: true, now: NOW });
    expect(s.partial).toEqual(expect.arrayContaining(['rewards', 'badges']));
    expect(s.points.nextReward).toBeNull();
    expect(s.pendingReviews).toBe(3);
  });

  it('katkı modülü kapalıysa katkı sorgusu hiç çalışmaz', async () => {
    const s = await getProgressSummary('u1', { contributionEnabled: false, now: NOW });
    expect(s.contribution).toBeNull();
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('kullanıcı yoksa hata fırlatır', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    await expect(getProgressSummary('x', { contributionEnabled: true, now: NOW })).rejects.toThrow('Kullanıcı bulunamadı');
  });
});

describe('streakStateOf (İstanbul günü)', () => {
  it('bugün / dün / daha eski / hiç', () => {
    expect(streakStateOf(new Date('2026-10-10T05:00:00Z'), 4, 4, [], NOW).state).toBe('today');
    // UTC 21:30 dün = İstanbul bugün 00:30 → bugün sayıldı
    expect(streakStateOf(new Date('2026-10-09T21:30:00Z'), 4, 4, [], NOW).state).toBe('today');
    expect(streakStateOf(new Date('2026-10-09T08:00:00Z'), 4, 4, [], NOW)).toMatchObject({ state: 'at_risk', current: 4 });
    expect(streakStateOf(new Date('2026-10-01T08:00:00Z'), 4, 8, [], NOW)).toMatchObject({ state: 'broken', current: 0, longest: 8 });
    expect(streakStateOf(null, 0, 0, null, NOW)).toMatchObject({ state: 'none', current: 0 });
  });

  it('ödüllenmiş kilometre taşı atlanır', () => {
    expect(streakStateOf(new Date('2026-10-10T05:00:00Z'), 2, 2, [3, 7], NOW).nextMilestone).toMatchObject({ days: 14 });
  });
});

describe('computeProgressTrends', () => {
  it('KPI, seri ve İstanbul kovaları; önceki 0 → new', async () => {
    mockLedger.findFirst.mockResolvedValue({ createdAt: new Date('2026-01-01T00:00:00Z') });
    mockConsumption.groupBy.mockResolvedValue([{ productId: 'p1', _count: { _all: 4 } }]);
    mockProduct.findMany.mockResolvedValue([{ id: 'p1', name: 'Latte' }]);
    mockUser.findMany.mockResolvedValue([{ id: 'd1', name: 'X', businessName: 'Kafe', businessLogo: null }]);
    mockQueryRaw.mockImplementation((sql: { strings?: string[] }) => {
      const text = (sql?.strings ?? []).join('?');
      if (text.includes('"PointsLedger"') && text.includes('GROUP BY 1')) return Promise.resolve([{ k: '2026-10-10', earned: 120, xp: 60 }]);
      if (text.includes('"PointsLedger"')) return Promise.resolve([{ ec: 120, ep: 0, xc: 60, xp: 30, sc: 50 }]);
      if (text.includes('ISODOW')) return Promise.resolve([{ d: 6, h: 21, n: 3 }]);
      if (text.includes('lower("sentiment")')) return Promise.resolve([{ s: 'positive', n: 2, heard: 1 }, { s: null, n: 1, heard: 0 }]);
      if (text.includes('kind = \'visit\'')) return Promise.resolve([{ dealerId: 'd1', visits: 2, reviews: 1, avg: 4, last: new Date('2026-10-09T10:00:00Z') }]);
      if (text.includes('WITH r AS')) return Promise.resolve([{ rc: 3, rp: 0, vc: 2, vp: 4, pc: 1, pp: 1 }]);
      if (text.includes('"Consumption"')) return Promise.resolve([{ k: '2026-10-09', n: 2 }]);
      return Promise.resolve([{ k: '2026-10-10', n: 3 }]);
    });

    const t = await computeProgressTrends('u1', 7, NOW);
    expect(t.keys).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
    const kpi = Object.fromEntries(t.kpis.map((k) => [k.key, k]));
    expect(kpi.reviews).toMatchObject({ current: 3, previous: 0, change: { kind: 'new' } });
    expect(kpi.visits).toMatchObject({ current: 2, previous: 4, change: { kind: 'pct', value: -50 } });
    expect(kpi.pointsEarned.current).toBe(120);
    expect(t.series.reviews[6]).toBe(3);
    expect(t.series.visits[5]).toBe(2);
    expect(t.series.pointsEarned?.[6]).toBe(120);
    expect(t.pointsSpent).toBe(50);
    expect(t.experience).toEqual({ positive: 2, neutral: 0, negative: 0, pending: 1, heard: 1 });
    expect(t.places?.[0]).toMatchObject({ dealerId: 'd1', name: 'Kafe', visits: 2, avgRating: 4 });
    expect(t.topProducts).toEqual([{ id: 'p1', name: 'Latte', count: 4 }]);
    expect(t.partial).toEqual([]);
    // SQL İstanbul saatine çeviriyor (UTC kovası değil)
    const allSql = mockQueryRaw.mock.calls.map((c) => (c[0]?.strings ?? []).join('?') + JSON.stringify(c[0]?.values ?? [])).join('\n');
    expect(allSql).toContain("AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'");
  });

  it('defter dönemden sonra başladıysa puan kıyası yapılmaz; bölüm hatası partial', async () => {
    mockLedger.findFirst.mockResolvedValue({ createdAt: new Date('2026-10-08T00:00:00Z') });
    mockConsumption.groupBy.mockResolvedValue([]);
    mockQueryRaw.mockImplementation((sql: { strings?: string[] }) => {
      const text = (sql?.strings ?? []).join('?');
      if (text.includes('ISODOW')) return Promise.reject(new Error('timeout'));
      if (text.includes('"PointsLedger"') && text.includes('GROUP BY 1')) return Promise.resolve([]);
      if (text.includes('"PointsLedger"')) return Promise.resolve([{ ec: 10, ep: 0, xc: 5, xp: 0, sc: 0 }]);
      if (text.includes('WITH r AS')) return Promise.resolve([{ rc: 0, rp: 0, vc: 0, vp: 0, pc: 0, pp: 0 }]);
      return Promise.resolve([]);
    });
    const t = await computeProgressTrends('u1', 30, NOW);
    const pts = t.kpis.find((k) => k.key === 'pointsEarned')!;
    expect(pts.previous).toBeNull();
    expect(pts.change).toEqual({ kind: 'none' });
    expect(t.ledgerSince).toBe('2026-10-08');
    expect(t.habits).toBeNull();
    expect(t.partial).toContain('habits');
  });
});

describe('getJourneyPage', () => {
  const at = (iso: string) => new Date(iso);
  beforeEach(() => {
    for (const m of [mockFeedback, mockReview, mockUserBadge, mockUserReward, mockConsumption, mockUserQuest, mockMoment]) m.findMany.mockResolvedValue([]);
  });

  it('tüketim yorumu ve işletme yanıtı da akışta; yapısal veri, tıklanabilir hedef', async () => {
    mockReview.findMany
      .mockResolvedValueOnce([{ id: 'r1', rating: 2, createdAt: at('2026-10-05T10:00:00Z'), consumptionId: 'c1', consumption: { dealer: { businessName: 'Kafe', name: null } } }])
      .mockResolvedValueOnce([{ id: 'r1', dealerRepliedAt: at('2026-10-06T10:00:00Z'), consumptionId: 'c1', consumption: { dealer: { businessName: 'Kafe', name: null } } }]);
    mockMoment.findMany.mockResolvedValue([
      { id: 'm1', kind: 'level_up', payload: { from: 2, to: 3, xp: 2600 }, createdAt: at('2026-10-07T10:00:00Z') },
      { id: 'm2', kind: 'level_up', payload: { bozuk: true }, createdAt: at('2026-10-07T09:00:00Z') },
    ]);
    const page = await getJourneyPage('u1', { filter: 'all' });
    expect(page.items.map((e) => e.type)).toEqual(['level', 'heard', 'review']);
    const review = page.items.find((e) => e.type === 'review')!;
    expect(review).toMatchObject({ href: '/customer/me/voices?id=cs-c1', data: { rating: 2, place: 'Kafe', source: 'consumption' } });
    expect(page.items.find((e) => e.type === 'level')?.href).toBeNull();
    expect(page.nextCursor).toBeNull();
  });

  it('süzgeç yalnız ilgili kaynakları sorgular ve oturum kullanıcısıyla sınırlar', async () => {
    await getJourneyPage('u1', { filter: 'badges' });
    expect(mockUserBadge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }));
    expect(mockFeedback.findMany).not.toHaveBeenCalled();
    expect(mockConsumption.findMany).not.toHaveBeenCalled();
  });
});
