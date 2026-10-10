/**
 * Yılım — sunucu tarafı özet hesabı (TEK kaynak). Hem sunucu sayfası
 * (`app/customer/me/year/page.tsx`) hem `GET /api/customer/my-year` bunu çağırır.
 *
 * Denetimden (docs/audit/2026-10-08/musteri/customer_my-year.md) kapanan doğruluk hataları:
 *  - Yanıt oranı = yanıt gelen YORUM / toplam yorum (eskiden işletme / yorum, bulgu 1).
 *  - "Yorum" birleşik: Feedback (deletedAt IS NULL) + ConsumptionReview (deletedAt IS NULL)
 *    (bulgu 2, 10). İşletme: QRCode.dealerId / Consumption.dealerId.
 *  - Favori mekân = ziyaret (Consumption) + yorum, ikisi ayrı sayılır (bulgu 3).
 *  - Kazanılan puan: PointsLedger (posted, delta > 0; escrow iadesi / ters kayıt / açılış
 *    bakiyesi HARİÇ) + deftere geçmeden önceki eski `points_credited` olayları (ledgerId'siz,
 *    iade kategorileri hariç, sayısal olmayan değer güvenli) — bulgu 4.
 *  - Seviye/lig/seri artık DÖNEME ait: An Motoru anları, defter bakiyeleri ve aktif günlerden
 *    (bulgu 5). Tüm zamanlar değeri "bu yıl" diye gösterilmez.
 *  - Sınırlar Europe/Istanbul (bulgu 9).
 *
 * GET yolu: LLM yok, yazma yok. Kapanmış dönem Redis'te 6 saat önbelleklenir.
 */
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma, isPrismaConnectivityError } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { getLeagueRules, DEFAULT_LEAGUE_RULES, type LeagueRule } from '@/lib/league-rules';
import { leagueIndexAt } from '@/lib/moments/server';
import type { YearLeagueRef, YearPlace, YearSummary } from './contract';
import {
  bucketize,
  hasAnyActivity,
  longestDayStreak,
  mostGivenRating,
  replyRate,
  rhythmOf,
  trimQuote,
  type ActivityDayRow,
} from './derive';
import {
  availableMonths,
  availableYears,
  daysInPeriod,
  isPeriodClosed,
  isPeriodCurrent,
  periodBounds,
  periodKey,
  previousPeriod,
  type YearPeriod,
} from './period';

type Db = typeof defaultPrisma;

/** Kapanmış dönem önbelleği (sn). Geç gelen bayi yanıtı en geç bu kadar sonra görünür. */
export const CLOSED_PERIOD_CACHE_TTL_SEC = 6 * 60 * 60;
const CACHE_VERSION = 'v1';

/** Escrow iadesi / ters kayıt / açılış bakiyesi kazanç değildir (escrow net-sıfır). */
export const NON_EARNING_LEDGER_SOURCES = ['squad_escrow_refund', 'reversal', 'opening_balance'] as const;
/** Eski (defter öncesi) iade olaylarının kategorileri. */
export const LEGACY_REFUND_CATEGORIES = ['squad_battle_refund', 'squad_escrow_refund'] as const;

export class YearUserNotFoundError extends Error {
  constructor() {
    super('Kullanıcı bulunamadı');
    this.name = 'YearUserNotFoundError';
  }
}

// ───────────────────────────── yardımcılar ─────────────────────────────

/**
 * Tablo canlıda henüz yoksa (PointsLedger / CustomerMoment göçü uygulanmadan) bölüm
 * yalnızca boş kalır; bağlantı ve diğer hatalar YUTULMAZ (hata görünür, ilke 9).
 */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; meta?: { code?: unknown } | null; message?: unknown };
  if (e.code === 'P2021') return true;
  if (e.code === 'P2010' && e.meta && e.meta.code === '42P01') return true;
  return typeof e.message === 'string' && /relation "[^"]+" does not exist/i.test(e.message);
}

async function optionalSection<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isPrismaConnectivityError(err) || !isMissingTableError(err)) throw err;
    console.warn(`[my-year] ${label} tablosu yok; bölüm boş bırakıldı`);
    return fallback;
  }
}

const n = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return 0;
};
const int = (v: unknown): number => Math.max(0, Math.round(n(v)));
const nullableInt = (v: unknown): number | null => (v === null || v === undefined ? null : Math.round(n(v)));
const toIso = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && v) return new Date(v).toISOString();
  return null;
};

function leagueRef(index: number, rules: readonly LeagueRule[]): YearLeagueRef {
  const r = rules[Math.max(0, Math.min(index, rules.length - 1))];
  return { key: r.key, name: r.name };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// ───────────────────────────── SQL parçaları ─────────────────────────────

/** Birleşik yorum kümesi: QR yorumu + tüketim yorumu (ikisi de soft-delete hariç). */
function unifiedReviewsSql(userId: string, from: Date, to: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT q."dealerId" AS "dealerId", f."rating" AS rating, f."dealerRepliedAt" AS replied, f."createdAt" AS at
    FROM "Feedback" f
    JOIN "QRCode" q ON q."id" = f."qrCodeId"
    WHERE f."userId" = ${userId} AND f."deletedAt" IS NULL
      AND f."createdAt" >= ${from} AND f."createdAt" < ${to}
    UNION ALL
    SELECT c."dealerId" AS "dealerId", cr."rating" AS rating, cr."dealerRepliedAt" AS replied, cr."createdAt" AS at
    FROM "ConsumptionReview" cr
    JOIN "Consumption" c ON c."id" = cr."consumptionId"
    WHERE cr."customerId" = ${userId} AND cr."deletedAt" IS NULL
      AND cr."createdAt" >= ${from} AND cr."createdAt" < ${to}
  `;
}

type ReviewAggRow = {
  total: unknown;
  previousTotal: unknown;
  average: unknown;
  replied: unknown;
  respondingDealers: unknown;
  r1: unknown;
  r2: unknown;
  r3: unknown;
  r4: unknown;
  r5: unknown;
};
type VisitAggRow = { total: unknown; previousTotal: unknown };
type PlaceRow = {
  dealerId: string;
  visits: unknown;
  reviews: unknown;
  businessName: string | null;
  name: string | null;
  businessLogo: string | null;
  businessCategory: string | null;
  placeCount: unknown;
};
type QuoteRow = { dealerId: string; text: string | null; at: Date | string | null; businessName: string | null; name: string | null };
type LedgerRow = { earned: unknown; peak: unknown; startBalance: unknown; endBalance: unknown };

// ───────────────────────────── ana hesap ─────────────────────────────

export interface YearSummaryInput {
  userId: string;
  /** URL'den gelen ham değerler; `resolvePeriod` dışarıda yapılır. */
  period: YearPeriod;
  adjusted?: boolean;
  now?: Date;
  db?: Db;
  /** false → Redis atlanır (test). */
  useCache?: boolean;
}

/** Kullanıcının üyelik başlangıcı (dönem seçimi için). Bulunamazsa hata. */
export async function getMemberSince(userId: string, db: Db = defaultPrisma): Promise<Date> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!user) throw new YearUserNotFoundError();
  return user.createdAt;
}

export async function getYearSummary(input: YearSummaryInput): Promise<YearSummary> {
  const now = input.now ?? new Date();
  const db = input.db ?? defaultPrisma;
  const closed = isPeriodClosed(input.period, now);
  const compute = () => computeYearSummary(db, input.userId, input.period, now);
  const summary =
    closed && input.useCache !== false
      ? await cachedJson(`my-year:${CACHE_VERSION}:${input.userId}:${periodKey(input.period)}`, CLOSED_PERIOD_CACHE_TTL_SEC, compute)
      : await compute();
  return { ...summary, adjusted: input.adjusted === true };
}

export async function computeYearSummary(db: Db, userId: string, period: YearPeriod, now: Date): Promise<YearSummary> {
  const { start, end } = periodBounds(period);
  const prev = previousPeriod(period);
  const prevStart = periodBounds(prev).start;
  const isCurrent = isPeriodCurrent(period, now);
  const days = daysInPeriod(period);

  const [
    user,
    rules,
    reviewRows,
    visitRows,
    placeRows,
    dayRows,
    quoteRows,
    badgeTotal,
    badgeRows,
    momentRows,
    ledgerRows,
    legacyRows,
    battleRows,
  ] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true, points: true, level: true } }),
    getLeagueRules(db).catch((err: unknown) => {
      if (isPrismaConnectivityError(err)) throw err;
      return DEFAULT_LEAGUE_RULES;
    }),
    db.$queryRaw<ReviewAggRow[]>(Prisma.sql`
      WITH r AS (${unifiedReviewsSql(userId, prevStart, end)})
      SELECT
        COUNT(*) FILTER (WHERE at >= ${start})::int AS total,
        COUNT(*) FILTER (WHERE at < ${start})::int AS "previousTotal",
        AVG(rating) FILTER (WHERE at >= ${start} AND rating BETWEEN 1 AND 5)::float8 AS average,
        COUNT(*) FILTER (WHERE at >= ${start} AND replied IS NOT NULL)::int AS replied,
        COUNT(DISTINCT "dealerId") FILTER (WHERE at >= ${start} AND replied IS NOT NULL)::int AS "respondingDealers",
        COUNT(*) FILTER (WHERE at >= ${start} AND rating = 1)::int AS r1,
        COUNT(*) FILTER (WHERE at >= ${start} AND rating = 2)::int AS r2,
        COUNT(*) FILTER (WHERE at >= ${start} AND rating = 3)::int AS r3,
        COUNT(*) FILTER (WHERE at >= ${start} AND rating = 4)::int AS r4,
        COUNT(*) FILTER (WHERE at >= ${start} AND rating = 5)::int AS r5
      FROM r
    `),
    db.$queryRaw<VisitAggRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "createdAt" >= ${start})::int AS total,
        COUNT(*) FILTER (WHERE "createdAt" < ${start})::int AS "previousTotal"
      FROM "Consumption"
      WHERE "customerId" = ${userId} AND "createdAt" >= ${prevStart} AND "createdAt" < ${end}
    `),
    db.$queryRaw<PlaceRow[]>(Prisma.sql`
      WITH v AS (
        SELECT "dealerId", COUNT(*)::int AS visits
        FROM "Consumption"
        WHERE "customerId" = ${userId} AND "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1
      ), rv AS (
        SELECT "dealerId", COUNT(*)::int AS reviews FROM (${unifiedReviewsSql(userId, start, end)}) x GROUP BY 1
      ), j AS (
        SELECT COALESCE(v."dealerId", rv."dealerId") AS "dealerId",
               COALESCE(v.visits, 0) AS visits,
               COALESCE(rv.reviews, 0) AS reviews
        FROM v FULL OUTER JOIN rv ON rv."dealerId" = v."dealerId"
      )
      SELECT j."dealerId", j.visits, j.reviews,
             u."businessName", u."name", u."businessLogo", u."businessCategory",
             COUNT(*) OVER ()::int AS "placeCount"
      FROM j
      JOIN "User" u ON u."id" = j."dealerId"
      ORDER BY (j.visits + j.reviews) DESC, j.visits DESC, j."dealerId" ASC
      LIMIT 3
    `),
    db.$queryRaw<ActivityDayRow[]>(Prisma.sql`
      WITH e AS (
        SELECT "createdAt" AS at FROM "Consumption"
        WHERE "customerId" = ${userId} AND "createdAt" >= ${start} AND "createdAt" < ${end}
        UNION ALL
        SELECT at FROM (${unifiedReviewsSql(userId, start, end)}) r
      ), l AS (
        SELECT (at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' AS t FROM e
      )
      SELECT to_char(t, 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM t) BETWEEN 5 AND 11)::int AS morning,
        COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM t) BETWEEN 12 AND 16)::int AS noon,
        COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM t) BETWEEN 17 AND 21)::int AS evening,
        COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM t) >= 22 OR EXTRACT(HOUR FROM t) < 5)::int AS night
      FROM l
      GROUP BY 1
      ORDER BY 1
    `),
    db.$queryRaw<QuoteRow[]>(Prisma.sql`
      SELECT x."dealerId", x.text, x.at, u."businessName", u."name"
      FROM (
        SELECT q."dealerId" AS "dealerId", f."dealerReply" AS text, f."dealerRepliedAt" AS at
        FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
        WHERE f."userId" = ${userId} AND f."deletedAt" IS NULL
          AND f."createdAt" >= ${start} AND f."createdAt" < ${end}
          AND f."dealerRepliedAt" IS NOT NULL AND length(btrim(COALESCE(f."dealerReply", ''))) >= 8
        UNION ALL
        SELECT c."dealerId" AS "dealerId", cr."dealerReply" AS text, cr."dealerRepliedAt" AS at
        FROM "ConsumptionReview" cr JOIN "Consumption" c ON c."id" = cr."consumptionId"
        WHERE cr."customerId" = ${userId} AND cr."deletedAt" IS NULL
          AND cr."createdAt" >= ${start} AND cr."createdAt" < ${end}
          AND cr."dealerRepliedAt" IS NOT NULL AND length(btrim(COALESCE(cr."dealerReply", ''))) >= 8
      ) x
      JOIN "User" u ON u."id" = x."dealerId"
      ORDER BY x.at DESC NULLS LAST
      LIMIT 1
    `),
    db.userBadge.count({ where: { userId, earnedAt: { gte: start, lt: end } } }),
    db.userBadge.findMany({
      where: { userId, earnedAt: { gte: start, lt: end } },
      orderBy: { earnedAt: 'asc' },
      take: 12,
      select: {
        earnedAt: true,
        badge: { select: { id: true, name: true, icon: true, rarity: true, color: true } },
      },
    }),
    optionalSection(
      'CustomerMoment',
      () =>
        db.customerMoment.findMany({
          where: { userId, kind: { in: ['level_up', 'league_up'] }, createdAt: { gte: start, lt: end } },
          orderBy: { createdAt: 'asc' },
          take: 100,
          select: { kind: true, payload: true, createdAt: true },
        }),
      [] as Array<{ kind: string; payload: unknown; createdAt: Date }>
    ),
    optionalSection(
      'PointsLedger',
      () =>
        db.$queryRaw<LedgerRow[]>(Prisma.sql`
          SELECT
            COALESCE(SUM(l."delta") FILTER (
              WHERE l."delta" > 0 AND l."source" NOT IN (${Prisma.join([...NON_EARNING_LEDGER_SOURCES])})
            ), 0)::int AS earned,
            MAX(l."balanceAfter")::int AS peak,
            (SELECT b."balanceAfter" FROM "PointsLedger" b
              WHERE b."userId" = ${userId} AND b."status" = 'posted' AND b."currency" = 'POINTS'
                AND b."balanceAfter" IS NOT NULL AND b."createdAt" < ${start}
              ORDER BY b."createdAt" DESC, b."id" DESC LIMIT 1) AS "startBalance",
            (SELECT b."balanceAfter" FROM "PointsLedger" b
              WHERE b."userId" = ${userId} AND b."status" = 'posted' AND b."currency" = 'POINTS'
                AND b."balanceAfter" IS NOT NULL AND b."createdAt" < ${end}
              ORDER BY b."createdAt" DESC, b."id" DESC LIMIT 1) AS "endBalance"
          FROM "PointsLedger" l
          WHERE l."userId" = ${userId} AND l."status" = 'posted' AND l."currency" = 'POINTS'
            AND l."createdAt" >= ${start} AND l."createdAt" < ${end}
        `),
      [] as LedgerRow[]
    ),
    db.$queryRaw<Array<{ total: unknown }>>(Prisma.sql`
      SELECT COALESCE(SUM(
        CASE WHEN jsonb_typeof("data"->'points') = 'number' THEN GREATEST(("data"->>'points')::numeric, 0) ELSE 0 END
      ), 0)::int AS total
      FROM "AnalyticsEvent"
      WHERE "userId" = ${userId} AND "event" = 'points_credited'
        AND "createdAt" >= ${start} AND "createdAt" < ${end}
        AND ("data"->'ledgerId') IS NULL
        AND "category" NOT IN (${Prisma.join([...LEGACY_REFUND_CATEGORIES])})
    `),
    db.squadBattleParticipant.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      take: 1000,
      select: { squadId: true, battle: { select: { winnerId: true, status: true } } },
    }),
  ]);

  if (!user) throw new YearUserNotFoundError();
  const leagueRules = [...(rules.length ? rules : DEFAULT_LEAGUE_RULES)].sort((a, b) => a.minPoints - b.minPoints);

  // ── Ziyaret + ritim ──
  const visitAgg = visitRows[0];
  const days_ = (dayRows ?? []).map((r) => ({
    day: String(r.day),
    n: int(r.n),
    morning: int(r.morning),
    noon: int(r.noon),
    evening: int(r.evening),
    night: int(r.night),
  }));
  const rhythm = rhythmOf(days_);

  // ── Yorum + etki ──
  const ra = reviewRows[0];
  const distribution = [int(ra?.r1), int(ra?.r2), int(ra?.r3), int(ra?.r4), int(ra?.r5)];
  const reviewTotal = int(ra?.total);
  const replied = int(ra?.replied);
  const avgRaw = ra?.average;
  const average = avgRaw === null || avgRaw === undefined ? null : Math.round(n(avgRaw) * 10) / 10;
  const q = quoteRows[0];
  const quote =
    q && typeof q.text === 'string' && q.text.trim()
      ? { dealerId: q.dealerId, dealerName: q.businessName || q.name || 'Bir işletme', text: trimQuote(q.text), atIso: toIso(q.at) }
      : null;

  // ── Mekânlar ──
  const favorites: YearPlace[] = (placeRows ?? []).map((p) => ({
    dealerId: p.dealerId,
    name: p.businessName || p.name || 'Bir işletme',
    logo: p.businessLogo || null,
    category: p.businessCategory || null,
    visits: int(p.visits),
    reviews: int(p.reviews),
  }));
  const places = placeRows?.[0] ? int(placeRows[0].placeCount) : 0;

  // ── Yolculuk: lig + seviye ──
  const leagueUps: YearSummary['journey']['leagueUps'] = [];
  let levelFrom: number | null = null;
  let levelTo: number | null = null;
  let levelUps = 0;
  for (const m of momentRows) {
    const p = asRecord(m.payload);
    const atIso = toIso(m.createdAt) ?? start.toISOString();
    if (m.kind === 'league_up' && typeof p.toKey === 'string') {
      leagueUps.push({
        fromKey: String(p.fromKey ?? ''),
        fromName: String(p.fromName ?? ''),
        toKey: p.toKey,
        toName: String(p.toName ?? p.toKey),
        atIso,
      });
    } else if (m.kind === 'level_up') {
      const from = nullableInt(p.from);
      const to = nullableInt(p.to);
      if (to !== null && to > 0) {
        levelUps++;
        if (from !== null && from > 0 && (levelFrom === null || from < levelFrom)) levelFrom = from;
        if (levelTo === null || to > levelTo) levelTo = to;
      }
    }
  }

  const ledger = ledgerRows[0];
  const memberSince = user.createdAt;
  const joinedInPeriod = memberSince.getTime() >= start.getTime();
  const startBalance =
    ledger && ledger.startBalance !== null && ledger.startBalance !== undefined
      ? int(ledger.startBalance)
      : joinedInPeriod
        ? 0
        : null;
  const endBalance = isCurrent
    ? Math.max(0, user.points)
    : ledger && ledger.endBalance !== null && ledger.endBalance !== undefined
      ? int(ledger.endBalance)
      : null;
  const peakCandidates: number[] = [];
  if (ledger && ledger.peak !== null && ledger.peak !== undefined) peakCandidates.push(leagueIndexAt(int(ledger.peak), leagueRules));
  if (startBalance !== null) peakCandidates.push(leagueIndexAt(startBalance, leagueRules));
  if (endBalance !== null) peakCandidates.push(leagueIndexAt(endBalance, leagueRules));
  for (const up of leagueUps) {
    const idx = leagueRules.findIndex((r) => r.key === up.toKey);
    if (idx >= 0) peakCandidates.push(idx);
  }
  const journey: YearSummary['journey'] = {
    leagueUps,
    startLeague: startBalance === null ? null : leagueRef(leagueIndexAt(startBalance, leagueRules), leagueRules),
    endLeague: endBalance === null ? null : leagueRef(leagueIndexAt(endBalance, leagueRules), leagueRules),
    peakLeague: peakCandidates.length ? leagueRef(Math.max(...peakCandidates), leagueRules) : null,
    levelFrom,
    levelTo,
    levelUps,
  };

  // ── Puan ──
  const earned = int(ledger?.earned) + int(legacyRows[0]?.total);

  // ── Klan ──
  const battles = battleRows.length;
  const wins = battleRows.filter((b) => b.battle?.status === 'completed' && b.battle.winnerId === b.squadId).length;

  const visitsTotal = int(visitAgg?.total);
  const summary: YearSummary = {
    period: {
      year: period.year,
      month: period.month,
      key: periodKey(period),
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      isCurrent,
      isClosed: isPeriodClosed(period, now),
      days,
    },
    previous: { year: prev.year, month: prev.month, key: periodKey(prev) },
    memberSinceIso: memberSince.toISOString(),
    availableYears: availableYears(memberSince, now),
    availableMonths: availableMonths(period.year, memberSince, now),
    adjusted: false,
    generatedAtIso: now.toISOString(),
    visits: {
      total: visitsTotal,
      previousTotal: int(visitAgg?.previousTotal),
      activeDays: days_.length,
      longestStreak: longestDayStreak(days_.map((d) => d.day)),
      places,
    },
    favorites,
    reviews: {
      total: reviewTotal,
      previousTotal: int(ra?.previousTotal),
      average,
      mostGiven: mostGivenRating(distribution),
      distribution,
    },
    impact: {
      repliedReviews: replied,
      replyRate: replyRate(replied, reviewTotal),
      respondingDealers: int(ra?.respondingDealers),
      quote,
    },
    badges: {
      total: badgeTotal,
      items: badgeRows
        .filter((b) => b.badge)
        .map((b) => ({
          id: b.badge.id,
          name: b.badge.name,
          icon: b.badge.icon || null,
          rarity: b.badge.rarity || 'common',
          color: b.badge.color ?? null,
          earnedAtIso: b.earnedAt.toISOString(),
        })),
    },
    journey,
    points: { earned },
    squads: { battles, wins },
    activity: {
      unit: period.month == null ? 'month' : 'day',
      buckets: bucketize(days_, period, days),
    },
    rhythm,
    hasActivity: hasAnyActivity({
      visits: visitsTotal,
      reviews: reviewTotal,
      badges: badgeTotal,
      leagueUps: leagueUps.length,
      levelUps,
      battles,
    }),
  };
  return summary;
}
