/**
 * lib/game-session — mini oyun sunucu otoritesi (P0-17 → F4.1 temeli).
 *
 * Saldırı / hata senaryoları (docs/audit/2026-10-08/sistem/oyun-ekosistemi.md K1-K3,
 * musteri/customer_games_pacman.md #3-#5):
 *  - Betik: start → bekle → complete {score: maxScore, won: true} → ödül YOK (makullük).
 *  - Kaybeden oyuncu: failed oturum start'ta yeniden "oynanabilir" dönüyordu → artık played.
 *  - Yenile-tekrar dene: yarım deneme grace dışında yeniden istenince failed (deneme harcandı).
 *  - Pacman complete başka oyunun oturumunu kapatabiliyordu → not_found.
 *  - Aynı deneme iki kez complete → 409 yerine kayıtlı sonuç (idempotent), ikinci kredi YOK.
 * Gerçek DB'ye gidilmez (prisma ve economy mock).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
}));

import {
  ATTEMPT_RESUME_GRACE_MS,
  countStreak,
  evaluateAttempt,
  finalizeAttempt,
  gameDayKey,
  resolveStartAttempt,
  signAttemptToken,
  streakBonusFor,
  verifyAttemptToken,
  type GameRules,
} from '@/lib/game-session';

process.env.NEXTAUTH_SECRET = 'test-secret-for-game-attempts-0123456789';

const GAME: GameRules = {
  gameType: 'mind-thief',
  maxScore: 30,
  rewardThreshold: 15,
  rewardPoints: 160,
  rewardXp: 80,
  minDurationSec: 8,
  maxScorePerSec: 2.7,
  maxDurationSec: 135,
  enabled: true,
};

const T0 = new Date('2026-10-08T10:00:00.000Z');
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

// ───────────────────────────── evaluateAttempt ─────────────────────────────

describe('evaluateAttempt — makullük', () => {
  const base = { startedAt: T0, expiresAt: at(135) };

  it('dürüst kazanma: eşik üstü, makul süre → won + ödüle uygun', () => {
    const ev = evaluateAttempt(GAME, { ...base, clientScore: 20, clientDurationSec: 40, now: at(42) });
    expect(ev.won).toBe(true);
    expect(ev.rewardEligible).toBe(true);
    expect(ev.verifiedScore).toBe(20);
    expect(ev.flags).toEqual([]);
  });

  it('BETİK: min süre dolunca tavan skor → saniye başı skor sınırı yakalar, ödül YOK', () => {
    // 9 sn'de 30 skor = 3,3/sn > 2,7/sn
    const ev = evaluateAttempt(GAME, { ...base, clientScore: 30, clientDurationSec: 9, now: at(9) });
    expect(ev.won).toBe(false);
    expect(ev.rewardEligible).toBe(false);
    expect(ev.flags).toContain('rate_exceeded');
  });

  it('istemci süresi uydurulsa da sunucu saati esas: çok hızlı → too_fast', () => {
    const ev = evaluateAttempt(GAME, { ...base, clientScore: 16, clientDurationSec: 60, now: at(3) });
    expect(ev.flags).toContain('too_fast');
    expect(ev.flags).toContain('client_clock_mismatch');
    expect(ev.won).toBe(false);
  });

  it('tavan üstü skor kırpılır ve işaretlenir (yine de makullük denetlenir)', () => {
    const ev = evaluateAttempt(GAME, { ...base, clientScore: 9999, clientDurationSec: 100, now: at(100) });
    expect(ev.verifiedScore).toBe(30);
    expect(ev.flags).toContain('score_clamped');
    expect(ev.won).toBe(true);
  });

  it('pencere dışı (expired) → kayıp', () => {
    const ev = evaluateAttempt(GAME, { ...base, clientScore: 20, clientDurationSec: 40, now: at(200) });
    expect(ev.flags).toContain('expired');
    expect(ev.won).toBe(false);
  });

  it('eşik altı → kayıp; istemcinin won=true beyanı önemsiz', () => {
    const ev = evaluateAttempt(GAME, { ...base, clientScore: 10, clientDurationSec: 40, now: at(40) });
    expect(ev.won).toBe(false);
    expect(ev.flags).toContain('below_threshold');
  });

  it('admin kapattı / portföyden gizli → kazanılabilir ama ödülsüz', () => {
    const off = evaluateAttempt({ ...GAME, enabled: false }, { ...base, clientScore: 20, clientDurationSec: 40, now: at(40) });
    expect(off.won).toBe(true);
    expect(off.rewardEligible).toBe(false);
    const hidden = evaluateAttempt({ ...GAME, hidden: true }, { ...base, clientScore: 20, clientDurationSec: 40, now: at(40) });
    expect(hidden.rewardEligible).toBe(false);
  });
});

// ───────────────────────────── belirteç ─────────────────────────────

describe('deneme belirteci (HMAC)', () => {
  const claims = { sid: 's1', uid: 'u1', g: 'mind-thief', n: 'nonce-1', seed: 'abc', exp: at(135).getTime() };
  const expected = { sessionId: 's1', userId: 'u1', gameType: 'mind-thief', nonce: 'nonce-1' };

  it('imzalı belirteç doğrulanır', () => {
    expect(verifyAttemptToken(signAttemptToken(claims), expected)).toBe(true);
  });

  it('başka kullanıcı / oyun / nonce ile eşleşmez', () => {
    const t = signAttemptToken(claims);
    expect(verifyAttemptToken(t, { ...expected, userId: 'u2' })).toBe(false);
    expect(verifyAttemptToken(t, { ...expected, gameType: 'pacman' })).toBe(false);
    expect(verifyAttemptToken(t, { ...expected, nonce: 'other' })).toBe(false);
  });

  it('gövdesi değiştirilmiş belirteç reddedilir', () => {
    const t = signAttemptToken(claims);
    const [v, , macPart] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, uid: 'attacker' })).toString('base64url');
    expect(verifyAttemptToken(`${v}.${forged}.${macPart}`, { ...expected, userId: 'attacker' })).toBe(false);
    expect(verifyAttemptToken('saçma', expected)).toBe(false);
    expect(verifyAttemptToken(undefined, expected)).toBe(false);
  });
});

// ───────────────────────────── resolveStartAttempt ─────────────────────────────

type Row = {
  id: string;
  userId: string;
  gameType: string;
  dayKey: string;
  status: string;
  starsCollected: number;
  rewardPoints: number;
  startedAt: Date;
  serverStartedAt: Date | null;
  expiresAt: Date | null;
  nonce: string | null;
  seed: string | null;
  clientScore?: number | null;
  completedAt?: Date | null;
};

function fakeDb(rows: Row[] = []) {
  const state = { rows: [...rows], streakClaims: new Set<string>() };
  const match = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v);
  const sessions = {
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if ('id' in where) return state.rows.find((r) => r.id === where.id) ?? null;
      const k = where.userId_gameType_dayKey as { userId: string; gameType: string; dayKey: string };
      return state.rows.find((r) => r.userId === k.userId && r.gameType === k.gameType && r.dayKey === k.dayKey) ?? null;
    }),
    create: jest.fn(async ({ data }: { data: Omit<Row, 'id' | 'starsCollected' | 'rewardPoints'> }) => {
      if (state.rows.some((r) => r.userId === data.userId && r.gameType === data.gameType && r.dayKey === data.dayKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row: Row = { id: `s${state.rows.length + 1}`, starsCollected: 0, rewardPoints: 0, ...data } as Row;
      state.rows.push(row);
      return { id: row.id };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      let count = 0;
      for (const r of state.rows) {
        if (match(r, where)) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const r = state.rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    }),
    findMany: jest.fn(async ({ where }: { where: { userId: string; status: string } }) =>
      state.rows.filter((r) => r.userId === where.userId && r.status === where.status).map((r) => ({ dayKey: r.dayKey }))
    ),
  };
  const tx = {
    miniGameSession: sessions,
    gameStreakClaim: {
      createMany: jest.fn(async ({ data }: { data: { userId: string; dayKey: string }[] }) => {
        const k = `${data[0].userId}:${data[0].dayKey}`;
        if (state.streakClaims.has(k)) return { count: 0 };
        state.streakClaims.add(k);
        return { count: 1 };
      }),
    },
  };
  const db = {
    ...tx,
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { db: db as unknown as Parameters<typeof finalizeAttempt>[0], state, sessions };
}

const DAY = gameDayKey(T0);
const activeRow = (over: Partial<Row> = {}): Row => ({
  id: 's1',
  userId: 'u1',
  gameType: 'mind-thief',
  dayKey: DAY,
  status: 'active',
  starsCollected: 0,
  rewardPoints: 0,
  startedAt: T0,
  serverStartedAt: T0,
  expiresAt: at(135),
  nonce: 'n1',
  seed: 'seed1',
  ...over,
});

describe('resolveStartAttempt — günde 1 deneme', () => {
  it('ilk start: yeni deneme (seed + nonce + expiresAt + imzalı belirteç)', async () => {
    const { db, state } = fakeDb();
    const r = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: T0 });
    expect(r.kind).toBe('attempt');
    if (r.kind !== 'attempt') return;
    const row = state.rows[0];
    expect(row.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(row.nonce).toBeTruthy();
    expect(row.expiresAt?.getTime()).toBe(at(135).getTime());
    expect(verifyAttemptToken(r.token, { sessionId: row.id, userId: 'u1', gameType: 'mind-thief', nonce: row.nonce! })).toBe(true);
  });

  it('KAYBEDEN OYUNCU (failed) → canPlay değil "played/lost" (eski 409 döngüsü kapalı)', async () => {
    const { db } = fakeDb([activeRow({ status: 'failed' })]);
    const r = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: at(300) });
    expect(r).toMatchObject({ kind: 'played', outcome: 'lost', expiredNow: false });
  });

  it('kazanan → played/won', async () => {
    const { db } = fakeDb([activeRow({ status: 'completed' })]);
    const r = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: at(300) });
    expect(r).toMatchObject({ kind: 'played', outcome: 'won' });
  });

  it('ağ tekrarı (grace içinde) → aynı deneme, saat sıfırlanmaz', async () => {
    const { db, state } = fakeDb([activeRow()]);
    const r = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: new Date(T0.getTime() + ATTEMPT_RESUME_GRACE_MS - 1000) });
    expect(r).toMatchObject({ kind: 'attempt', resumed: true, sessionId: 's1' });
    expect(state.rows[0].serverStartedAt).toEqual(T0);
  });

  it('YENİLE-TEKRAR DENE: grace dışında yeniden start → deneme harcanmış, failed', async () => {
    const { db, state } = fakeDb([activeRow()]);
    const r = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: at(40) });
    expect(r).toMatchObject({ kind: 'played', outcome: 'lost', expiredNow: true });
    expect(state.rows[0].status).toBe('failed');
    // İkinci deneme de verilmez.
    const again = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: at(41) });
    expect(again).toMatchObject({ kind: 'played', outcome: 'lost', expiredNow: false });
  });

  it('dağıtım öncesi nonce\'suz yarım oturum bir kez yeni kurallarla yeniden başlatılır', async () => {
    const { db, state } = fakeDb([activeRow({ nonce: null, seed: null, serverStartedAt: null, expiresAt: null, startedAt: at(-3600) })]);
    const r = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: T0 });
    expect(r).toMatchObject({ kind: 'attempt', resumed: false, sessionId: 's1' });
    expect(state.rows[0].nonce).toBeTruthy();
    // Bir dakika sonra tekrar: artık nonce'lu → harcandı.
    const again = await resolveStartAttempt(db, { userId: 'u1', game: GAME, now: at(60) });
    expect(again).toMatchObject({ kind: 'played', outcome: 'lost' });
  });

  it('paralel iki start (P2002) → ikisi de aynı denemeyi görür', async () => {
    const { db, sessions } = fakeDb();
    const [a, b] = await Promise.all([
      resolveStartAttempt(db, { userId: 'u1', game: GAME, now: T0 }),
      resolveStartAttempt(db, { userId: 'u1', game: GAME, now: T0 }),
    ]);
    expect(a.kind).toBe('attempt');
    expect(b.kind).toBe('attempt');
    if (a.kind === 'attempt' && b.kind === 'attempt') expect(a.sessionId).toBe(b.sessionId);
    expect(sessions.create).toHaveBeenCalledTimes(2);
  });
});

// ───────────────────────────── finalizeAttempt ─────────────────────────────

function tokenFor(row: Row) {
  return signAttemptToken({ sid: row.id, uid: row.userId, g: row.gameType, n: row.nonce!, seed: row.seed!, exp: row.expiresAt!.getTime() });
}

describe('finalizeAttempt — sunucu kararı + atomik ödül', () => {
  beforeEach(() => {
    mockMint.mockReset();
    mockMint.mockImplementation(async (_tx: unknown, input: { points: number; xp?: number }) => ({
      credited: input.points,
      xpCredited: input.xp ?? 0,
      capped: false,
      duplicate: false,
      status: 'posted',
    }));
  });

  it('dürüst kazanma → completed + mintPoints(game, idempotency game:<id>) + seri bonusu', async () => {
    const row = activeRow();
    const { db, state } = fakeDb([row]);
    const r = await finalizeAttempt(db, {
      userId: 'u1', game: GAME, sessionId: 's1', clientScore: 20, clientDurationSec: 40, token: tokenFor(row), now: at(42),
    });
    expect(r.kind).toBe('finished');
    if (r.kind !== 'finished') return;
    expect(r.status).toBe('completed');
    expect(r.credited).toBe(160);
    expect(state.rows[0]).toMatchObject({ status: 'completed', starsCollected: 20, clientScore: 20, rewardPoints: 160 });
    expect(mockMint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'game', idempotencyKey: 'game:s1', points: 160, xp: 80, userId: 'u1' })
    );
    // Günün ilk kazancı → seri XP'si ayrı, tavansız, tek-kez anahtarlı.
    expect(mockMint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'game_streak', points: 0, capCategory: null, idempotencyKey: `game_streak:u1:${DAY}` })
    );
    expect(r.streak).toBe(1);
    expect(r.streakBonusXp).toBe(10);
  });

  it('BETİK (start → 9 sn → tavan skor, won:true) → failed, mint ÇAĞRILMAZ', async () => {
    const row = activeRow();
    const { db, state } = fakeDb([row]);
    const r = await finalizeAttempt(db, {
      userId: 'u1', game: GAME, sessionId: 's1', clientScore: 30, clientDurationSec: 9, token: tokenFor(row), now: at(9),
    });
    expect(r).toMatchObject({ kind: 'finished', status: 'failed', credited: 0 });
    expect(mockMint).not.toHaveBeenCalled();
    expect(state.rows[0].status).toBe('failed');
  });

  it('belirteç yok / yanlış → invalid_token, oturum harcanmaz', async () => {
    const row = activeRow();
    const { db, state } = fakeDb([row]);
    const r = await finalizeAttempt(db, { userId: 'u1', game: GAME, sessionId: 's1', clientScore: 20, clientDurationSec: 40, token: null, now: at(42) });
    expect(r.kind).toBe('invalid_token');
    expect(state.rows[0].status).toBe('active');
  });

  it('PACMAN B5: başka oyunun oturumu bu oyunun kuralıyla kapatılamaz', async () => {
    const row = activeRow();
    const { db } = fakeDb([row]);
    const r = await finalizeAttempt(db, {
      userId: 'u1', game: { ...GAME, gameType: 'pacman' }, sessionId: 's1', clientScore: 5, clientDurationSec: 40, token: tokenFor(row), now: at(42),
    });
    expect(r.kind).toBe('not_found');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('başka kullanıcının oturumu → not_found', async () => {
    const row = activeRow({ userId: 'other' });
    const { db } = fakeDb([row]);
    const r = await finalizeAttempt(db, { userId: 'u1', game: GAME, sessionId: 's1', clientScore: 20, clientDurationSec: 40, token: tokenFor(row), now: at(42) });
    expect(r.kind).toBe('not_found');
  });

  it('bitmiş denemeye tekrar complete → 409 değil kayıtlı sonuç; ikinci kredi YOK', async () => {
    const row = activeRow();
    const { db } = fakeDb([row]);
    const args = { userId: 'u1', game: GAME, sessionId: 's1', clientScore: 20, clientDurationSec: 40, token: tokenFor(row), now: at(42) };
    await finalizeAttempt(db, args);
    mockMint.mockClear();
    const again = await finalizeAttempt(db, args);
    expect(again).toMatchObject({ kind: 'already_finished', status: 'completed', won: true, rewardPoints: 160, score: 20 });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('kaybeden dürüst oyuncu: failed yazılır ve tekrar gönderimde hata değil sonuç döner', async () => {
    const row = activeRow();
    const { db } = fakeDb([row]);
    const args = { userId: 'u1', game: GAME, sessionId: 's1', clientScore: 5, clientDurationSec: 40, token: tokenFor(row), now: at(42) };
    const r = await finalizeAttempt(db, args);
    expect(r).toMatchObject({ kind: 'finished', status: 'failed' });
    const again = await finalizeAttempt(db, args);
    expect(again).toMatchObject({ kind: 'already_finished', status: 'failed', won: false });
  });

  it('günün ikinci kazancı: seri claim ON CONFLICT DO NOTHING → bonus yok, tx bozulmaz', async () => {
    const a = activeRow();
    const b = activeRow({ id: 's2', gameType: 'mind-thief-2', nonce: 'n2' });
    const { db } = fakeDb([a, b]);
    await finalizeAttempt(db, { userId: 'u1', game: GAME, sessionId: 's1', clientScore: 20, clientDurationSec: 40, token: tokenFor(a), now: at(42) });
    mockMint.mockClear();
    const r2 = await finalizeAttempt(db, {
      userId: 'u1', game: { ...GAME, gameType: 'mind-thief-2' }, sessionId: 's2', clientScore: 20, clientDurationSec: 40, token: tokenFor(b), now: at(42),
    });
    expect(r2).toMatchObject({ kind: 'finished', status: 'completed', streakBonusXp: 0 });
    expect(mockMint).toHaveBeenCalledTimes(1); // yalnız oyun ödülü
  });

  it('tavan dolu: mint 0 kredi → oturum ödülü 0, capped bildirilir', async () => {
    mockMint.mockImplementationOnce(async () => ({ credited: 0, xpCredited: 0, capped: true, duplicate: false, status: 'posted' }));
    const row = activeRow();
    const { db, state } = fakeDb([row]);
    const r = await finalizeAttempt(db, { userId: 'u1', game: GAME, sessionId: 's1', clientScore: 20, clientDurationSec: 40, token: tokenFor(row), now: at(42) });
    expect(r).toMatchObject({ kind: 'finished', status: 'completed', credited: 0, capped: true });
    expect(state.rows[0].rewardPoints).toBe(0);
  });

  it('eşzamanlı ikinci complete claim kaybederse already_finished döner', async () => {
    const row = activeRow();
    const { db, sessions } = fakeDb([row]);
    sessions.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await finalizeAttempt(db, { userId: 'u1', game: GAME, sessionId: 's1', clientScore: 20, clientDurationSec: 40, token: tokenFor(row), now: at(42) });
    expect(r.kind).toBe('already_finished');
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('seri yardımcıları', () => {
  it('countStreak bugünden geriye kesintisiz günleri sayar', () => {
    expect(countStreak(['2026-10-07', '2026-10-06', '2026-10-04'], '2026-10-08')).toBe(3);
    expect(countStreak([], '2026-10-08')).toBe(1);
  });
  it('streakBonusFor: her gün 10, her 3. gün +30', () => {
    expect(streakBonusFor(1)).toBe(10);
    expect(streakBonusFor(3)).toBe(40);
    expect(streakBonusFor(0)).toBe(0);
  });
});
