/**
 * Oyun API'si — pratik modu + oyun doğrulayıcısı (lib/games/verify) HTTP seviyesinde.
 *
 *  1. Pratik turu: ödülsüz, DB'ye YAZMAZ, her çağrıda yeni tohum; sınıflandırmada pratik
 *     havuzundan etiketli içerik.
 *  2. Yapım aşamasındaki oyun: start ve pratik 403 "henüz yayında değil".
 *  3. Sıralı start: sınıflandırma ailesinde içerik ETİKETSİZ gelir.
 *  4. Sıralı complete: skor SUNUCUDA hesaplanır (istemci 30 dese de doğru cevap sayısı);
 *     kanıtsız → ödül yok; hile sinyali analytics'e düşer.
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

// mind-thief'e test için sınıflandırma doğrulayıcısı bağla (gerçek oyunlar ajanlarca doldurulur).
jest.mock('@/lib/games/registry/server', () => {
  const { classificationVerifier } = jest.requireActual('@/lib/games/verify');
  const { drawRound, splitPools } = jest.requireActual('@/lib/games/content/pool');
  const bank = Array.from({ length: 120 }, (_, i) => ({ id: `b${i}`, label: i % 2 ? 'fake' : 'real', payload: { text: `Metin ${i}` } }));
  const pools = splitPools(bank);
  const verifier = classificationVerifier({
    buildRound: (seed: string) => drawRound(pools.ranked, seed, { count: 20 }),
    practiceRound: (seed: string) => drawRound(pools.practice, seed, { count: 8 }),
  });
  return { getVerifierForGameType: (g: string) => (g === 'mind-thief' ? verifier : null), SERVER_GAME_MODULES: {} };
});

type Row = Record<string, unknown> & { id: string; status: string };
const db = { rows: [] as Row[], events: [] as Array<Record<string, unknown>> };

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
};
const tx = { miniGameSession: sessionModel, gameStreakClaim: { createMany: jest.fn(async () => ({ count: 0 })) } };

jest.mock('@/lib/prisma', () => ({
  prisma: {
    get miniGameSession() {
      return sessionModel;
    },
    notification: { create: jest.fn(async () => ({})) },
    analyticsEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.events.push(data);
        return data;
      }),
    },
    miniGameConfig: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));

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

beforeEach(() => {
  db.rows = [];
  db.events = [];
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
  mockMint.mockReset();
  mockMint.mockImplementation(async (_t: unknown, i: { points: number; xp?: number }) => ({
    credited: i.points,
    xpCredited: i.xp ?? 0,
    capped: false,
    duplicate: false,
    status: 'posted',
  }));
});

describe('pratik modu', () => {
  it('ödülsüz tur: DB yazımı yok, her çağrıda yeni tohum, pratik havuzundan etiketli içerik', async () => {
    const a = await call('practice', 'mind-thief');
    const b = await call('practice', 'mind-thief');
    expect(a.status).toBe(200);
    expect(a.json).toMatchObject({ success: true, mode: 'practice', verification: 'classification' });
    expect(a.json.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(a.json.seed).not.toBe(b.json.seed);
    expect(a.json.content).toHaveLength(8);
    expect(Object.keys(a.json.answerKey)).toHaveLength(8);
    expect(sessionModel.create).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('doğrulayıcısız oyunda içerik yok, yapılandırma var', async () => {
    const r = await call('practice', 'frost-catcher');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ mode: 'practice', verification: 'plausibility', config: { gameType: 'frost-catcher' } });
    expect(r.json.content).toBeUndefined();
    expect(r.json.answerKey).toBeUndefined();
  });

  it('yapım aşamasındaki oyun: pratik ve sıralı start 403 "henüz yayında değil"', async () => {
    // Portföyde şu an `release: 'building'` oyun kalmadı (hepsi canlıda); kuralı bir tanımı
    // geçici olarak yapım aşamasına çekerek sınarız.
    const { getGameDef } = await import('@/lib/minigame-config');
    const def = getGameDef('daily-word') as { hidden?: boolean; release?: 'building' };
    const prev = { hidden: def.hidden, release: def.release };
    def.hidden = true;
    def.release = 'building';
    try {
      const p = await call('practice', 'daily-word');
      expect(p.status).toBe(403);
      expect(p.json.error).toMatch(/henüz yayında değil/);
      const s = await call('start', 'daily-word');
      expect(s.status).toBe(403);
      expect(s.json.error).toMatch(/henüz yayında değil/);
    } finally {
      def.hidden = prev.hidden;
      def.release = prev.release;
    }
  });

  it('bilinmeyen oyun 404; oturumsuz 401', async () => {
    expect((await call('practice', 'yok-boyle')).status).toBe(404);
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) });
    expect((await call('practice', 'mind-thief')).status).toBe(401);
  });
});

describe('sıralı mod + doğrulayıcı', () => {
  async function startRanked() {
    const s = await call('start', 'mind-thief');
    expect(s.status).toBe(200);
    // dürüst süre geçmiş gibi
    db.rows[0].serverStartedAt = new Date(Date.now() - 60_000);
    db.rows[0].startedAt = db.rows[0].serverStartedAt;
    return s.json;
  }

  it('start içeriği ETİKETSİZ; complete skoru sunucuda hesaplar (istemci beyanı değil)', async () => {
    const s = await startRanked();
    expect(s.content).toHaveLength(20);
    expect(JSON.stringify(s.content)).not.toMatch(/"real"|"fake"|"b\d+"/);
    expect(s.answerKey).toBeUndefined();

    // Sunucunun anahtarını yeniden kur (test: aynı tohumla) ve 16 doğru, 4 yanlış cevap ver.
    const { getVerifierForGameType } = await import('@/lib/games/registry/server');
    const v = getVerifierForGameType('mind-thief')!;
    const round = (v as { buildRound: (s: string, r: unknown) => { answerKey: Record<string, string> } }).buildRound(db.rows[0].seed as string, {});
    const answers = s.content.map((it: { id: string }, i: number) => ({
      id: it.id,
      verdict: i < 16 ? round.answerKey[it.id] : round.answerKey[it.id] === 'real' ? 'fake' : 'real',
      tMs: 2000 + i * 2000,
    }));
    const r = await call('complete', 'mind-thief', {
      sessionId: s.sessionId,
      score: 30,
      durationSec: 58,
      won: true,
      attemptToken: s.attemptToken,
      proof: { answers },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ score: 16, won: true, rewarded: true, rewardPoints: 160 });
    expect(mockMint).toHaveBeenCalledTimes(1);
    // |istemci − sunucu| sinyali görünür (analytics), dürüst oyuncu cezalandırılmaz.
    expect(db.events).toEqual([
      expect.objectContaining({ event: 'game_attempt_flagged', data: expect.objectContaining({ flags: expect.arrayContaining(['score_mismatch']) }) }),
    ]);
  });

  it('kanıtsız complete → kazanılmadı, ödül yok, gerekçe görünür', async () => {
    const s = await startRanked();
    const r = await call('complete', 'mind-thief', { sessionId: s.sessionId, score: 30, durationSec: 58, attemptToken: s.attemptToken });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ rewarded: false, won: false, score: 0 });
    expect(r.json.reason).toMatch(/doğrulanamadı/);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('doğrulayıcısız oyunda eski davranış korunur (makullük)', async () => {
    const s = await call('start', 'frost-catcher');
    expect(s.json.content).toBeUndefined();
    expect(s.json.verification).toBe('plausibility');
    db.rows[0].serverStartedAt = new Date(Date.now() - 40_000);
    // Eşik (rewardThreshold 45) üstünde, saniye başı tavanın (6) altında dürüst bir skor.
    const r = await call('complete', 'frost-catcher', { sessionId: s.json.sessionId, score: 60, durationSec: 38, attemptToken: s.json.attemptToken });
    expect(r.json).toMatchObject({ rewarded: true, won: true, score: 60 });
  });

  it('geçersiz gövde 400 VALIDATION (defineRoute zarfı, eski `error` alanı korunur)', async () => {
    const r = await call('complete', 'mind-thief', { sessionId: '', score: -1 });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(typeof r.json.error).toBe('string');
  });
});
