/**
 * Mini oyun route'ları — P0-17 saldırı/hata senaryolarının HTTP seviyesinde yeniden üretimi.
 *
 *  1. Kaybeden oyuncu: failed oturumda start → canPlay:false + outcome:'lost' (eskiden
 *     canPlay:true + aynı sessionId, oyun sonunda 409).
 *  2. Betik: start → complete {score: maxScore, won:true} anında → ödül YOK, mint YOK.
 *  3. Yıldız Avı (pacman) complete başka oyunun oturumunu kapatamaz (gameType kontrolü) → 404.
 *  4. Aynı denemeye ikinci complete → 200 + kayıtlı sonuç (409 değil), ikinci kredi YOK.
 *  5. Admin kapattı: complete ÖNBELLEKSİZ config okur → ödül yok (kill-switch derhal).
 *  6. Turnuva: rakipsiz (minParticipants altı) ödül yok; aynı sıraya ikinci ödül yok.
 * Gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

process.env.NEXTAUTH_SECRET = 'test-secret-for-game-attempts-0123456789';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
}));

jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: jest.fn(),
}));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
  isEconomyError: () => false,
}));

jest.mock('@/lib/game-achievement-stats', () => ({
  computeAchievementStats: jest.fn(async () => ({ totalWins: 0, distinctGames: 0, bestScore: 0, totalPlays: 0, streak: 0 })),
}));
// Bu dosya generic route'ların makullük (doğrulayıcısız) yolunu sınar. Zihin Hırsızı v2 artık
// sunucu replay doğrulayıcısı taşıyor (ayrı test: games-practice-verify / mind-thief); burada
// doğrulayıcısı devre dışı bırakılır ki eşik/süre/mint kuralları izole kalsın (pacman gerçek kalır).
jest.mock('@/lib/games/registry/server', () => {
  const actual = jest.requireActual('@/lib/games/registry/server');
  return { ...actual, getVerifierForGameType: (g: string) => (g === 'mind-thief' ? null : actual.getVerifierForGameType(g)) };
});

type Row = Record<string, unknown> & { id: string; status: string };
const db = {
  rows: [] as Row[],
  configs: [] as Array<Record<string, unknown>>,
  claims: [] as Array<{ userId: string; gameType: string; weekKey: string; rank: number }>,
};

const match = (r: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const cond = v as { gte?: Date; lt?: Date };
      const val = r[k] as Date | null;
      if (!val) return false;
      if (cond.gte && val < cond.gte) return false;
      if (cond.lt && val >= cond.lt) return false;
      return true;
    }
    return r[k] === v;
  });

const sessionModel = {
  findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if ('id' in where) return db.rows.find((r) => r.id === where.id) ?? null;
    const k = where.userId_gameType_dayKey as Record<string, unknown>;
    return db.rows.find((r) => r.userId === k.userId && r.gameType === k.gameType && r.dayKey === k.dayKey) ?? null;
  }),
  findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => db.rows.filter((r) => match(r, where))),
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `s${db.rows.length + 1}`, starsCollected: 0, rewardPoints: 0, ...data } as Row;
    db.rows.push(row);
    return { id: row.id };
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    let count = 0;
    for (const r of db.rows) if (match(r, where)) { Object.assign(r, data); count++; }
    return { count };
  }),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const r = db.rows.find((x) => x.id === where.id)!;
    Object.assign(r, data);
    return r;
  }),
};

const tx = {
  miniGameSession: sessionModel,
  gameStreakClaim: { createMany: jest.fn(async () => ({ count: 1 })) },
  tournamentRewardClaim: {
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => db.claims.find((c) => match(c, where)) ?? null),
    createMany: jest.fn(async ({ data }: { data: Array<{ userId: string; gameType: string; weekKey: string; rank: number }> }) => {
      const d = data[0];
      if (db.claims.some((c) => c.userId === d.userId && c.gameType === d.gameType && c.weekKey === d.weekKey)) return { count: 0 };
      db.claims.push(d);
      return { count: 1 };
    }),
    findUnique: jest.fn(async () => null),
  },
  notification: { create: jest.fn(async () => ({})) },
  $executeRaw: jest.fn(async () => 1),
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    get miniGameSession() { return sessionModel; },
    get gameStreakClaim() { return tx.gameStreakClaim; },
    get tournamentRewardClaim() { return tx.tournamentRewardClaim; },
    get notification() { return tx.notification; },
    miniGameConfig: {
      findMany: jest.fn(async () => db.configs),
      findUnique: jest.fn(async ({ where }: { where: { gameType: string } }) => db.configs.find((c) => c.gameType === where.gameType) ?? null),
    },
    user: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));

import { gameDayKey } from '@/lib/game-session';

const CUSTOMER = { session: { user: { id: 'u1', role: 'CUSTOMER' } } };

function post(url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  db.rows = [];
  db.configs = [];
  db.claims = [];
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue(CUSTOMER);
  mockMint.mockReset();
  mockMint.mockImplementation(async (_t: unknown, i: { points: number; xp?: number }) => ({
    credited: i.points, xpCredited: i.xp ?? 0, capped: false, duplicate: false, status: 'posted',
  }));
});

async function start(game: string) {
  const { POST } = await import('@/app/api/customer/games/[game]/start/route');
  const res = await POST(post(`/api/customer/games/${game}/start`), { params: Promise.resolve({ game }) });
  return { status: res.status, json: await res.json() };
}
async function complete(game: string, body: unknown) {
  const { POST } = await import('@/app/api/customer/games/[game]/complete/route');
  const res = await POST(post(`/api/customer/games/${game}/complete`, body), { params: Promise.resolve({ game }) });
  return { status: res.status, json: await res.json() };
}

describe('generic oyun route\'ları', () => {
  it('1) kaybeden oyuncu aynı gün tekrar start → canPlay:false, outcome:lost', async () => {
    db.rows.push({ id: 'old', userId: 'u1', gameType: 'mind-thief', dayKey: gameDayKey(), status: 'failed', starsCollected: 4, rewardPoints: 0, startedAt: new Date(), serverStartedAt: new Date(), expiresAt: new Date(), nonce: 'n', seed: 's' });
    const r = await start('mind-thief');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ canPlay: false, alreadyPlayed: true, outcome: 'lost' });
    expect(r.json.sessionId).toBeUndefined();
  });

  it('start yeni deneme: imzalı belirteç + seed + etkin config döner', async () => {
    const r = await start('mind-thief');
    expect(r.json).toMatchObject({ canPlay: true, sessionId: 's1' });
    expect(typeof r.json.attemptToken).toBe('string');
    expect(r.json.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(r.json.config).toMatchObject({ maxScore: 30, rewardThreshold: 15, rewardPoints: 160 });
  });

  it('2) BETİK: start → hemen complete {maxScore, won:true} → ödül yok, mint yok', async () => {
    const s = await start('mind-thief');
    const r = await complete('mind-thief', { sessionId: s.json.sessionId, score: 30, durationSec: 60, won: true, attemptToken: s.json.attemptToken });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ rewarded: false, rewardPoints: 0, won: false, tooFast: true });
    expect(r.json.reason).toMatch(/kısa/);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('dürüst kazanma (zaman geçmiş) → ödül mintPoints ile; ikinci complete 200 + kayıtlı sonuç', async () => {
    const s = await start('mind-thief');
    const row = db.rows[0];
    row.serverStartedAt = new Date(Date.now() - 40_000);
    row.startedAt = row.serverStartedAt;
    const body = { sessionId: s.json.sessionId, score: 20, durationSec: 38, won: false, attemptToken: s.json.attemptToken };
    const r = await complete('mind-thief', body);
    expect(r.json).toMatchObject({ rewarded: true, rewardPoints: 160, rewardXp: 80, won: true, score: 20 });
    expect(mockMint).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ source: 'game', idempotencyKey: `game:${s.json.sessionId}` }));

    mockMint.mockClear();
    const again = await complete('mind-thief', body);
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ alreadyCompleted: true, rewarded: true, won: true });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('5) admin kapattıktan sonra complete → önbelleksiz config: ödül yok', async () => {
    const s = await start('mind-thief');
    db.rows[0].serverStartedAt = new Date(Date.now() - 40_000);
    db.configs.push({ gameType: 'mind-thief', enabled: false, rewardPoints: null, rewardXp: null, rewardThreshold: null, minDurationSec: null, maxScore: null, title: null, description: null, emoji: null, accent: null });
    const r = await complete('mind-thief', { sessionId: s.json.sessionId, score: 20, durationSec: 38, attemptToken: s.json.attemptToken });
    expect(r.json).toMatchObject({ rewarded: false, won: true });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('gizli (emekli) oyun yeni deneme açamaz', async () => {
    const r = await start('lucky-wheel');
    expect(r.status).toBe(403);
    expect(r.json.canPlay).toBe(false);
  });

  it('belirteçsiz complete → 400, deneme harcanmaz', async () => {
    const s = await start('mind-thief');
    const r = await complete('mind-thief', { sessionId: s.json.sessionId, score: 20, durationSec: 38 });
    expect(r.status).toBe(400);
    expect(db.rows[0].status).toBe('active');
  });
});

// Yıldız Avı (sunucu anahtarı 'pacman') artık generic `[game]` route'larından geçer; ayrı
// pacman route'ları emekli. Dürüst oyunun ödülü: __tests__/lib/star-hunt.test.ts (replay botu).
describe('Yıldız Avı (pacman) generic route\'larda', () => {
  it('3) pacman complete başka oyunun oturumunu kapatamaz → 404', async () => {
    const s = await start('mind-thief');
    db.rows[0].serverStartedAt = new Date(Date.now() - 40_000);
    const r = await complete('pacman', { sessionId: s.json.sessionId, score: 5, durationSec: 30, won: true, attemptToken: s.json.attemptToken });
    expect(r.status).toBe(404);
    expect(db.rows[0].status).toBe('active');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('eski açık: kanıtsız "won:true, 5 yıldız" → ödülsüz (replay kanıtı zorunlu)', async () => {
    const s = await start('pacman');
    expect(s.json.canPlay).toBe(true);
    db.rows[0].serverStartedAt = new Date(Date.now() - 25_000);
    const r = await complete('pacman', { sessionId: s.json.sessionId, score: 5, durationSec: 24, won: true, attemptToken: s.json.attemptToken });
    expect(r.json).toMatchObject({ rewarded: false, won: false });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('uydurma kanıt (oyun beyan edilen adımda bitmiyor) → ödülsüz', async () => {
    const s = await start('pacman');
    db.rows[0].serverStartedAt = new Date(Date.now() - 25_000);
    const r = await complete('pacman', {
      sessionId: s.json.sessionId, score: 5, durationSec: 24, won: true, attemptToken: s.json.attemptToken,
      proof: { log: [[0, 3]], steps: 600 },
    });
    expect(r.json).toMatchObject({ rewarded: false, won: false });
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('status route', () => {
  it('kaybedilen oyun da "oynandı" sayılır; gizli oyunlar listede yok', async () => {
    db.rows.push({ id: 'a', userId: 'u1', gameType: 'mind-thief', dayKey: gameDayKey(), status: 'failed', startedAt: new Date(), serverStartedAt: new Date(), expiresAt: new Date() });
    db.rows.push({ id: 'b', userId: 'u1', gameType: 'bot-hunter', dayKey: gameDayKey(), status: 'completed', startedAt: new Date(), serverStartedAt: new Date(), expiresAt: new Date() });
    const { GET } = await import('@/app/api/customer/games/status/route');
    const j = await (await GET()).json();
    expect(j.playedToday.sort()).toEqual(['bot-hunter', 'mind-thief']);
    expect(j.todayResults).toEqual({ 'mind-thief': 'lost', 'bot-hunter': 'won' });
    expect(j.games.some((g: { gameType: string }) => g.gameType === 'lucky-wheel')).toBe(false);
  });
});

describe('turnuva route', () => {
  async function seedPrevWeek(gameType: string, users: number, base: Date) {
    for (let i = 0; i < users; i++) {
      db.rows.push({
        id: `t${i}`,
        userId: i === 0 ? 'u1' : `p${i}`,
        gameType,
        status: 'completed',
        starsCollected: 10,
        completedAt: new Date(base.getTime() + i * 60_000),
      });
    }
  }

  it('6a) minParticipants altında ödül yok (rakipsiz 500 puan kapalı)', async () => {
    const { previousIsoWeekKey, isoWeekStart } = await import('@/lib/tournament-core');
    const { featuredGameTypeForWeek } = await import('@/lib/game-tournament');
    const { visibleMiniGames } = await import('@/lib/minigame-config');
    const now = new Date();
    const prevFeatured = featuredGameTypeForWeek(previousIsoWeekKey(now), visibleMiniGames().map((g) => g.gameType))!;
    await seedPrevWeek(prevFeatured, 2, new Date(isoWeekStart(now).getTime() - 3 * 86_400_000));
    const { POST } = await import('@/app/api/customer/tournament/route');
    const res = await POST();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/en az/);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('6b) eşit skorda önce yapan 1.; ödül mintPoints ile; aynı sıraya ikinci ödül yok', async () => {
    const { previousIsoWeekKey, isoWeekStart } = await import('@/lib/tournament-core');
    const { featuredGameTypeForWeek } = await import('@/lib/game-tournament');
    const { visibleMiniGames } = await import('@/lib/minigame-config');
    const now = new Date();
    const weekKey = previousIsoWeekKey(now);
    const prevFeatured = featuredGameTypeForWeek(weekKey, visibleMiniGames().map((g) => g.gameType))!;
    await seedPrevWeek(prevFeatured, 6, new Date(isoWeekStart(now).getTime() - 3 * 86_400_000));
    const { POST } = await import('@/app/api/customer/tournament/route');

    // u1 eşit skorda en erken → 1. sıra
    const res = await POST();
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ rank: 1, points: 500, gameType: prevFeatured });
    expect(mockMint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'tournament', capCategory: null, idempotencyKey: `tournament:${prevFeatured}:${weekKey}:u1` })
    );

    // aynı kullanıcı ikinci kez → 409
    expect((await POST()).status).toBe(409);

    // sıralama kaysa bile (u1 gitti) 1. sıra başkasına İKİNCİ kez verilmez
    db.rows = db.rows.filter((r) => r.userId !== 'u1');
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'p1', role: 'CUSTOMER' } } });
    mockMint.mockClear();
    const res2 = await POST();
    expect(res2.status).toBe(409);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('GET: öne çıkan olmayan oyunda ödül tablosu sıfır', async () => {
    const { isoWeekKey } = await import('@/lib/tournament-core');
    const { featuredGameTypeForWeek } = await import('@/lib/game-tournament');
    const { visibleMiniGames } = await import('@/lib/minigame-config');
    const featured = featuredGameTypeForWeek(isoWeekKey(new Date()), visibleMiniGames().map((g) => g.gameType));
    const other = visibleMiniGames().find((g) => g.gameType !== featured)!.gameType;
    const { GET } = await import('@/app/api/customer/tournament/route');
    const j = await (await GET(new NextRequest(`http://localhost/api/customer/tournament?game=${other}`))).json();
    expect(j).toMatchObject({ success: true, isFeatured: false, prizes: { 1: 0, 2: 0, 3: 0 } });
    expect(j.featured.gameType).toBe(featured);
  });
});
