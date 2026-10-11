/**
 * Oyunlar kalite turu — iki açık:
 *
 *  1. Emekli/birleşmiş eski oyun kimlikleri (truth-vs-fake, memory-match, combo-tap, …)
 *     `lib/minigame-config`'te hâlâ görünür (turnuva rotasyonu kaymasın diye `hidden` değil);
 *     doğrulayıcıları yoktu → doğrudan API ile `start` + bekle + `complete {score: eşik}` ile
 *     istemci beyanına puan basılıyordu. Artık start/pratik 403, önceden açılmış deneme
 *     kazanılamaz (ödül 0). Canlı oyun listesi kayıt defteriyle hizalı.
 *  2. Liderlik: yalnız müşteri; ilk 100 penceresi dışındaki oyuncu sayısı/sırası uydurulmaz
 *     (`totalCapped`, `rank: null`).
 * Gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

process.env.NEXTAUTH_SECRET = 'test-secret-for-game-attempts-0123456789';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a), isEconomyError: () => false }));
jest.mock('@/lib/game-achievement-stats', () => ({
  computeAchievementStats: jest.fn(async () => ({ totalWins: 0, distinctGames: 0, bestScore: 0, totalPlays: 0, streak: 0 })),
}));

type Row = Record<string, unknown> & { id: string; status: string };
const db = {
  rows: [] as Row[],
  groups: [] as Array<{ userId: string; _max: { starsCollected: number } }>,
  myBest: 0,
};

const sessionModel = {
  findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if ('id' in where) return db.rows.find((r) => r.id === where.id) ?? null;
    const k = where.userId_gameType_dayKey as Record<string, unknown>;
    return db.rows.find((r) => r.userId === k.userId && r.gameType === k.gameType && r.dayKey === k.dayKey) ?? null;
  }),
  findMany: jest.fn(async () => []),
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `s${db.rows.length + 1}`, starsCollected: 0, rewardPoints: 0, ...data } as Row;
    db.rows.push(row);
    return { id: row.id };
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    let count = 0;
    for (const r of db.rows) {
      if (Object.entries(where).every(([k, v]) => r[k] === v)) {
        Object.assign(r, data);
        count++;
      }
    }
    return { count };
  }),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const r = db.rows.find((x) => x.id === where.id)!;
    Object.assign(r, data);
    return r;
  }),
  groupBy: jest.fn(async ({ take }: { take: number }) => db.groups.slice(0, take)),
  aggregate: jest.fn(async () => ({ _max: { starsCollected: db.myBest || null } })),
};
const tx = { miniGameSession: sessionModel, gameStreakClaim: { createMany: jest.fn(async () => ({ count: 0 })) } };

jest.mock('@/lib/prisma', () => ({
  prisma: {
    get miniGameSession() {
      return sessionModel;
    },
    user: { findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, name: `Ad ${id} Soyad`, image: null }))) },
    notification: { create: jest.fn(async () => ({})) },
    analyticsEvent: { create: jest.fn(async () => ({})) },
    miniGameConfig: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) },
    // "Liderlikte görün" tercihi (lib/privacy/leaderboard-optout): kimse gizlenmemiş.
    settings: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));

import { GAMES } from '@/lib/games/registry';
import { LIVE_GAME_TYPES } from '@/lib/games/registry/live-game-types';
import { MINI_GAMES } from '@/lib/minigame-config';
import { gameDayKey, signAttemptToken } from '@/lib/game-session';

function post(url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function call(kind: 'start' | 'complete' | 'practice', game: string, body?: unknown) {
  const mod = await import(`@/app/api/customer/games/[game]/${kind}/route`);
  const res: Response = await mod.POST(post(`/api/customer/games/${game}/${kind}`, body), { params: Promise.resolve({ game }) });
  return { status: res.status, json: await res.json() };
}
async function leaderboard(game: string) {
  const mod = await import('@/app/api/customer/games/[game]/leaderboard/route');
  const res: Response = await mod.GET(new Request(`http://localhost/api/customer/games/${game}/leaderboard`), {
    params: Promise.resolve({ game }),
  });
  return { status: res.status, json: await res.json() };
}

const CUSTOMER = { session: { user: { id: 'u1', role: 'CUSTOMER' } } };

beforeEach(() => {
  db.rows = [];
  db.groups = [];
  db.myBest = 0;
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue(CUSTOMER);
  mockMint.mockReset();
  mockMint.mockImplementation(async (_t: unknown, i: { points: number; xp?: number }) => ({
    credited: i.points,
    xpCredited: i.xp ?? 0,
    capped: false,
    duplicate: false,
    status: 'posted',
  }));
});

/** Yapılandırmada görünür (hidden değil) ama kayıt defterinde canlı olmayan eski kimlikler. */
const LEGACY_VISIBLE = MINI_GAMES.filter((g) => !g.hidden && !LIVE_GAME_TYPES.has(g.gameType)).map((g) => g.gameType);

describe('canlı oyun listesi', () => {
  it('kayıt defterindeki canlı oyunların sunucu anahtarlarıyla birebir aynı', () => {
    expect([...LIVE_GAME_TYPES].sort()).toEqual(GAMES.map((g) => g.gameType).sort());
  });

  it('görünür eski kimlikler gerçekten var (rotasyon için hidden değiller)', () => {
    expect(LEGACY_VISIBLE).toEqual(expect.arrayContaining(['truth-vs-fake', 'memory-match', 'combo-tap', 'speed-order']));
  });
});

describe('emekli/birleşmiş oyun: puan basma kapalı', () => {
  it.each(LEGACY_VISIBLE)('%s: sıralı start ve pratik 403, satır açılmaz', async (game) => {
    const s = await call('start', game);
    expect(s.status).toBe(403);
    expect(s.json).toMatchObject({ canPlay: false, code: 'GAME_RETIRED' });
    expect(s.json.error).toMatch(/emekliye ayrıldı/);
    const p = await call('practice', game);
    expect(p.status).toBe(403);
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it('önceden açılmış eski deneme: eşik üstü beyan + geçerli belirteç → kazanılamaz, puan basılmaz', async () => {
    const game = 'memory-match';
    const startedAt = new Date(Date.now() - 60_000);
    db.rows.push({
      id: 'old1',
      userId: 'u1',
      gameType: game,
      dayKey: gameDayKey(),
      status: 'active',
      starsCollected: 0,
      rewardPoints: 0,
      startedAt,
      serverStartedAt: startedAt,
      expiresAt: new Date(Date.now() + 600_000),
      nonce: 'n1',
      seed: 'seed1',
    });
    const attemptToken = signAttemptToken({ sid: 'old1', uid: 'u1', g: game, n: 'n1', seed: 'seed1', exp: Date.now() + 600_000 });
    const r = await call('complete', game, { sessionId: 'old1', score: 8, durationSec: 55, attemptToken });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ rewarded: false, rewardPoints: 0, won: false, score: 0 });
    expect(mockMint).not.toHaveBeenCalled();
    expect(db.rows[0].status).toBe('failed');
  });

  it('canlı oyun etkilenmez: start açılır', async () => {
    const s = await call('start', 'mind-thief');
    expect(s.status).toBe(200);
    expect(s.json).toMatchObject({ canPlay: true, mode: 'ranked' });
  });
});

describe('liderlik', () => {
  it('müşteri olmayan rol reddedilir (requireAuth CUSTOMER)', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const r = await leaderboard('mind-thief');
    expect(r.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });

  it('100 oyuncudan azsa gerçek sayı; ilk 10 kısaltılmış adla', async () => {
    db.groups = Array.from({ length: 12 }, (_, i) => ({ userId: `p${i}`, _max: { starsCollected: 100 - i } }));
    const r = await leaderboard('mind-thief');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ totalPlayers: 12, totalCapped: false, me: null });
    expect(r.json.leaderboard).toHaveLength(10);
    expect(r.json.leaderboard[0]).toMatchObject({ rank: 1, name: 'Ad S.', score: 100 });
  });

  it('pencere dışı: sayı "100+" (uydurulmaz), kendi sıram null ama en iyi skorum gerçek', async () => {
    db.groups = Array.from({ length: 150 }, (_, i) => ({ userId: `p${i}`, _max: { starsCollected: 1000 - i } }));
    db.myBest = 7;
    const r = await leaderboard('mind-thief');
    expect(r.json).toMatchObject({ totalPlayers: 100, totalCapped: true, me: { rank: null, score: 7, inTop: false } });
  });

  it('pencere içinde ilk 10 dışındaysam gerçek sıram', async () => {
    db.groups = Array.from({ length: 30 }, (_, i) => ({ userId: i === 20 ? 'u1' : `p${i}`, _max: { starsCollected: 100 - i } }));
    const r = await leaderboard('mind-thief');
    expect(r.json.me).toEqual({ rank: 21, score: 80, inTop: false });
  });
});
