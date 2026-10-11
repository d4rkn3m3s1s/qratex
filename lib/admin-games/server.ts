/**
 * /admin/games — Oyun Kontrol Odası SUNUCU mantığı (yalnız route'lar ve sunucu sayfası).
 *
 * İlkeler (yol haritası §4.4): sunucu otoriter (etkin değer = `mergeGameConfig`, tek
 * birleştirme), puan basma yalnız lib/economy'de (burada puan basılmaz; yalnız ayar),
 * cascade silme yok (sıfırlama override alanlarını temizler, kapalı oyunun kill-switch'ini
 * korur), her yazım audit'li (oldData + newData), zaman Europe/Istanbul.
 */
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { ALL_GAME_DEFS, defaultEnabledOf, getGameDef, visibleMiniGames, type MiniGameDef } from '@/lib/minigame-config';
import {
  MINIGAME_CONFIG_TAG,
  OVERRIDE_LIMITS,
  mergeGameConfig,
  type OverrideRow,
} from '@/lib/minigame-config-effective';
import { GAME_DAILY_CAP, GAME_WEEKLY_CAP } from '@/lib/economy/caps';
import { featuredGameTypeForWeek, rankWeekly, prizeFor, prizeTable, TOURNAMENT_MIN_PARTICIPANTS } from '@/lib/game-tournament';
import { isoWeekEnd, isoWeekKey, isoWeekStart, previousIsoWeekKey } from '@/lib/tournament-core';
import { getGameEntryByGameType, getRetiredGame, getGameEntry, LEGACY_ALIASES } from '@/lib/games/registry';
import { getVerifierForGameType } from '@/lib/games/registry/server';
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import {
  FIELD_LABELS,
  OVERRIDE_FIELDS,
  pct,
  type BulkInput,
  type Funnel,
  type GameDetail,
  type GamePortfolio,
  type GameRow,
  type GamesOverview,
  type HistoryEntry,
  type OverrideField,
  type TournamentOverview,
} from './contract';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const HISTORY_ACTIONS = ['minigame_config_update', 'minigame_config_reset', 'minigame_config_bulk'];

// ─────────────────────────── Yardımcılar ───────────────────────────

const emptyFunnel = (): Funnel => ({ started: 0, won: 0, lost: 0, active: 0 });

export function addStatus(c: Funnel, status: string, n: number) {
  c.started += n;
  if (status === 'completed') c.won += n;
  else if (status === 'failed' || status === 'abandoned') c.lost += n;
  else c.active += n;
}

type ConfigRow = {
  gameType: string;
  enabled: boolean;
  rewardPoints: number | null;
  rewardXp: number | null;
  rewardThreshold: number | null;
  minDurationSec: number | null;
  maxScore: number | null;
  title: string | null;
  description: string | null;
  emoji: string | null;
  accent: string | null;
  updatedAt?: Date | null;
};

export function toOverrideRow(o: ConfigRow): OverrideRow {
  return {
    gameType: o.gameType,
    enabled: o.enabled,
    rewardPoints: o.rewardPoints,
    rewardXp: o.rewardXp,
    rewardThreshold: o.rewardThreshold,
    minDurationSec: o.minDurationSec,
    maxScore: o.maxScore,
    title: o.title,
    description: o.description,
    emoji: o.emoji,
    accent: o.accent,
  };
}

/** Etkin değeri varsayılandan farklı olan alanlar ("N alan özelleştirildi" — admin B7). */
export function customizedFields(def: MiniGameDef, ov: OverrideRow | null): OverrideField[] {
  if (!ov) return [];
  const eff = mergeGameConfig(def, ov);
  return OVERRIDE_FIELDS.filter((k) => eff[k] !== def[k]);
}

/** Kayıt defteri (portföy) ile sunucu kuralının birleşimi. */
export function portfolioOf(def: MiniGameDef): GamePortfolio {
  const entry = getGameEntryByGameType(def.gameType);
  if (entry) {
    return {
      status: entry.status === 'live' ? 'live' : entry.status === 'building' ? 'building' : 'retired',
      registryId: entry.id,
      role: entry.role,
      verification: entry.verification,
      practice: entry.modes.practice,
      mergedInto: null,
      note: def.hiddenReason ?? null,
    };
  }
  const alias = LEGACY_ALIASES[def.gameType];
  if (alias) {
    const target = getGameEntry(alias.target);
    return {
      status: 'merged',
      registryId: null,
      role: null,
      verification: null,
      practice: false,
      mergedInto: target?.title ?? alias.target,
      note: def.hiddenReason ?? null,
    };
  }
  const retired = getRetiredGame(def.gameType);
  if (retired) {
    return {
      status: 'retired',
      registryId: null,
      role: null,
      verification: null,
      practice: false,
      mergedInto: retired.successor ? getGameEntry(retired.successor)?.title ?? retired.successor : null,
      note: retired.reason,
    };
  }
  return { status: 'legacy', registryId: null, role: null, verification: null, practice: false, mergedInto: null, note: def.hiddenReason ?? null };
}

function shortName(name: string | null | undefined): string {
  if (!name) return 'Oyuncu';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]?.toLocaleUpperCase('tr-TR') ?? ''}.`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function titleOf(gameType: string | null, overrides: Map<string, ConfigRow>): string | null {
  if (!gameType) return null;
  const def = getGameDef(gameType);
  if (!def) return gameType;
  const raw = overrides.get(gameType);
  return mergeGameConfig(def, raw ? toOverrideRow(raw) : null).title;
}

// ─────────────────────────── Genel bakış ───────────────────────────

export async function getGamesOverview(now: Date = new Date()): Promise<GamesOverview> {
  const todayStart = istanbulDayStart(istanbulDay(now));
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since60 = new Date(now.getTime() - 60 * DAY);

  const [overrides, byStatusToday, byStatus30, rewarded30, prevPoints, flags30] = await Promise.all([
    prisma.miniGameConfig.findMany(),
    prisma.miniGameSession.groupBy({
      by: ['gameType', 'status'],
      where: { startedAt: { gte: todayStart } },
      _count: { _all: true },
    }),
    prisma.miniGameSession.groupBy({
      by: ['gameType', 'status'],
      where: { startedAt: { gte: since30 } },
      _count: { _all: true },
    }),
    prisma.miniGameSession.groupBy({
      by: ['gameType'],
      where: { completedAt: { gte: since30 }, rewardPoints: { gt: 0 } },
      _count: { _all: true },
      _sum: { rewardPoints: true },
    }),
    prisma.miniGameSession.aggregate({
      where: { completedAt: { gte: since60, lt: since30 }, rewardPoints: { gt: 0 } },
      _sum: { rewardPoints: true },
    }),
    prisma.$queryRaw<Array<{ gameType: string | null; n: bigint | number }>>`
      SELECT "data"->>'gameType' AS "gameType", COUNT(*) AS n
      FROM "AnalyticsEvent"
      WHERE "event" = 'game_attempt_flagged' AND "createdAt" >= ${since30}
      GROUP BY 1`,
  ]);

  const ovMap = new Map(overrides.map((o) => [o.gameType, o as ConfigRow]));
  const fold = (rows: typeof byStatusToday) => {
    const m = new Map<string, Funnel>();
    for (const r of rows) {
      const c = m.get(r.gameType) ?? emptyFunnel();
      addStatus(c, r.status, r._count._all);
      m.set(r.gameType, c);
    }
    return m;
  };
  const todayMap = fold(byStatusToday);
  const m30Map = fold(byStatus30);
  const rewardMap = new Map(rewarded30.map((g) => [g.gameType, { count: g._count._all, points: g._sum.rewardPoints ?? 0 }]));
  const flagMap = new Map(flags30.map((f) => [f.gameType ?? '', Number(f.n)]));

  const featuredGameType = featuredGameTypeForWeek(isoWeekKey(now), visibleMiniGames().map((g) => g.gameType));

  const games: GameRow[] = ALL_GAME_DEFS.map((def) => {
    const raw = ovMap.get(def.gameType);
    const ov = raw ? toOverrideRow(raw) : null;
    const eff = mergeGameConfig(def, ov);
    const m = m30Map.get(def.gameType) ?? emptyFunnel();
    const rw = rewardMap.get(def.gameType);
    return {
      gameType: def.gameType,
      hidden: !!def.hidden,
      hiddenReason: def.hiddenReason ?? null,
      featured: def.gameType === featuredGameType,
      updatedAt: raw?.updatedAt ? raw.updatedAt.toISOString() : null,
      customizedFields: customizedFields(def, ov),
      portfolio: portfolioOf(def),
      defaults: {
        title: def.title,
        description: def.description,
        emoji: def.emoji,
        accent: def.accent,
        maxScore: def.maxScore,
        rewardThreshold: def.rewardThreshold,
        rewardPoints: def.rewardPoints,
        rewardXp: def.rewardXp,
        minDurationSec: def.minDurationSec,
      },
      override: ov
        ? {
            enabled: ov.enabled,
            title: ov.title,
            description: ov.description,
            emoji: ov.emoji,
            accent: ov.accent,
            maxScore: ov.maxScore,
            rewardThreshold: ov.rewardThreshold,
            rewardPoints: ov.rewardPoints,
            rewardXp: ov.rewardXp,
            minDurationSec: ov.minDurationSec,
          }
        : null,
      effective: {
        enabled: eff.enabled,
        title: eff.title,
        description: eff.description,
        emoji: eff.emoji,
        accent: eff.accent,
        maxScore: eff.maxScore,
        rewardThreshold: eff.rewardThreshold,
        rewardPoints: eff.rewardPoints,
        rewardXp: eff.rewardXp,
        minDurationSec: eff.minDurationSec,
        maxScorePerSec: def.maxScorePerSec ?? null,
        maxDurationSec: eff.maxDurationSec,
      },
      stats: {
        today: todayMap.get(def.gameType) ?? emptyFunnel(),
        last30d: m,
        rewarded30d: rw?.count ?? 0,
        pointsAwarded30d: rw?.points ?? 0,
        flagged30d: flagMap.get(def.gameType) ?? 0,
        winRate30d: pct(m.won, m.won + m.lost),
        rewardRate30d: pct(rw?.count ?? 0, m.started),
      },
    };
  });

  const sum = (f: (g: GameRow) => number) => games.reduce((a, g) => a + f(g), 0);
  const won30 = sum((g) => g.stats.last30d.won);
  const finished30 = won30 + sum((g) => g.stats.last30d.lost);

  return {
    games,
    limits: OVERRIDE_LIMITS,
    caps: { daily: GAME_DAILY_CAP, weekly: GAME_WEEKLY_CAP, attemptsPerDay: 1 },
    tournament: { featuredGameType, minParticipants: TOURNAMENT_MIN_PARTICIPANTS },
    kpi: {
      playable: games.filter((g) => g.effective.enabled && !g.hidden).length,
      total: games.length,
      startedToday: sum((g) => g.stats.today.started),
      points30d: sum((g) => g.stats.pointsAwarded30d),
      pointsPrev30d: prevPoints._sum.rewardPoints ?? 0,
      winRate30d: pct(won30, finished30),
      flagged30d: [...flagMap.values()].reduce((a, b) => a + b, 0),
      finished30d: finished30,
    },
    generatedAt: now.toISOString(),
  };
}

// ─────────────────────────── Oyun detayı ───────────────────────────

const HISTOGRAM_BUCKETS = 10;

export function buildHistogram(
  rows: ReadonlyArray<{ score: number; n: number }>,
  maxScore: number,
  threshold: number
): GameDetail['histogram'] {
  const size = Math.max(1, Math.ceil((maxScore + 1) / HISTOGRAM_BUCKETS));
  const buckets: Array<{ from: number; to: number; count: number }> = [];
  for (let from = 0; from <= maxScore; from += size) buckets.push({ from, to: Math.min(maxScore, from + size - 1), count: 0 });
  let total = 0;
  for (const r of rows) {
    const s = Math.max(0, Math.min(maxScore, r.score));
    const idx = Math.min(buckets.length - 1, Math.floor(s / size));
    buckets[idx].count += r.n;
    total += r.n;
  }
  return { buckets, threshold, maxScore, total };
}

export async function getGameDetail(gameType: string, now: Date = new Date()): Promise<GameDetail> {
  const def = getGameDef(gameType);
  if (!def) throw new ApiError('NOT_FOUND', 'Oyun bulunamadı.');
  const since30 = new Date(now.getTime() - 30 * DAY);
  const today = istanbulDay(now);
  const firstDay = addDays(today, -13);
  const trendFrom = istanbulDayStart(firstDay);

  const [cfg, trendRows, scoreRows, flagRows, flagTotal, flagRecent, aboveRows, audits] = await Promise.all([
    prisma.miniGameConfig.findUnique({ where: { gameType } }),
    prisma.$queryRaw<Array<{ day: string; started: bigint | number; won: bigint | number; points: bigint | number | null }>>`
      SELECT to_char(("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
             COUNT(*) AS started,
             COUNT(*) FILTER (WHERE "status" = 'completed') AS won,
             COALESCE(SUM("rewardPoints"), 0) AS points
      FROM "MiniGameSession"
      WHERE "gameType" = ${gameType} AND "startedAt" >= ${trendFrom}
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ score: number; n: bigint | number }>>`
      SELECT "starsCollected" AS score, COUNT(*) AS n
      FROM "MiniGameSession"
      WHERE "gameType" = ${gameType} AND "startedAt" >= ${since30} AND "status" IN ('completed', 'failed')
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ flag: string; n: bigint | number }>>`
      SELECT f AS flag, COUNT(*) AS n
      FROM "AnalyticsEvent", jsonb_array_elements_text(COALESCE("data"->'flags', '[]'::jsonb)) AS f
      WHERE "event" = 'game_attempt_flagged' AND "createdAt" >= ${since30} AND "data"->>'gameType' = ${gameType}
      GROUP BY 1
      ORDER BY 2 DESC`,
    prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT COUNT(*) AS n FROM "AnalyticsEvent"
      WHERE "event" = 'game_attempt_flagged' AND "createdAt" >= ${since30} AND "data"->>'gameType' = ${gameType}`,
    prisma.$queryRaw<Array<{ createdAt: Date; data: unknown; name: string | null }>>`
      SELECT e."createdAt", e."data", u."name"
      FROM "AnalyticsEvent" e
      LEFT JOIN "User" u ON u."id" = e."userId"
      WHERE e."event" = 'game_attempt_flagged' AND e."createdAt" >= ${since30} AND e."data"->>'gameType' = ${gameType}
      ORDER BY e."createdAt" DESC
      LIMIT 10`,
    prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT COUNT(*) AS n FROM "MiniGameSession"
      WHERE "gameType" = ${gameType} AND "startedAt" >= ${since30}
        AND "clientScore" IS NOT NULL AND "clientScore" > "starsCollected"
        AND "status" IN ('completed', 'failed')`,
    prisma.auditLog.findMany({
      where: { entity: 'MiniGameConfig', entityId: gameType, action: { in: HISTORY_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, createdAt: true, action: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);

  const eff = mergeGameConfig(def, cfg ? toOverrideRow(cfg as ConfigRow) : null);
  const byDay = new Map(trendRows.map((r) => [r.day, r]));
  const trend: GameDetail['trend'] = [];
  for (let i = 0; i < 14; i++) {
    const day = addDays(firstDay, i);
    const r = byDay.get(day);
    trend.push({ day, started: Number(r?.started ?? 0), won: Number(r?.won ?? 0), points: Number(r?.points ?? 0) });
  }

  const byFlag = flagRows.map((r) => ({ flag: r.flag, count: Number(r.n) }));
  const verifier = getVerifierForGameType(gameType);
  const entry = getGameEntryByGameType(gameType);

  const history: HistoryEntry[] = audits.map((a) => {
    const nd = asRecord(a.newData);
    const snap = asRecord(a.actorSnapshot);
    const actor = a.user?.name || a.user?.email || (typeof snap?.email === 'string' ? snap.email : null);
    return {
      id: a.id,
      at: a.createdAt.toISOString(),
      action: a.action,
      actor,
      reason: typeof nd?.reason === 'string' ? nd.reason : null,
      oldData: asRecord(a.oldData),
      newData: nd,
    };
  });

  return {
    gameType,
    trend,
    histogram: buildHistogram(
      scoreRows.map((r) => ({ score: Number(r.score), n: Number(r.n) })),
      eff.maxScore,
      eff.rewardThreshold
    ),
    integrity: {
      total: Number(flagTotal[0]?.n ?? 0),
      byFlag,
      recent: flagRecent.map((r) => {
        const d = asRecord(r.data) ?? {};
        return {
          at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          flags: Array.isArray(d.flags) ? d.flags.map(String) : [],
          clientScore: typeof d.clientScore === 'number' ? d.clientScore : null,
          verifiedScore: typeof d.verifiedScore === 'number' ? d.verifiedScore : null,
          user: shortName(r.name),
        };
      }),
      clientAboveServer30d: Number(aboveRows[0]?.n ?? 0),
    },
    verifier: { family: verifier?.kind ?? entry?.verification ?? null, wired: !!verifier },
    history,
  };
}

// ─────────────────────────── Turnuva ───────────────────────────

export async function getTournamentOverview(now: Date = new Date()): Promise<TournamentOverview> {
  const candidates = visibleMiniGames().map((g) => g.gameType);
  const weekKey = isoWeekKey(now);
  const featured = featuredGameTypeForWeek(weekKey, candidates);
  const lastKey = previousIsoWeekKey(now);
  const lastFeatured = featuredGameTypeForWeek(lastKey, candidates);
  const weekStart = isoWeekStart(now);
  const lastStart = new Date(weekStart.getTime() - WEEK);

  const [overrides, rows, lastRows, claims] = await Promise.all([
    prisma.miniGameConfig.findMany(),
    featured
      ? prisma.miniGameSession.findMany({
          where: { gameType: featured, status: 'completed', completedAt: { gte: weekStart, lt: isoWeekEnd(now) } },
          select: { userId: true, starsCollected: true, completedAt: true },
        })
      : Promise.resolve([]),
    lastFeatured
      ? prisma.miniGameSession.findMany({
          where: { gameType: lastFeatured, status: 'completed', completedAt: { gte: lastStart, lt: weekStart } },
          select: { userId: true, starsCollected: true, completedAt: true },
        })
      : Promise.resolve([]),
    lastFeatured
      ? prisma.tournamentRewardClaim.findMany({
          where: { gameType: lastFeatured, weekKey: lastKey },
          orderBy: { rank: 'asc' },
          select: { userId: true, rank: true, points: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const ovMap = new Map(overrides.map((o) => [o.gameType, o as ConfigRow]));

  const ranked = rankWeekly(rows);
  const top10 = ranked.slice(0, 10);
  const lastRanked = rankWeekly(lastRows);
  const userIds = [...new Set([...top10.map((r) => r.userId), ...claims.map((c) => c.userId)])];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, shortName(u.name)]));

  const lastWinnersEligible = lastRanked.length >= TOURNAMENT_MIN_PARTICIPANTS ? Math.min(3, lastRanked.length) : 0;

  const rotation: TournamentOverview['rotation'] = [];
  for (let i = 0; i < 4; i++) {
    const wk = isoWeekKey(new Date(weekStart.getTime() + i * WEEK + DAY));
    const gt = featuredGameTypeForWeek(wk, candidates);
    rotation.push({ weekKey: wk, gameType: gt, title: titleOf(gt, ovMap) });
  }

  const featuredCfg = featured ? ovMap.get(featured) : undefined;

  return {
    weekKey,
    endsAt: isoWeekEnd(now).toISOString(),
    featuredGameType: featured,
    featuredTitle: titleOf(featured, ovMap),
    featuredEnabled: featuredCfg ? featuredCfg.enabled : true,
    participants: ranked.length,
    minParticipants: TOURNAMENT_MIN_PARTICIPANTS,
    prizes: prizeTable(true),
    top: top10.map((r, i) => ({
      rank: i + 1,
      name: nameOf.get(r.userId) ?? 'Oyuncu',
      best: r.best,
      prize: prizeFor(i + 1, ranked.length),
    })),
    rotation,
    lastWeek: {
      weekKey: lastKey,
      gameType: lastFeatured,
      title: titleOf(lastFeatured, ovMap),
      participants: lastRanked.length,
      claims: claims.map((c) => ({ rank: c.rank, name: nameOf.get(c.userId) ?? 'Oyuncu', points: c.points, at: c.createdAt.toISOString() })),
      unclaimed: Math.max(0, lastWinnersEligible - claims.length),
    },
  };
}

// ─────────────────────────── Yazım: PATCH ───────────────────────────

function intOverride(lim: { min: number; max: number }, label: string) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : typeof v === 'string' ? Number(v) : v),
    z
      .number({ invalid_type_error: `${label} bir sayı olmalı.` })
      .int(`${label} tam sayı olmalı.`)
      .min(lim.min, `${label} en az ${lim.min} olabilir.`)
      .max(lim.max, `${label} en fazla ${lim.max.toLocaleString('tr-TR')} olabilir.`)
      .nullable()
  );
}
function strOverride(max: number, label: string) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max, `${label} en fazla ${max} karakter olabilir.`).nullable()
  );
}

export function graphemeCount(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (Seg) return [...new Seg('tr', { granularity: 'grapheme' }).segment(s)].length;
  return [...s].length;
}

export const patchSchema = z.object({
  gameType: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  title: strOverride(OVERRIDE_LIMITS.titleMax, 'Başlık').optional(),
  description: strOverride(OVERRIDE_LIMITS.descriptionMax, 'Açıklama').optional(),
  emoji: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().trim().max(32).refine((s) => graphemeCount(s) === 1, 'Emoji tek bir simge olmalı.').nullable()
    )
    .optional(),
  accent: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı (ör. #22d3ee).').nullable()
    )
    .optional(),
  maxScore: intOverride(OVERRIDE_LIMITS.maxScore, 'Maks. skor').optional(),
  rewardThreshold: intOverride(OVERRIDE_LIMITS.rewardThreshold, 'Ödül eşiği').optional(),
  rewardPoints: intOverride(OVERRIDE_LIMITS.rewardPoints, 'Ödül puanı').optional(),
  rewardXp: intOverride(OVERRIDE_LIMITS.rewardXp, 'Ödül XP').optional(),
  minDurationSec: intOverride(OVERRIDE_LIMITS.minDurationSec, 'Min. süre').optional(),
  /** İyimser eşzamanlılık: GET'teki updatedAt. Uyuşmazsa 409. */
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
});
export type PatchInput = z.infer<typeof patchSchema>;

/** Türkçe, alan adlı tek mesaj (admin B8). */
export function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Geçersiz istek.';
  if (issue.message && /[ğüşıöçĞÜŞİÖÇ]|olmalı|olabilir/.test(issue.message)) return issue.message;
  const key = String(issue.path[0] ?? '') as keyof typeof FIELD_LABELS;
  const label = FIELD_LABELS[key];
  return label ? `${label}: geçersiz değer.` : 'Geçersiz istek.';
}

export function parsePatch(raw: unknown): PatchInput {
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError('VALIDATION', zodMessage(parsed.error), {
      details: parsed.error.issues.map((i) => ({ path: String(i.path[0] ?? ''), message: i.message, code: i.code })),
    });
  }
  return parsed.data;
}

type AuditMeta = { ipAddress?: string | null; userAgent?: string | null };

export async function patchGame(actorId: string, input: PatchInput, meta: AuditMeta) {
  const { gameType, expectedUpdatedAt, ...fields } = input;
  const def = getGameDef(gameType);
  if (!def) throw new ApiError('NOT_FOUND', 'Oyun bulunamadı.');

  const data: Record<string, unknown> = {};
  for (const k of ['enabled', ...OVERRIDE_FIELDS] as const) {
    if (fields[k] !== undefined) data[k] = fields[k];
  }
  if (Object.keys(data).length === 0) throw new ApiError('BAD_REQUEST', 'Değiştirilecek alan yok.');

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.miniGameConfig.findUnique({ where: { gameType } });
    if (expectedUpdatedAt !== undefined) {
      const current = existing?.updatedAt ? existing.updatedAt.toISOString() : null;
      if (current !== expectedUpdatedAt) {
        throw new ApiError('CONFLICT', 'Bu oyunun ayarları siz düzenlerken değişti. Güncel hâli yüklendi; tekrar deneyin.');
      }
    }
    // Eşik ≤ maks. skor — etkin değerler üzerinden (mevcut override ∪ gelen ∪ varsayılan; B11).
    const pick = (k: 'maxScore' | 'rewardThreshold'): number => {
      if (fields[k] !== undefined) return fields[k] ?? def[k];
      return existing?.[k] ?? def[k];
    };
    const resolvedMax = pick('maxScore');
    const resolvedThreshold = pick('rewardThreshold');
    if (resolvedThreshold > resolvedMax) {
      throw new ApiError('VALIDATION', `Ödül eşiği (${resolvedThreshold}) maksimum skoru (${resolvedMax}) aşamaz.`, {
        details: [{ path: 'rewardThreshold', message: 'Eşik maks. skoru aşamaz.' }],
      });
    }
    const oldData = existing
      ? Object.fromEntries(Object.keys(data).map((k) => [k, (existing as Record<string, unknown>)[k] ?? null]))
      : null;
    // İlk override satırı: isteğe bağlı (optIn) oyun, alan düzenlemesiyle kendiliğinden açılmaz.
    const saved = await tx.miniGameConfig.upsert({
      where: { gameType },
      update: data,
      create: { gameType, enabled: defaultEnabledOf(def), ...data },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'minigame_config_update',
        entity: 'MiniGameConfig',
        entityId: gameType,
        oldData: (oldData ?? undefined) as object | undefined,
        newData: data as object,
        ...meta,
      },
    });
    return saved;
  });

  // Önbelleği ANINDA düşür (B3). Puan basan complete zaten önbelleksiz okur.
  revalidateTag(MINIGAME_CONFIG_TAG, { expire: 0 });
  return { gameType, updatedAt: result.updatedAt ? result.updatedAt.toISOString() : null };
}

// ─────────────────────────── Yazım: sıfırla ───────────────────────────

export async function resetGame(actorId: string, gameType: string, meta: AuditMeta) {
  if (!getGameDef(gameType)) throw new ApiError('NOT_FOUND', 'Oyun bulunamadı.');
  const changed = await prisma.$transaction(async (tx) => {
    const existing = await tx.miniGameConfig.findUnique({ where: { gameType } });
    if (!existing) return false;
    const cleared = Object.fromEntries(OVERRIDE_FIELDS.map((k) => [k, null]));
    // Satırı silmek oyunu varsayılan açıklığına döndürür; yalnız mevcut durum varsayılansa sil.
    if (existing.enabled === defaultEnabledOf(getGameDef(gameType)!)) {
      await tx.miniGameConfig.delete({ where: { gameType } });
    } else {
      // Varsayılandan farklı aç/kapa durumu (kapatılan oyun / açılan isteğe bağlı oyun) sıfırlamayla değişmez.
      await tx.miniGameConfig.update({ where: { gameType }, data: cleared });
    }
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'minigame_config_reset',
        entity: 'MiniGameConfig',
        entityId: gameType,
        oldData: toOverrideRow(existing as ConfigRow) as unknown as object,
        newData: { enabled: existing.enabled, ...cleared } as object,
        ...meta,
      },
    });
    return true;
  });
  if (changed) revalidateTag(MINIGAME_CONFIG_TAG, { expire: 0 });
  return { gameType, changed };
}

// ─────────────────────────── Yazım: toplu aç/kapat ───────────────────────────

export async function bulkSetEnabled(actorId: string, input: BulkInput, meta: AuditMeta) {
  const enabled = input.action === 'enable';
  const unique = [...new Set(input.gameTypes)];
  const unknown = unique.filter((g) => !getGameDef(g));
  if (unknown.length) throw new ApiError('NOT_FOUND', `Bilinmeyen oyun: ${unknown.join(', ')}`);

  const changed = await prisma.$transaction(async (tx) => {
    const rows = await tx.miniGameConfig.findMany({ where: { gameType: { in: unique } } });
    const byType = new Map(rows.map((r) => [r.gameType, r]));
    const out: string[] = [];
    for (const gameType of unique) {
      const current = byType.get(gameType)?.enabled ?? defaultEnabledOf(getGameDef(gameType)!);
      if (current === enabled) continue;
      await tx.miniGameConfig.upsert({ where: { gameType }, update: { enabled }, create: { gameType, enabled } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'minigame_config_bulk',
          entity: 'MiniGameConfig',
          entityId: gameType,
          oldData: { enabled: current },
          newData: { enabled, reason: input.reason },
          ...meta,
        },
      });
      out.push(gameType);
    }
    return out;
  });

  if (changed.length) revalidateTag(MINIGAME_CONFIG_TAG, { expire: 0 });
  return { changed, skipped: unique.length - changed.length };
}
