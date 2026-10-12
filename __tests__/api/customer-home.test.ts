/**
 * `GET /api/customer/home` — Müşteri Ana Sayfa BFF'i.
 *
 *  - Yalnız CUSTOMER (requireAuth DB'den); başka rol 403 ve DB'ye dokunulmaz.
 *  - Her kullanıcı sorgusu oturumdaki kullanıcıyla sınırlı; sıra sayıları yalnız sayı.
 *  - Seri gerçek alandan (sabit 0 yok); lig kuralları DB'den; ödül hedefi stok/geçerliliğe uyar.
 *  - Kapalı modül (ödüller) sorgulanmaz ve listede görünmez.
 *  - DB hatası görünür hata döner (503/500) — "200 + sıfırlar" yok.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 100 }) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

const mockConnectivity = jest.fn(() => false);
const db = {
  // Kullanıcıya özel sayaçlar tek ham sorguda (lib/customer-home/load.ts → loadUserFacts).
  $queryRaw: jest.fn(),
  user: { findUnique: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  analyticsEvent: { findMany: jest.fn() },
  reward: { findMany: jest.fn() },
  consumption: { count: jest.fn() },
  userSurpriseBox: { count: jest.fn(), findFirst: jest.fn() },
  userReward: { count: jest.fn() },
  remedyOffer: { count: jest.fn() },
  feedback: { findFirst: jest.fn() },
  consumptionReview: { findFirst: jest.fn() },
  dailySpin: { findUnique: jest.fn() },
  miniGameSession: { findFirst: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: (e: unknown) => mockConnectivity(e) }));

const mockModuleControls = jest.fn();
jest.mock('@/lib/module-gate', () => ({ getModuleControls: () => mockModuleControls() }));

const ALL_ROUTE_IDS = ['customer.wallet.rewards', 'customer.wallet.owned', 'customer.leaderboard', 'customer.games', 'customer.me.voices'];
const mockShell = jest.fn();
jest.mock('@/lib/navigation/get-shell-config', () => ({ getShellConfig: () => mockShell() }));

jest.mock('@/lib/league-rules', () => ({
  getLeagueRules: jest.fn().mockResolvedValue([
    { key: 'BASLANGIC', name: 'Başlangıç', minPoints: 0, maxPoints: 2999, gradient: '' },
    { key: 'KOR', name: 'Kor', minPoints: 3000, maxPoints: 5000, gradient: '' },
    { key: 'ZENOR', name: 'Zenor', minPoints: 5001, maxPoints: 100000, gradient: '' },
  ]),
}));

const mockMatrix = jest.fn();
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: () => mockMatrix(),
  getSpinRules: (m: { spin: unknown }) => m.spin,
}));
jest.mock('@/lib/login-streak', () => ({
  LOGIN_STREAK_MILESTONES: [
    { days: 3, points: 50 },
    { days: 7, points: 150 },
  ],
  normalizeLoginStreakMilestones: (raw: Array<{ days: number; points: number }>) => raw,
}));

import { GET } from '@/app/api/customer/home/route';
import { istanbulDay } from '@/components/ds/page/date-range';

const customer = { session: { user: { id: 'cust-1', role: 'CUSTOMER' }, expires: '2099-01-01' } };

function get() {
  return GET(new NextRequest('http://localhost/api/customer/home'), {});
}

function facts(over: Record<string, unknown> = {}) {
  return {
    pendingReviews: 2,
    unopenedBoxes: 1,
    readyRewards: 0,
    pendingRemedy: 1,
    feedbackToday: false,
    reviewToday: false,
    anyFeedback: false,
    anyReview: false,
    spinCount: 1,
    boxOpenedToday: false,
    gameToday: false,
    ...over,
  };
}

/** `$queryRaw` etiketli şablon çağrısı → [SQL metni, parametreler]. */
function rawCall(i = 0): [string, unknown[]] {
  const [strings, ...values] = db.$queryRaw.mock.calls[i] as [TemplateStringsArray, ...unknown[]];
  return [strings.join('?'), values];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(customer);
  mockConnectivity.mockReturnValue(false);
  mockModuleControls.mockResolvedValue({});
  mockShell.mockResolvedValue({ palette: ALL_ROUTE_IDS.map((id) => ({ id })), bottomTabs: [] });
  mockMatrix.mockResolvedValue({
    spin: {
      enabled: true,
      dailyLimit: 1,
      prizes: [
        { id: 'p10', label: '10 Puan', type: 'points', value: 10, weight: 50 },
        { id: 'none', label: 'Tekrar dene', type: 'nothing', value: 0, weight: 50 },
      ],
    },
  });
  db.user.findUnique.mockResolvedValue({
    name: 'Ayşe Yılmaz',
    image: null,
    points: 3200,
    xp: 1200,
    customFrameColor: null,
    loginStreakCount: 4,
    loginStreakLongest: 6,
    loginStreakLastDay: new Date(),
    loginStreakClaimedMilestones: [3],
    equippedCosmetics: [
      { cosmetic: { type: 'avatar_frame', imageUrl: 'fire_effect' } },
      { cosmetic: { type: 'profile_background', imageUrl: 'bg-purple-500' } },
    ],
  });
  db.user.count.mockResolvedValueOnce(6).mockResolvedValueOnce(120);
  db.user.findFirst.mockResolvedValue({ points: 3260 });
  db.analyticsEvent.findMany.mockResolvedValue([{ data: { points: 40 } }, { data: { points: 25 } }]);
  db.reward.findMany.mockResolvedValue([
    { id: 'r1', name: 'Kurabiye', icon: '🍪', cost: 1000, stock: -1, metadata: null },
    { id: 'r2', name: 'Kahve', icon: '/img/kahve.png', cost: 3500, stock: 5, metadata: null },
  ]);
  db.$queryRaw.mockResolvedValue([facts()]);
});

describe('GET /api/customer/home', () => {
  it('yalnız CUSTOMER; başka rol 403 ve DB okunmaz', async () => {
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const res = await get();
    expect(res.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('gerçek veriden tek yanıt: bakiye, seviye, seri, hedefler, bekleyenler, lig, çark', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    const { data } = await res.json();

    expect(data.today).toBe(istanbulDay(new Date()));
    expect(data.profile).toEqual({ name: 'Ayşe Yılmaz', image: null, frameId: 'fire_effect', frameColor: null, backgroundUrl: null });
    expect(data.level).toEqual({ level: 2, xp: 1200, intoLevel: 200, levelSpan: 1500 });
    expect(data.wallet).toEqual({
      points: 3200,
      affordableRewards: 1,
      nextReward: { id: 'r2', name: 'Kahve', cost: 3500, image: '/img/kahve.png' },
      pointsToNextReward: 300,
      weekEarned: 65,
    });
    expect(data.streak.days).toBe(4);
    expect(data.streak.countedToday).toBe(true);
    expect(data.streak.nextMilestone).toEqual({ days: 7, points: 150, daysLeft: 3 });
    expect(data.goals).toEqual([
      { id: 'streak', done: true, href: null },
      { id: 'review', done: false, href: '/customer/scan' },
      { id: 'spin', done: true, href: null },
    ]);
    expect(data.pending.map((p: { id: string }) => p.id)).toEqual(['remedy', 'reviews', 'boxes']);
    expect(data.league).toMatchObject({ key: 'KOR', rankInLeague: 7, leagueSize: 120, gapToAbove: 60, pointsToNext: 1801 });
    expect(data.spin).toMatchObject({ dailyLimit: 1, remaining: 0 });
    expect(data.spin.prizes[0]).not.toHaveProperty('weight');
    expect(data.surpriseBox).toEqual({ openedToday: false, unopened: 1 });
    expect(data.isNewCustomer).toBe(true);
  });

  it('her kullanıcı sorgusu oturumdaki kullanıcıyla sınırlı; sıralama demo/anonim hesapları saymaz', async () => {
    await get();
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cust-1' } }));
    // Ham sayaç sorgusu: her alt sorgu oturumdaki kullanıcıyla sınırlı (parametre, birleştirme değil).
    const [sql, params] = rawCall();
    const userFilters = sql.match(/"(userId|customerId)" = \?/g) ?? [];
    expect(userFilters.length).toBe(11);
    expect(params.filter((v) => v === 'cust-1').length).toBe(11);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "ConsumptionReview"/);
    expect(sql).toMatch(/"RemedyOffer" WHERE "userId" = \? AND "status" = 'pending'/);
    expect(db.analyticsEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'cust-1', event: 'points_credited' }) })
    );
    const rankWhere = db.user.count.mock.calls[0][0].where;
    expect(rankWhere).toMatchObject({ role: 'CUSTOMER', isDemo: false, anonymizedAt: null, points: { gt: 3200, lt: 5001 } });
    // Sıra sorgusu başka kullanıcıların kimliğini/adını seçmez.
    expect(db.user.findFirst.mock.calls[0][0].select).toEqual({ points: true });
  });

  it('ödül modülü kapalıysa ödüller sorgulanmaz ve hiçbir yerde görünmez', async () => {
    mockModuleControls.mockResolvedValue({ rewards: false });
    db.$queryRaw.mockResolvedValue([facts({ readyRewards: 3 })]);
    const { data } = await (await get()).json();
    expect(db.reward.findMany).not.toHaveBeenCalled();
    expect(data.sections.rewards).toBe(false);
    expect(data.wallet.nextReward).toBeNull();
    expect(data.pending.find((p: { id: string }) => p.id === 'rewards')).toBeUndefined();
  });

  it('çark kapalıysa çark null ve hedef listesinde günlük kutu', async () => {
    mockMatrix.mockResolvedValue({ spin: { enabled: false, dailyLimit: 1, prizes: [] } });
    const { data } = await (await get()).json();
    expect(data.spin).toBeNull();
    expect(data.goals.map((g: { id: string }) => g.id)).toEqual(['streak', 'review', 'box']);
    // Sayaç tek sorguda gelse de kapalı çarkın kullanımı yanıta sızmaz.
    expect(data.goals.find((g: { id: string }) => g.id === 'spin')).toBeUndefined();
  });

  it('DB erişilemezse 503 + retryable (sıfırlarla 200 değil)', async () => {
    const err = new Error('db down');
    db.user.findUnique.mockRejectedValue(err);
    mockConnectivity.mockImplementation((e: unknown) => e === err);
    const res = await get();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.retryable).toBe(true);
  });

  it('hesap yoksa 404', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
  });
});
