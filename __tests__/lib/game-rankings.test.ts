/**
 * lib/game-rankings + lib/game-achievement-stats türetmesi (oyun-ekosistemi Y6 / K4):
 *  - başarım "sonra"sı tek deneme eklenerek türetilir = yeniden sorgulamakla aynı sonuç;
 *  - turnuva kapanışı geçen haftanın ilk 3'üne bir kez ödül verir (tekrar koşu `already`),
 *    katılım eşiği altında ödül yok, öne çıkan oyun dondurulmuş takvimden;
 *  - sıralama önbelleği kazanılan denemede düşer.
 * Gerçek DB / Redis yok.
 */
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));

const mockDel = jest.fn(async (..._keys: string[]) => undefined);
jest.mock('@/lib/redis', () => ({
  cachedJson: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
  redisDel: (...keys: string[]) => mockDel(...keys),
}));

const mockMint = jest.fn(async (_tx: unknown, input: { points: number }) => ({ credited: input.points, xpCredited: 0, capped: false }));
jest.mock('@/lib/economy', () => ({ mintPoints: (tx: unknown, input: { points: number }) => mockMint(tx, input) }));

const state = {
  rows: [] as Array<{ userId: string; starsCollected: number; completedAt: Date; gameType: string }>,
  claims: [] as Array<{ userId: string; gameType: string; weekKey: string; rank: number; points: number }>,
  notifications: 0,
};

const tx = {
  $executeRaw: jest.fn(async () => 1),
  tournamentRewardClaim: {
    findFirst: jest.fn(async ({ where }: { where: { gameType: string; weekKey: string; rank: number } }) =>
      state.claims.find((c) => c.gameType === where.gameType && c.weekKey === where.weekKey && c.rank === where.rank) ?? null
    ),
    createMany: jest.fn(async ({ data }: { data: Array<(typeof state.claims)[number]> }) => {
      const d = data[0];
      if (state.claims.some((c) => c.userId === d.userId && c.gameType === d.gameType && c.weekKey === d.weekKey)) return { count: 0 };
      state.claims.push(d);
      return { count: 1 };
    }),
  },
  notification: { create: jest.fn(async () => { state.notifications += 1; return {}; }) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    miniGameSession: {
      findMany: jest.fn(async ({ where }: { where: { gameType: string; completedAt: { gte: Date; lt: Date } } }) =>
        state.rows.filter(
          (r) => r.gameType === where.gameType && r.completedAt >= where.completedAt.gte && r.completedAt < where.completedAt.lt
        )
      ),
    },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

import { invalidateGameRankings, settlePreviousWeekTournament } from '@/lib/game-rankings';
import { featuredGameForWeek, TOURNAMENT_MIN_PARTICIPANTS } from '@/lib/game-tournament';
import { statsFromBasis, withFinishedAttempt, type AchievementBasis } from '@/lib/game-achievement-stats';

const NOW = new Date('2026-10-13T06:00:00Z'); // Salı, W42 → kapanan hafta W41
const title = async (g: string) => `Oyun ${g}`;

beforeEach(() => {
  state.rows = [];
  state.claims = [];
  state.notifications = 0;
  jest.clearAllMocks();
});

describe('settlePreviousWeekTournament', () => {
  const game = featuredGameForWeek('2026-W41')!;
  const row = (userId: string, s: number, day = '2026-10-07') => ({
    userId,
    starsCollected: s,
    completedAt: new Date(`${day}T10:00:00Z`),
    gameType: game,
  });

  it('ilk 3 bir kez ödüllenir; tekrar koşu yalnız "already" (çift ödül yok)', async () => {
    state.rows = [row('a', 90), row('b', 80), row('c', 70), row('d', 60), row('e', 50)];
    const first = await settlePreviousWeekTournament(title, NOW);
    expect(first).toMatchObject({ weekKey: '2026-W41', gameType: game, participants: 5, belowMinimum: false });
    expect(first.credited).toEqual([
      { rank: 1, points: 500 },
      { rank: 2, points: 300 },
      { rank: 3, points: 150 },
    ]);
    expect(mockMint).toHaveBeenCalledTimes(3);
    expect(mockMint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'a', source: 'tournament', idempotencyKey: `tournament:${game}:2026-W41:a` })
    );
    expect(state.notifications).toBe(3);

    const again = await settlePreviousWeekTournament(title, NOW);
    expect(again.credited).toEqual([]);
    expect(again.skipped.map((s) => s.reason)).toEqual(['already', 'already', 'already']);
    expect(mockMint).toHaveBeenCalledTimes(3);
  });

  it('katılım eşiği altında ödül yok', async () => {
    state.rows = Array.from({ length: TOURNAMENT_MIN_PARTICIPANTS - 1 }, (_, i) => row(`u${i}`, 50 + i));
    const r = await settlePreviousWeekTournament(title, NOW);
    expect(r.belowMinimum).toBe(true);
    expect(r.credited).toEqual([]);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('bu haftanın skorları kapanan haftaya karışmaz', async () => {
    state.rows = [row('a', 90), row('b', 80), row('c', 70), row('d', 60), row('late', 999, '2026-10-12')];
    const r = await settlePreviousWeekTournament(title, NOW);
    expect(r.participants).toBe(4);
    expect(r.belowMinimum).toBe(true);
  });
});

describe('invalidateGameRankings', () => {
  it('tüm zamanlar + bu haftanın anahtarı düşer', async () => {
    await invalidateGameRankings('mind-thief', NOW);
    expect(mockDel).toHaveBeenCalledWith('game:lb:all:mind-thief', 'game:lb:week:mind-thief:2026-W42');
  });
});

describe('withFinishedAttempt — başarım "sonra"sı tek sorgusuz türetilir', () => {
  const basis: AchievementBasis = {
    perGame: [{ gameType: 'mind-thief', plays: 3, best: 10 }],
    totalWins: 2,
    wonDays: ['2026-10-10', '2026-10-11'],
  };

  it('kazanılan deneme: yeni oyun türü, galibiyet, seri günü ve en iyi skor işlenir', () => {
    const after = statsFromBasis(
      withFinishedAttempt(basis, { gameType: 'data-snake', status: 'completed', score: 40, dayKey: '2026-10-12' })
    );
    expect(after).toMatchObject({ totalWins: 3, distinctGames: 2, totalPlays: 4, streak: 3, bestScore: 40 });
  });

  it('kaybedilen deneme: yalnız oynama sayılır; aynı gün ikinci galibiyet seriyi şişirmez', () => {
    const lost = statsFromBasis(withFinishedAttempt(basis, { gameType: 'mind-thief', status: 'failed', score: 5, dayKey: '2026-10-12' }));
    expect(lost).toMatchObject({ totalWins: 2, distinctGames: 1, totalPlays: 4, streak: 2, bestScore: 10 });
    const sameDay = withFinishedAttempt(basis, { gameType: 'mind-thief', status: 'completed', score: 12, dayKey: '2026-10-11' });
    expect(sameDay.wonDays).toEqual(['2026-10-10', '2026-10-11']);
    expect(statsFromBasis(sameDay).bestScore).toBe(12);
  });

  it('0 skorlu "kazanma" galibiyet sayılmaz (eski sorgu: starsCollected > 0)', () => {
    const b = withFinishedAttempt(basis, { gameType: 'mind-thief', status: 'completed', score: 0, dayKey: '2026-10-12' });
    expect(b.totalWins).toBe(2);
  });
});
