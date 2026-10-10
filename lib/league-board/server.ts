/**
 * Lig sıralaması — sunucu katmanı (Oyna → Lig, `/customer/leaderboard`).
 *
 * Eski `/api/leaderboard` yolunun dört kusurunu yapısal olarak kapatır:
 *  - Skor TEK metrikten gelir ve seçili DÖNEME uyar (B3, B4):
 *      puan     → `points_credited` defteri (mintPoints'in aynı tx'te yazdığı olay); escrow iadesi,
 *                 admin düzeltmesi, açılış bakiyesi ve demo tohumu "kazanç" sayılmaz. Tüm zamanlar:
 *                 güncel bakiye (lig de bundan hesaplanır).
 *      yorum    → silinmemiş (`deletedAt IS NULL`) ve güven bayraksız (`trustFlagged = false`) yorum.
 *      rozet    → `UserBadge.earnedAt` dönem içinde.
 *      davet    → yalnız `COMPLETED` davet, `completedAt` dönem içinde.
 *  - Kendi sıran listeyle aynı metrik/dönem/tie-break ile hesaplanır (B5) — `ranking.ts`.
 *  - Gizlilik: "Liderlik tablosunda göster" kapalıysa başkalarının listesinde yoksun (B1);
 *    tercihler okunamazsa liste VERİLMEZ (fail-closed; gizlilik tahminle ihlal edilmez).
 *  - Güven: `fraudStatus ≠ clean`, demo, anonimleştirilmiş ve askıdaki hesaplar başkalarının
 *    listesinde yoktur (B2). İzleyici kendi görünümünde kendini normal görür (gölge yasak anlamı).
 *
 * Ağır kısım (kullanıcıdan bağımsız sıralı liste) `(kategori, dönem anahtarı)` ile 60 sn
 * önbelleklenir; izleyiciye özel kısım (sıra, fark, sayfa) bellekte hesaplanır.
 */
import { Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';
import { LEADERBOARD_RANKING_TAG } from '@/lib/cache-tags';
import { publicDisplayName } from '@/lib/http/dto';
import { getLeagueRules, type LeagueRule } from '@/lib/league-rules';
import {
  previousWeekWindow,
  resolveWindow,
  type LeagueCategory,
  type LeaguePeriod,
  type LeagueWindow,
} from './periods';
import {
  buildViewerList,
  gapToAbove,
  gapToTop,
  pageCount,
  pageSlice,
  type RankEntry,
} from './ranking';
import type { LeagueBoardDTO, LeagueMeDTO, LeagueRowDTO } from './types';

/** Önbelleğe alınan sıralı listenin üst sınırı (≈ 1 MB; Next veri önbelleği 2 MB sınırının altında). */
export const RANK_CAP = 15_000;
export const PAGE_SIZE = 25;

/**
 * "Kazanç" sayılmayan `points_credited` kategorileri: kullanıcının kendi parasının iadesi,
 * yönetici düzeltmesi ve sentetik bakiyeler. Bunlar sıralamayı şişirmesin.
 */
export const NON_EARNING_POINT_CATEGORIES = [
  'squad_escrow_refund',
  'admin_adjust',
  'opening_balance',
  'demo_seed',
  'reversal',
] as const;

const USER_SETTINGS_PREFIX = 'user_settings_';

// ───────────────────────────── SQL ─────────────────────────────

type RawRankRow = { uid: string; score: bigint | number; tb: Date | string | null };

/** Başkalarının listesine girebilecek hesaplar (izleyicinin kendi skoru bu filtre olmadan okunur). */
const RANKABLE_USER = Prisma.sql`u."role" = 'CUSTOMER'::"Role"
  AND u."fraudStatus" = 'clean'
  AND u."isDemo" = false
  AND u."anonymizedAt" IS NULL
  AND u."suspendedAt" IS NULL`;

function windowFilter(column: string, w: LeagueWindow): Prisma.Sql {
  if (!w.start || !w.end) return Prisma.empty;
  const col = Prisma.raw(column);
  return Prisma.sql`AND ${col} >= ${w.start} AND ${col} < ${w.end}`;
}

/**
 * Bir kategori + pencere için sıralama sorgusu. `onlyUserId` verilirse kullanıcı filtresi yerine
 * yalnız o kullanıcının skoru okunur (aynı metrik — kendi sıran için).
 */
export function rankingSql(
  category: LeagueCategory,
  w: LeagueWindow,
  opts: { onlyUserId?: string; cap?: number } = {}
): Prisma.Sql {
  const who = opts.onlyUserId ? Prisma.sql`u."id" = ${opts.onlyUserId}` : RANKABLE_USER;
  const limit = opts.onlyUserId ? Prisma.empty : Prisma.sql`ORDER BY score DESC, tb ASC, uid ASC LIMIT ${opts.cap ?? RANK_CAP}`;

  if (category === 'points' && (!w.start || !w.end)) {
    // Tüm zamanlar: güncel bakiye (lig de buna göre). Tie-break: hesabı önce açan.
    return Prisma.sql`
      SELECT u."id" AS uid, u."points"::bigint AS score, u."createdAt" AS tb
      FROM "User" u
      WHERE u."points" > 0 AND ${who}
      ${limit}`;
  }
  if (category === 'points') {
    const pts = Prisma.sql`CASE WHEN jsonb_typeof(e."data"->'points') = 'number'
      THEN FLOOR((e."data"->>'points')::numeric) ELSE 0 END`;
    return Prisma.sql`
      SELECT e."userId" AS uid, SUM(${pts})::bigint AS score, MAX(e."createdAt") AS tb
      FROM "AnalyticsEvent" e
      JOIN "User" u ON u."id" = e."userId"
      WHERE e."event" = 'points_credited'
        AND e."category" NOT IN (${Prisma.join([...NON_EARNING_POINT_CATEGORIES])})
        ${windowFilter('e."createdAt"', w)}
        AND ${who}
      GROUP BY e."userId"
      HAVING SUM(${pts}) > 0
      ${limit}`;
  }
  if (category === 'feedbacks') {
    return Prisma.sql`
      SELECT f."userId" AS uid, COUNT(*)::bigint AS score, MAX(f."createdAt") AS tb
      FROM "Feedback" f
      JOIN "User" u ON u."id" = f."userId"
      WHERE f."deletedAt" IS NULL AND f."trustFlagged" = false
        ${windowFilter('f."createdAt"', w)}
        AND ${who}
      GROUP BY f."userId"
      ${limit}`;
  }
  if (category === 'badges') {
    return Prisma.sql`
      SELECT b."userId" AS uid, COUNT(*)::bigint AS score, MAX(b."earnedAt") AS tb
      FROM "UserBadge" b
      JOIN "User" u ON u."id" = b."userId"
      WHERE TRUE ${windowFilter('b."earnedAt"', w)}
        AND ${who}
      GROUP BY b."userId"
      ${limit}`;
  }
  // referrals
  return Prisma.sql`
    SELECT r."referrerId" AS uid, COUNT(*)::bigint AS score,
           MAX(COALESCE(r."completedAt", r."createdAt")) AS tb
    FROM "Referral" r
    JOIN "User" u ON u."id" = r."referrerId"
    WHERE r."status" = 'COMPLETED'
      ${windowFilter('r."completedAt"', w)}
      AND ${who}
    GROUP BY r."referrerId"
    ${limit}`;
}

function toEntry(row: RawRankRow): RankEntry | null {
  if (!row || typeof row.uid !== 'string') return null;
  const score = Number(row.score);
  if (!Number.isFinite(score) || score <= 0) return null;
  const tbDate = row.tb instanceof Date ? row.tb : row.tb ? new Date(row.tb) : null;
  const tb = tbDate && !Number.isNaN(tbDate.getTime()) ? tbDate.getTime() : 0;
  return [row.uid, score, tb] as const;
}

async function queryRanking(category: LeagueCategory, w: LeagueWindow): Promise<RankEntry[]> {
  const rows = await prisma.$queryRaw<RawRankRow[]>(rankingSql(category, w));
  const out: RankEntry[] = [];
  for (const r of rows) {
    const e = toEntry(r);
    if (e) out.push(e);
  }
  return out;
}

function windowFromArgs(period: LeaguePeriod, key: string, startMs: number | null, endMs: number | null): LeagueWindow {
  return {
    period,
    key,
    start: startMs == null ? null : new Date(startMs),
    end: endMs == null ? null : new Date(endMs),
  };
}

/** Süren dönemler: 60 sn. Anahtar (kategori, dönem, pencere) → yeni hafta/sezon yeni girdi açar. */
const getLiveRanking = unstable_cache(
  async (category: LeagueCategory, period: LeaguePeriod, key: string, startMs: number | null, endMs: number | null) =>
    queryRanking(category, windowFromArgs(period, key, startMs, endMs)),
  ['league-board-ranking-v1'],
  { revalidate: 60, tags: [LEADERBOARD_RANKING_TAG] }
);

/** Tamamlanmış dönemler (geçen hafta): değişmez → 1 saat. */
const getClosedRanking = unstable_cache(
  async (category: LeagueCategory, period: LeaguePeriod, key: string, startMs: number | null, endMs: number | null) =>
    queryRanking(category, windowFromArgs(period, key, startMs, endMs)),
  ['league-board-ranking-closed-v1'],
  { revalidate: 3600, tags: [LEADERBOARD_RANKING_TAG] }
);

/**
 * "Liderlik tablosunda göster" tercihini kapatanlar (`Settings.user_settings_<id>.preferences.showLeaderboard === false`).
 * 60 sn önbellek. Hata yukarı fırlar: tercihler bilinmeden liste gösterilmez.
 */
const getOptOutIds = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.settings.findMany({
      where: {
        key: { startsWith: USER_SETTINGS_PREFIX },
        value: { path: ['preferences', 'showLeaderboard'], equals: false },
      },
      select: { key: true },
      take: 100_000,
    });
    return rows.map((r) => r.key.slice(USER_SETTINGS_PREFIX.length)).filter(Boolean);
  },
  ['league-board-optouts-v1'],
  { revalidate: 60, tags: [LEADERBOARD_RANKING_TAG] }
);

/** İzleyicinin KENDİ tercihi — önbelleksiz (ayarı değiştirir değiştirmez kendi görünümüne yansır). */
async function readOwnVisibility(userId: string): Promise<boolean> {
  const row = await prisma.settings.findUnique({
    where: { key: `${USER_SETTINGS_PREFIX}${userId}` },
    select: { value: true },
  });
  const prefs = (row?.value as { preferences?: { showLeaderboard?: unknown } } | null | undefined)?.preferences;
  return prefs?.showLeaderboard !== false;
}

async function readOwnEntry(category: LeagueCategory, w: LeagueWindow, userId: string): Promise<RankEntry | null> {
  const rows = await prisma.$queryRaw<RawRankRow[]>(rankingSql(category, w, { onlyUserId: userId }));
  return rows[0] ? toEntry(rows[0]) : null;
}

// ───────────────────────────── Lig ─────────────────────────────

/**
 * Lig çözümü — son lig AÇIK UÇLUDUR: `maxPoints` üstündeki bakiye en üst ligde kalır
 * (çekirdek yardımcı 100.000 üstünü Başlangıç'a düşürüyordu; yol haritası §5.3 notu).
 */
export function resolveLeague(points: number, rules: LeagueRule[]) {
  const list = [...rules].sort((a, b) => a.minPoints - b.minPoints);
  const p = Math.max(0, Math.floor(points) || 0);
  let idx = 0;
  for (let i = 0; i < list.length; i++) {
    if (p >= (list[i] as LeagueRule).minPoints) idx = i;
  }
  const current = list[idx] as LeagueRule;
  const next = idx < list.length - 1 ? (list[idx + 1] as LeagueRule) : null;
  let progress = 100;
  if (next) {
    const span = Math.max(1, next.minPoints - current.minPoints);
    progress = Math.max(0, Math.min(100, Math.floor(((p - current.minPoints) / span) * 100)));
  }
  return { current, next, progress, isTop: next === null };
}

// ───────────────────────────── Kimlik ─────────────────────────────

/** Ham id yerine opak, kararlı anahtar (eski uçla aynı türetme; geri çevrilemez). */
export function publicLeagueKey(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'qratex-leaderboard';
  return 'lb_' + createHmac('sha256', secret).update(`lb:${userId}`).digest('hex').slice(0, 20);
}

// ───────────────────────────── Birleştirme ─────────────────────────────

type UserCard = { id: string; name: string | null; image: string | null; level: number; points: number };

export type BuildBoardInput = {
  viewerId: string;
  category: LeagueCategory;
  period: LeaguePeriod;
  page?: number;
  now?: Date;
};

export class LeagueViewerNotFoundError extends Error {
  constructor() {
    super('Oyuncu bulunamadı.');
    this.name = 'LeagueViewerNotFoundError';
  }
}

function windowArgs(w: LeagueWindow): [LeaguePeriod, string, number | null, number | null] {
  return [w.period, w.key, w.start ? w.start.getTime() : null, w.end ? w.end.getTime() : null];
}

export async function buildLeagueBoard(input: BuildBoardInput): Promise<LeagueBoardDTO> {
  const { viewerId, category, period } = input;
  const now = input.now ?? new Date();
  const w = resolveWindow(period, now);

  const [ranked, optOutIds, rules, viewer, ownVisible] = await Promise.all([
    getLiveRanking(category, ...windowArgs(w)),
    getOptOutIds(),
    getLeagueRules(),
    prisma.user.findUnique({
      where: { id: viewerId },
      select: { id: true, name: true, image: true, level: true, points: true },
    }),
    readOwnVisibility(viewerId),
  ]);
  if (!viewer) throw new LeagueViewerNotFoundError();

  const hidden = new Set(optOutIds);
  let viewerEntry: RankEntry | null = ranked.find((e) => e[0] === viewerId) ?? null;
  if (!viewerEntry) {
    // Listede yok: skoru 0, güven incelemesinde ya da sınır dışında → kendi skorunu aynı metrikle oku.
    viewerEntry = await readOwnEntry(category, w, viewerId);
  }

  const view = buildViewerList(ranked, { viewerId, viewerEntry, hiddenIds: hidden, cap: RANK_CAP });
  const total = view.list.length;
  const slice = pageSlice(total, input.page ?? 1, PAGE_SIZE);
  const podiumEntries = view.list.slice(0, 3);
  const pageEntries = view.list.slice(slice.from, slice.to);

  // Geçen haftanın ilk 3'ü (yalnız haftalık görünüm). İzleyici kendini yine görür.
  let lastWeekEntries: RankEntry[] | null = null;
  if (period === 'week') {
    const prev = previousWeekWindow(now);
    const prevRanked = await getClosedRanking(category, ...windowArgs(prev));
    lastWeekEntries = prevRanked.filter((e) => e[0] === viewerId || !hidden.has(e[0])).slice(0, 3);
  }

  const ids = new Set<string>([viewerId]);
  for (const e of podiumEntries) ids.add(e[0]);
  for (const e of pageEntries) ids.add(e[0]);
  for (const e of lastWeekEntries ?? []) ids.add(e[0]);
  ids.delete(viewerId);
  const others: UserCard[] = ids.size
    ? await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, name: true, image: true, level: true, points: true },
      })
    : [];
  const cards = new Map<string, UserCard>(others.map((u) => [u.id, u]));
  cards.set(viewer.id, viewer);

  const toRow = (e: RankEntry, rank: number): LeagueRowDTO | null => {
    const u = cards.get(e[0]);
    if (!u) return null; // arada silinmiş/anonimleşmiş: uydurma satır yok
    const isMe = u.id === viewerId;
    const league = resolveLeague(u.points, rules).current;
    return {
      key: publicLeagueKey(u.id),
      rank,
      name: isMe ? u.name?.trim() || 'Sen' : publicDisplayName(u.name, 'Oyuncu'),
      image: u.image ?? null,
      level: u.level,
      leagueKey: league.key,
      leagueName: league.name,
      score: e[1],
      isMe,
      ...(isMe && !ownVisible ? { hiddenFromOthers: true } : {}),
    };
  };

  const podium = podiumEntries.map((e, i) => toRow(e, i + 1)).filter((r): r is LeagueRowDTO => r !== null);
  const rows = pageEntries
    .map((e, i) => toRow(e, slice.from + i + 1))
    .filter((r): r is LeagueRowDTO => r !== null);
  const lastWeekPodium = lastWeekEntries
    ? lastWeekEntries.map((e, i) => toRow(e, i + 1)).filter((r): r is LeagueRowDTO => r !== null)
    : null;

  const lg = resolveLeague(viewer.points, rules);
  const rank = view.viewerIndex >= 0 ? view.viewerIndex + 1 : null;
  const me: LeagueMeDTO = {
    key: publicLeagueKey(viewer.id),
    name: viewer.name?.trim() || 'Sen',
    image: viewer.image ?? null,
    level: viewer.level,
    points: viewer.points,
    league: {
      key: lg.current.key,
      name: lg.current.name,
      minPoints: lg.current.minPoints,
      maxPoints: lg.isTop ? null : lg.current.maxPoints,
    },
    nextLeague: lg.next
      ? {
          key: lg.next.key,
          name: lg.next.name,
          minPoints: lg.next.minPoints,
          pointsNeeded: Math.max(0, lg.next.minPoints - viewer.points),
        }
      : null,
    leagueProgress: lg.progress,
    score: viewerEntry && viewerEntry[1] > 0 ? viewerEntry[1] : 0,
    rank,
    rankFloor: view.viewerBeyondCap ? RANK_CAP + 1 : null,
    page: rank ? Math.ceil(rank / PAGE_SIZE) : null,
    gapToNext: rank ? gapToAbove(view.list, view.viewerIndex) : null,
    gapToTop10: rank ? gapToTop(view.list, view.viewerIndex, 10) : null,
    visibleToOthers: ownVisible,
  };

  return {
    category,
    period,
    window: {
      key: w.key,
      startsAt: w.start ? w.start.toISOString() : null,
      endsAt: w.end ? w.end.toISOString() : null,
      seasonNumber: w.seasonNumber ?? null,
    },
    podium,
    rows,
    page: slice.page,
    pageSize: PAGE_SIZE,
    pageCount: pageCount(total, PAGE_SIZE),
    total,
    truncated: view.truncated,
    me,
    lastWeekPodium,
    generatedAt: now.toISOString(),
  };
}
