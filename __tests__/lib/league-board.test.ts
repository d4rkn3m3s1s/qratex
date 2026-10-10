/**
 * Oyna → Lig sıralama çekirdeği (lib/league-board). Gerçek DB'ye gidilmez.
 *
 *  - Dönemler İstanbul takviminde (hafta Pazartesi 00:00, sezon 8 hafta).
 *  - Tie-break kararlı; gizli oyuncu başkalarının listesinde yok; izleyici kendini her zaman görür.
 *  - Kendi sıran listeyle aynı metrik/dönemle (B5); gölge/inceleme hesabı kendi görünümünde normal.
 *  - Yanıtta ham id / tam ad (başkası) / fraud sinyali yok; gizlilik tercihi okunamazsa fail-closed.
 */
import { Prisma } from '@prisma/client';

process.env.NEXTAUTH_SECRET = 'test-secret-league-board-0123456789';

// Test ortamında üretilmiş istemci yok: SQL şablon yardımcıları Prisma çalışma zamanından.
jest.mock('@prisma/client', () => {
  const r = jest.requireActual('@prisma/client/runtime/library');
  return { Prisma: { sql: r.sqltag, join: r.join, raw: r.raw, empty: r.empty, Sql: r.Sql } };
});
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: jest.fn() }));

const mockQueryRaw = jest.fn();
const mockSettingsFindMany = jest.fn();
const mockSettingsFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
    settings: {
      findMany: (...a: unknown[]) => mockSettingsFindMany(...a),
      findUnique: (...a: unknown[]) => mockSettingsFindUnique(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
    },
  },
}));
jest.mock('@/lib/league-rules', () => {
  const core = jest.requireActual('@/lib/league-rules-core');
  return { getLeagueRules: jest.fn(async () => core.DEFAULT_LEAGUE_RULES) };
});

import {
  istanbulWeekStart,
  previousWeekWindow,
  resolveWindow,
  seasonWindow,
  weekWindow,
} from '@/lib/league-board/periods';
import {
  buildViewerList,
  compareEntries,
  gapToAbove,
  gapToTop,
  pageSlice,
  sortEntries,
  type RankEntry,
} from '@/lib/league-board/ranking';
import { buildLeagueBoard, rankingSql, resolveLeague, RANK_CAP } from '@/lib/league-board/server';
import { DEFAULT_LEAGUE_RULES } from '@/lib/league-rules-core';

const NOW = new Date('2026-10-10T09:00:00Z'); // Cumartesi, İstanbul 12:00

describe('dönemler (Europe/Istanbul)', () => {
  it('hafta İstanbul Pazartesi 00:00 → sonraki Pazartesi', () => {
    const w = weekWindow(NOW);
    expect(w.start?.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(w.end?.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(w.key).toBe('W2026-10-05');
  });

  it('Pazar gecesi 23:30 İstanbul hâlâ aynı haftadır; Pazartesi 00:30 yeni hafta', () => {
    expect(istanbulWeekStart(new Date('2026-10-11T20:30:00Z')).toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(istanbulWeekStart(new Date('2026-10-11T21:30:00Z')).toISOString()).toBe('2026-10-11T21:00:00.000Z');
  });

  it('geçen hafta tamamlanmış pencere', () => {
    const w = previousWeekWindow(NOW);
    expect(w.start?.toISOString()).toBe('2026-09-27T21:00:00.000Z');
    expect(w.end?.toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });

  it('sezon 8 haftalık, çapadan sayılır', () => {
    const s = seasonWindow(NOW);
    expect(s.seasonNumber).toBe(5);
    expect(s.key).toBe('S5');
    expect(s.start?.toISOString()).toBe('2026-08-16T21:00:00.000Z');
    expect(s.end?.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(seasonWindow(new Date('2026-10-12T06:00:00Z')).seasonNumber).toBe(6);
  });

  it('tüm zamanlar pencere taşımaz', () => {
    expect(resolveWindow('all', NOW)).toMatchObject({ key: 'ALL', start: null, end: null });
  });
});

describe('sıralama çekirdeği', () => {
  const e = (uid: string, score: number, tb: number): RankEntry => [uid, score, tb];

  it('skor ↓, sonra skora önce ulaşan, sonra id — kararlı', () => {
    const sorted = sortEntries([e('b', 10, 5), e('a', 10, 5), e('c', 10, 1), e('d', 20, 9)]);
    expect(sorted.map((x) => x[0])).toEqual(['d', 'c', 'a', 'b']);
    expect(compareEntries(e('a', 1, 1), e('a', 1, 1))).toBe(0);
  });

  it('gizli oyuncu listeden çıkar, izleyici doğru yere eklenir', () => {
    const ranked = [e('u1', 500, 1), e('u4', 400, 1), e('u2', 300, 2), e('me', 300, 9), e('u3', 100, 1)];
    const v = buildViewerList(ranked, {
      viewerId: 'me',
      viewerEntry: e('me', 300, 9),
      hiddenIds: new Set(['u4', 'me']),
      cap: RANK_CAP,
    });
    expect(v.list.map((x) => x[0])).toEqual(['u1', 'u2', 'me', 'u3']);
    expect(v.viewerIndex).toBe(2);
    expect(gapToAbove(v.list, v.viewerIndex)).toBe(1); // eşit skor, tie-break onda → +1
    expect(gapToTop(v.list, v.viewerIndex, 2)).toBe(1);
    expect(gapToTop(v.list, 0, 2)).toBeNull();
  });

  it('skoru olmayan izleyici sıralamada yoktur', () => {
    const v = buildViewerList([e('u1', 5, 1)], { viewerId: 'me', viewerEntry: null, hiddenIds: new Set(), cap: 10 });
    expect(v.viewerIndex).toBe(-1);
    expect(v.list).toHaveLength(1);
  });

  it('kesilen listenin altında kalan izleyiciye sıra uydurulmaz', () => {
    const ranked = [e('u1', 50, 1), e('u2', 40, 1)];
    const v = buildViewerList(ranked, { viewerId: 'me', viewerEntry: e('me', 10, 1), hiddenIds: new Set(), cap: 2 });
    expect(v).toMatchObject({ viewerIndex: -1, viewerBeyondCap: true, truncated: true });
  });

  it('sayfa dilimi aralık dışını son sayfaya sıkıştırır', () => {
    expect(pageSlice(60, 1, 25)).toEqual({ page: 1, from: 0, to: 25 });
    expect(pageSlice(60, 3, 25)).toEqual({ page: 3, from: 50, to: 60 });
    expect(pageSlice(60, 99, 25)).toEqual({ page: 3, from: 50, to: 60 });
    expect(pageSlice(0, 4, 25)).toEqual({ page: 1, from: 0, to: 0 });
  });
});

describe('lig çözümü', () => {
  it('son lig açık uçlu (100.000 üstü Başlangıç’a düşmez)', () => {
    expect(resolveLeague(150_000, DEFAULT_LEAGUE_RULES).current.key).toBe('ZENOR');
    expect(resolveLeague(150_000, DEFAULT_LEAGUE_RULES).next).toBeNull();
  });
  it('bir üst lige kalan ve ilerleme', () => {
    const r = resolveLeague(4000, DEFAULT_LEAGUE_RULES);
    expect(r.current.key).toBe('KOR');
    expect(r.next?.key).toBe('VEYRA');
    expect(r.progress).toBeGreaterThan(40);
    expect(r.progress).toBeLessThan(60);
  });
});

describe('SQL: tek metrik, dönem filtresi, güven filtresi', () => {
  const text = (s: Prisma.Sql) => s.sql.replace(/\s+/g, ' ');

  it('haftalık puan defterden; iadeler/admin düzeltmesi sayılmaz; güvenilir hesaplar', () => {
    const s = rankingSql('points', weekWindow(NOW));
    expect(text(s)).toContain(`e."event" = 'points_credited'`);
    expect(text(s)).toContain('e."category" NOT IN');
    expect(s.values).toEqual(expect.arrayContaining(['squad_escrow_refund', 'admin_adjust']));
    expect(text(s)).toContain(`u."fraudStatus" = 'clean'`);
    expect(text(s)).toContain('u."isDemo" = false');
    expect(text(s)).not.toContain('length(');
  });

  it('yorum: silinmemiş + güven bayraksız + dönem içinde', () => {
    const s = text(rankingSql('feedbacks', weekWindow(NOW)));
    expect(s).toContain('f."deletedAt" IS NULL');
    expect(s).toContain('f."trustFlagged" = false');
    expect(s).toContain('f."createdAt" >=');
  });

  it('davet: yalnız COMPLETED; rozet: earnedAt dönemi', () => {
    expect(text(rankingSql('referrals', seasonWindow(NOW)))).toContain(`r."status" = 'COMPLETED'`);
    expect(text(rankingSql('badges', seasonWindow(NOW)))).toContain('b."earnedAt" >=');
  });

  it('tüm zamanlar puanı bakiyeden, pencere yok', () => {
    const s = text(rankingSql('points', resolveWindow('all', NOW)));
    expect(s).toContain('u."points"');
    expect(s).not.toContain('AnalyticsEvent');
  });

  it('kendi skor sorgusu güven filtresi olmadan yalnız izleyiciyi okur', () => {
    const s = rankingSql('points', weekWindow(NOW), { onlyUserId: 'me' });
    expect(text(s)).not.toContain('fraudStatus');
    expect(s.values).toContain('me');
  });
});

describe('buildLeagueBoard', () => {
  const user = (id: string, name: string, points = 4000) => ({ id, name, image: null, level: 3, points });
  const t = (iso: string) => new Date(iso);

  function isOwnQuery(q: Prisma.Sql) {
    return !/LIMIT/.test(q.sql);
  }

  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockSettingsFindMany.mockReset();
    mockSettingsFindUnique.mockReset();
    mockUserFindUnique.mockReset();
    mockUserFindMany.mockReset();
    mockSettingsFindMany.mockResolvedValue([{ key: 'user_settings_u4' }]);
    mockSettingsFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(user('me', 'Furkan Ulu', 4000));
    mockUserFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => user(id, `Ad${id} Soyad${id}`, 20_000))
    );
  });

  it('gizli oyuncu yok, kendi sıran aynı metrikle, ham id ve tam ad sızmaz', async () => {
    mockQueryRaw.mockImplementation(async (q: Prisma.Sql) => {
      if (isOwnQuery(q)) return [];
      return [
        { uid: 'u1', score: BigInt(500), tb: t('2026-10-06T10:00:00Z') },
        { uid: 'u4', score: BigInt(450), tb: t('2026-10-06T10:00:00Z') },
        { uid: 'u2', score: BigInt(300), tb: t('2026-10-06T10:00:00Z') },
        { uid: 'me', score: BigInt(300), tb: t('2026-10-07T10:00:00Z') },
        { uid: 'u3', score: BigInt(100), tb: t('2026-10-06T10:00:00Z') },
      ];
    });
    const board = await buildLeagueBoard({ viewerId: 'me', category: 'points', period: 'week', now: NOW });

    expect(board.total).toBe(4);
    expect(board.me).toMatchObject({ rank: 3, score: 300, gapToNext: 1, visibleToOthers: true, page: 1 });
    expect(board.me.league.key).toBe('KOR');
    expect(board.me.nextLeague).toMatchObject({ key: 'VEYRA', pointsNeeded: 1001 });
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(board.rows.find((r) => r.isMe)?.name).toBe('Furkan Ulu');
    expect(board.rows[0]?.name).toBe('Adu1 S.');
    expect(board.podium).toHaveLength(3);
    expect(board.lastWeekPodium).not.toBeNull();

    const json = JSON.stringify(board);
    for (const raw of [':"u1"', ':"u2"', ':"u3"', ':"u4"', ':"me"', 'Soyadu1', 'needsReview', 'fraud']) {
      expect(json).not.toContain(raw);
    }
  });

  it('gizli moddaki izleyici kendini görür ama başkaları görmez işareti taşır', async () => {
    mockSettingsFindUnique.mockResolvedValue({ value: { preferences: { showLeaderboard: false } } });
    mockSettingsFindMany.mockResolvedValue([{ key: 'user_settings_me' }]);
    mockQueryRaw.mockImplementation(async (q: Prisma.Sql) =>
      isOwnQuery(q) ? [] : [{ uid: 'me', score: 50, tb: t('2026-10-06T10:00:00Z') }]
    );
    const board = await buildLeagueBoard({ viewerId: 'me', category: 'feedbacks', period: 'season', now: NOW });
    expect(board.me).toMatchObject({ rank: 1, visibleToOthers: false });
    expect(board.rows[0]).toMatchObject({ isMe: true, hiddenFromOthers: true });
    expect(board.lastWeekPodium).toBeNull();
    expect(board.window.seasonNumber).toBe(5);
  });

  it('güven incelemesindeki izleyici (listede yok) kendi skoruyla doğru konuma eklenir', async () => {
    mockQueryRaw.mockImplementation(async (q: Prisma.Sql) =>
      isOwnQuery(q)
        ? [{ uid: 'me', score: BigInt(250), tb: t('2026-10-06T10:00:00Z') }]
        : [
            { uid: 'u1', score: BigInt(500), tb: t('2026-10-06T10:00:00Z') },
            { uid: 'u2', score: BigInt(100), tb: t('2026-10-06T10:00:00Z') },
          ]
    );
    const board = await buildLeagueBoard({ viewerId: 'me', category: 'points', period: 'all', now: NOW });
    expect(board.me.rank).toBe(2);
    expect(board.rows.map((r) => (r.isMe ? 'me' : r.rank))).toEqual([1, 'me', 3]);
  });

  it('skoru olmayan izleyici: sıra yok, dürüst boş', async () => {
    mockQueryRaw.mockResolvedValue([]);
    const board = await buildLeagueBoard({ viewerId: 'me', category: 'badges', period: 'week', now: NOW });
    expect(board.total).toBe(0);
    expect(board.me).toMatchObject({ rank: null, score: 0, page: null, gapToNext: null });
    expect(board.rows).toEqual([]);
  });

  it('gizlilik tercihleri okunamazsa liste verilmez (fail-closed)', async () => {
    mockSettingsFindMany.mockRejectedValue(new Error('db down'));
    mockQueryRaw.mockResolvedValue([]);
    await expect(buildLeagueBoard({ viewerId: 'me', category: 'points', period: 'week', now: NOW })).rejects.toThrow('db down');
  });

  it('sayfalama: istenen sayfa ve kendi sayfan', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      uid: i === 41 ? 'me' : `p${i}`,
      score: BigInt(1000 - i),
      tb: t('2026-10-06T10:00:00Z'),
    }));
    mockSettingsFindMany.mockResolvedValue([]);
    mockQueryRaw.mockImplementation(async (q: Prisma.Sql) => (isOwnQuery(q) ? [] : rows));
    const board = await buildLeagueBoard({ viewerId: 'me', category: 'points', period: 'week', page: 2, now: NOW });
    expect(board).toMatchObject({ page: 2, pageCount: 3, total: 60 });
    expect(board.rows[0]?.rank).toBe(26);
    expect(board.me).toMatchObject({ rank: 42, page: 2, gapToTop10: 1000 - 9 - (1000 - 41) + 1 });
  });
});
