/**
 * Oyna merkezi sunucu veri katmanı (lib/play-hub/server):
 *  - bölümler bağımsız: bir sorgu düşerse yalnız o bölüm `ok:false` olur, diğerleri gelir
 *    ("200 + sıfırlar" yok — hata görünür);
 *  - bugünkü denemeler, talep edilmiş görevler, paso XP'si, oyun puanı tavanı doğru kaynaktan;
 *  - turnuva: ilk 10 kısaltılmış adla, "sen", bekleyen ödül (talep edilmediyse).
 * Gerçek DB'ye gidilmez.
 */
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));

const NOW = new Date('2026-10-10T12:00:00Z'); // Cumartesi, W41
const state = {
  todayRows: [] as Array<Record<string, unknown>>,
  ledgerKeys: [] as string[],
  passXp: 0 as number | null,
  streakFails: false,
  weeklyRows: [] as Array<{ userId: string; starsCollected: number; completedAt: Date; gameType: string }>,
  claims: new Set<string>(),
  earnedEvents: [] as Array<{ data: unknown; createdAt: Date }>,
};

const prismaMock = {
  miniGameConfig: { findMany: jest.fn(async () => []) },
  miniGameSession: {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; distinct?: string[] }) => {
      const w = args.where;
      if ('dayKey' in w) return state.todayRows;
      if (args.distinct) {
        if (state.streakFails) throw Object.assign(new Error('boom'), { code: 'P2010' });
        return [{ dayKey: '2026-10-09' }];
      }
      if ('gameType' in w) {
        const range = w.completedAt as { gte: Date; lt: Date };
        return state.weeklyRows.filter(
          (r) => r.gameType === w.gameType && r.completedAt >= range.gte && r.completedAt < range.lt
        );
      }
      return [];
    }),
    groupBy: jest.fn(async () => [{ gameType: 'mind-thief', _count: { _all: 2 }, _max: { starsCollected: 12 } }]),
    count: jest.fn(async () => 1),
  },
  pointsLedger: {
    findMany: jest.fn(async ({ where }: { where: { idempotencyKey: { in: string[] } } }) =>
      where.idempotencyKey.in.filter((k) => state.ledgerKeys.includes(k)).map((k) => ({ idempotencyKey: k }))
    ),
    aggregate: jest.fn(async () => ({ _sum: { xpDelta: state.passXp } })),
  },
  analyticsEvent: { findMany: jest.fn(async () => state.earnedEvents) },
  user: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ id, name: id === 'u1' ? 'Ayşe Kaya' : `Oyuncu ${id} Soyad` }))
    ),
  },
  tournamentRewardClaim: {
    findUnique: jest.fn(async ({ where }: { where: { userId_gameType_weekKey: { userId: string; gameType: string; weekKey: string } } }) => {
      const k = where.userId_gameType_weekKey;
      return state.claims.has(`${k.userId}:${k.gameType}:${k.weekKey}`) ? { id: 'c' } : null;
    }),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
  isPrismaConnectivityError: (e: unknown) => (e as { code?: string })?.code === 'P1001',
}));

import { loadGamesTab, loadTournamentTab, shortName } from '@/lib/play-hub/server';
import { featuredGameTypeForWeek } from '@/lib/game-tournament';
import { visibleMiniGames } from '@/lib/minigame-config';

beforeEach(() => {
  state.todayRows = [];
  state.ledgerKeys = [];
  state.passXp = 0;
  state.streakFails = false;
  state.weeklyRows = [];
  state.claims = new Set();
  state.earnedEvents = [];
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loadGamesTab', () => {
  it('bir bölüm düşerse yalnız o bölüm hata döner', async () => {
    state.streakFails = true;
    const d = await loadGamesTab('u1', NOW);
    expect(d.streak).toEqual({ ok: false, error: 'failed' });
    expect(d.today.ok).toBe(true);
    expect(d.pass.ok).toBe(true);
    expect(d.catalog.length).toBeGreaterThan(0);
  });

  it('bugünkü durum + talep edilmiş görev + paso XP + oyun puanı', async () => {
    state.todayRows = [
      { gameType: 'mind-thief', status: 'completed', starsCollected: 14, rewardPoints: 170, startedAt: NOW, serverStartedAt: NOW, expiresAt: null },
    ];
    state.ledgerKeys = ['game_quest:u1:2026-10-10:play-1'];
    state.passXp = 450;
    state.earnedEvents = [{ data: { points: 170 }, createdAt: NOW }];
    const d = await loadGamesTab('u1', NOW);
    if (!d.today.ok || !d.pass.ok || !d.earnings.ok) throw new Error('bölüm yüklenmedi');
    expect(d.today.data.entries.get('mind-thief')?.state).toBe('won');
    expect(d.today.data.resetAt).toBe('2026-10-11T00:00:00.000Z');
    const play = d.today.data.quests.find((q) => q.quest.id === 'play-1')!;
    const win = d.today.data.quests.find((q) => q.quest.id === 'win-1')!;
    expect(play).toMatchObject({ done: true, claimed: true });
    expect(win).toMatchObject({ done: true, claimed: false });
    expect(d.pass.data.progress.tier).toBe(2);
    expect(d.earnings.data).toMatchObject({ today: 170, dailyCap: 600 });
    // paso yalnız oyun kaynaklarından, yalnız posted, bu ay
    const aggArgs = (prismaMock.pointsLedger.aggregate.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(aggArgs).toMatchObject({ userId: 'u1', status: 'posted', source: { in: ['game', 'game_streak', 'game_quest'] } });
    // öne çıkan oyun bugün kazanılan oyun olamaz
    expect(d.featured?.gameType).not.toBe('mind-thief');
  });
});

describe('loadTournamentTab', () => {
  const candidates = visibleMiniGames().map((g) => g.gameType);
  const featured = featuredGameTypeForWeek('2026-W41', candidates)!;
  const prev = featuredGameTypeForWeek('2026-W40', candidates)!;

  it('ilk 10, kısaltılmış ad, "sen" ve katılım eşiği', async () => {
    state.weeklyRows = [
      { userId: 'u2', starsCollected: 20, completedAt: new Date('2026-10-06T10:00:00Z'), gameType: featured },
      { userId: 'u1', starsCollected: 15, completedAt: new Date('2026-10-07T10:00:00Z'), gameType: featured },
    ];
    const d = await loadTournamentTab('u1', NOW);
    if (!d.tournament.ok) throw new Error('turnuva yüklenmedi');
    const t = d.tournament.data;
    expect(t.featured?.gameType).toBe(featured);
    expect(t.leaderboard.map((r) => r.rank)).toEqual([1, 2]);
    expect(t.leaderboard[1]).toMatchObject({ name: 'Ayşe K.', isMe: true, score: 15 });
    expect(t.me).toEqual({ rank: 2, score: 15 });
    expect(t.prizesActive).toBe(false);
    expect(t.participantsNeeded).toBe(3);
    expect(t.pendingReward).toBeNull();
  });

  it('geçen haftanın ilk 3’ü + yeterli katılım → bekleyen ödül; talep edildiyse yok', async () => {
    const prevWeek = (uid: string, s: number) => ({
      userId: uid,
      starsCollected: s,
      completedAt: new Date('2026-09-30T10:00:00Z'),
      gameType: prev,
    });
    state.weeklyRows = [prevWeek('u1', 50), prevWeek('a', 40), prevWeek('b', 30), prevWeek('c', 20), prevWeek('d', 10)];
    let d = await loadTournamentTab('u1', NOW);
    expect(d.tournament.ok && d.tournament.data.pendingReward).toMatchObject({ rank: 1, points: 500, weekKey: '2026-W40' });
    state.claims.add(`u1:${prev}:2026-W40`);
    d = await loadTournamentTab('u1', NOW);
    expect(d.tournament.ok && d.tournament.data.pendingReward).toBeNull();
  });

  it('kısaltılmış ad', () => {
    expect(shortName('Mehmet Ali Yılmaz')).toBe('Mehmet Y.');
    expect(shortName(null)).toBe('Oyuncu');
  });
});
