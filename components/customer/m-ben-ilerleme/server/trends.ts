/**
 * Ben → İlerleme: kişisel trendler (dönem 7/30/90/365 gün). Sunucu.
 *
 * Eski uçların (trends, analytics) sorunlarının karşılığı:
 *  - Gruplama SQL'de, Europe/Istanbul takvimiyle (`AT TIME ZONE 'UTC' AT TIME ZONE tz`);
 *    8.000 satırı belleğe çekip JS'te UTC ile saymak yok (analytics bulgu 1/6, trends bulgu 4).
 *  - Puan/XP grafiği gerçek defterden (`PointsLedger`); "her yorum = taban puan" tahmini ve
 *    `amount * 2` yok (trends bulgu 5, analytics bulgu 3).
 *  - Önceki dönem 0 ise yüzde yok, `new` (trends bulgu 3).
 *  - Bölüm bazlı hata: `partial[]` (200 + sıfır yok).
 *  - Sonuç kullanıcı+dönem anahtarıyla Redis'te kısa süre tutulur.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson, redisGetJson, redisSetJson } from '@/lib/redis';
import { istanbulDay } from '@/components/ds/page/date-range';
import { changeOf, fillSeries, periodWindow, type BucketUnit, type ProgressPeriod } from '../period';
import type { Kpi, PartialKey, ProgressTrends } from '../types';

const TZ = 'Europe/Istanbul';
const CACHE_TTL_SECONDS = 90;

/** UTC saklanan `timestamp` → İstanbul duvar saati (SQL parçası, sütun adı sabit). */
function local(col: string): Prisma.Sql {
  return Prisma.raw(`((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`);
}

function unitSql(unit: BucketUnit): Prisma.Sql {
  // Beyaz liste: yalnız üç sabit değer.
  return Prisma.raw(`'${unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'month'}'`);
}

async function section<T>(key: PartialKey, partial: PartialKey[], run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[me-progress] trend bölümü hesaplanamadı: ${key}`, error);
    partial.push(key);
    return null;
  }
}

type KRow = { k: string; n: number | bigint | null };
type TotalsRow = { cur: number | bigint | null; prev: number | bigint | null };

const num = (v: number | bigint | null | undefined) => (v == null ? 0 : Number(v));

/** Ledger'ın tutulmaya başladığı gün (küresel, önbellekli). */
async function ledgerSince(): Promise<string | null> {
  const iso = await cachedJson<{ at: string | null }>('me-progress:ledger-since:v1', 3600, async () => {
    const r = await prisma.pointsLedger.findFirst({
      where: { status: 'posted' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return { at: r ? r.createdAt.toISOString() : null };
  });
  return iso.at ? istanbulDay(new Date(iso.at)) : null;
}

export async function computeProgressTrends(userId: string, period: ProgressPeriod, now: Date = new Date()): Promise<ProgressTrends> {
  const w = periodWindow(period, now);
  const partial: PartialKey[] = [];
  const unit = unitSql(w.unit);
  const { from, to, prevFrom } = w;

  const activity = section('activity', partial, async () => {
    const [reviewBuckets, visitBuckets, totals] = await Promise.all([
      prisma.$queryRaw<KRow[]>(Prisma.sql`
        SELECT to_char(date_trunc(${unit}, t), 'YYYY-MM-DD') AS k, count(*)::int AS n FROM (
          SELECT ${local('"createdAt"')} AS t FROM "Feedback"
           WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
          UNION ALL
          SELECT ${local('"createdAt"')} AS t FROM "ConsumptionReview"
           WHERE "customerId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
        ) x GROUP BY 1`),
      prisma.$queryRaw<KRow[]>(Prisma.sql`
        SELECT to_char(date_trunc(${unit}, ${local('"createdAt"')}), 'YYYY-MM-DD') AS k, count(*)::int AS n
          FROM "Consumption"
         WHERE "customerId" = ${userId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
         GROUP BY 1`),
      prisma.$queryRaw<Array<{ rc: number; rp: number; vc: number; vp: number; pc: number; pp: number }>>(Prisma.sql`
        WITH r AS (
          SELECT "createdAt" AS at FROM "Feedback"
           WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${prevFrom} AND "createdAt" < ${to}
          UNION ALL
          SELECT "createdAt" FROM "ConsumptionReview"
           WHERE "customerId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${prevFrom} AND "createdAt" < ${to}
        ),
        v AS (
          SELECT "createdAt" AS at, "dealerId" FROM "Consumption"
           WHERE "customerId" = ${userId} AND "createdAt" >= ${prevFrom} AND "createdAt" < ${to}
        ),
        p AS (
          SELECT f."createdAt" AS at, q."dealerId" FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId"
           WHERE f."userId" = ${userId} AND f."deletedAt" IS NULL AND f."createdAt" >= ${prevFrom} AND f."createdAt" < ${to}
          UNION ALL
          SELECT at, "dealerId" FROM v
        )
        SELECT
          (SELECT count(*) FROM r WHERE at >= ${from})::int AS rc,
          (SELECT count(*) FROM r WHERE at < ${from})::int AS rp,
          (SELECT count(*) FROM v WHERE at >= ${from})::int AS vc,
          (SELECT count(*) FROM v WHERE at < ${from})::int AS vp,
          (SELECT count(DISTINCT "dealerId") FROM p WHERE at >= ${from})::int AS pc,
          (SELECT count(DISTINCT "dealerId") FROM p WHERE at < ${from})::int AS pp`),
    ]);
    const t = totals[0] ?? { rc: 0, rp: 0, vc: 0, vp: 0, pc: 0, pp: 0 };
    return {
      reviews: fillSeries(w.keys, reviewBuckets.map((r) => ({ k: r.k, n: num(r.n) }))),
      visits: fillSeries(w.keys, visitBuckets.map((r) => ({ k: r.k, n: num(r.n) }))),
      totals: {
        reviews: { cur: num(t.rc), prev: num(t.rp) },
        visits: { cur: num(t.vc), prev: num(t.vp) },
        places: { cur: num(t.pc), prev: num(t.pp) },
      },
    };
  });

  const points = section('points', partial, async () => {
    const [buckets, totals, since] = await Promise.all([
      prisma.$queryRaw<Array<{ k: string; earned: number | bigint | null; xp: number | bigint | null }>>(Prisma.sql`
        SELECT to_char(date_trunc(${unit}, ${local('"createdAt"')}), 'YYYY-MM-DD') AS k,
               coalesce(sum(CASE WHEN "delta" > 0 THEN "delta" ELSE 0 END), 0)::int AS earned,
               coalesce(sum(CASE WHEN "xpDelta" > 0 THEN "xpDelta" ELSE 0 END), 0)::int AS xp
          FROM "PointsLedger"
         WHERE "userId" = ${userId} AND "status" = 'posted' AND "currency" = 'POINTS'
           AND "createdAt" >= ${from} AND "createdAt" < ${to}
         GROUP BY 1`),
      prisma.$queryRaw<Array<{ ec: number; ep: number; xc: number; xp: number; sc: number }>>(Prisma.sql`
        SELECT
          coalesce(sum(CASE WHEN "createdAt" >= ${from} AND "delta" > 0 THEN "delta" ELSE 0 END), 0)::int AS ec,
          coalesce(sum(CASE WHEN "createdAt" < ${from} AND "delta" > 0 THEN "delta" ELSE 0 END), 0)::int AS ep,
          coalesce(sum(CASE WHEN "createdAt" >= ${from} AND "xpDelta" > 0 THEN "xpDelta" ELSE 0 END), 0)::int AS xc,
          coalesce(sum(CASE WHEN "createdAt" < ${from} AND "xpDelta" > 0 THEN "xpDelta" ELSE 0 END), 0)::int AS xp,
          coalesce(sum(CASE WHEN "createdAt" >= ${from} AND "delta" < 0 THEN -"delta" ELSE 0 END), 0)::int AS sc
          FROM "PointsLedger"
         WHERE "userId" = ${userId} AND "status" = 'posted' AND "currency" = 'POINTS'
           AND "createdAt" >= ${prevFrom} AND "createdAt" < ${to}`),
      ledgerSince(),
    ]);
    const t = totals[0] ?? { ec: 0, ep: 0, xc: 0, xp: 0, sc: 0 };
    // Önceki dönem defter başlamadan önceyse "önceki" bilinmiyor → karşılaştırma yapılmaz.
    const prevKnown = since != null && since <= istanbulDay(prevFrom);
    return {
      earned: fillSeries(w.keys, buckets.map((b) => ({ k: b.k, n: num(b.earned) }))),
      xp: fillSeries(w.keys, buckets.map((b) => ({ k: b.k, n: num(b.xp) }))),
      totals: {
        earned: { cur: num(t.ec), prev: prevKnown ? num(t.ep) : null },
        xp: { cur: num(t.xc), prev: prevKnown ? num(t.xp) : null },
        spent: num(t.sc),
      },
      since,
    };
  });

  const habits = section('habits', partial, async () => {
    const rows = await prisma.$queryRaw<Array<{ d: number; h: number; n: number | bigint }>>(Prisma.sql`
      SELECT EXTRACT(ISODOW FROM t)::int AS d, EXTRACT(HOUR FROM t)::int AS h, count(*)::int AS n FROM (
        SELECT ${local('"createdAt"')} AS t FROM "Consumption"
         WHERE "customerId" = ${userId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
        UNION ALL
        SELECT ${local('"createdAt"')} FROM "Feedback"
         WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
        UNION ALL
        SELECT ${local('"createdAt"')} FROM "ConsumptionReview"
         WHERE "customerId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
      ) x GROUP BY 1, 2`);
    const cells = rows.map((r) => ({ d: Number(r.d), h: Number(r.h), n: num(r.n) }));
    return { cells, total: cells.reduce((s, c) => s + c.n, 0) };
  });

  const experience = section('experience', partial, async () => {
    const rows = await prisma.$queryRaw<Array<{ s: string | null; n: number | bigint; heard: number | bigint }>>(Prisma.sql`
      SELECT s, count(*)::int AS n, count(replied)::int AS heard FROM (
        SELECT lower("sentiment") AS s, "dealerRepliedAt" AS replied FROM "Feedback"
         WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
        UNION ALL
        SELECT lower("sentiment"), "dealerRepliedAt" FROM "ConsumptionReview"
         WHERE "customerId" = ${userId} AND "deletedAt" IS NULL AND "createdAt" >= ${from} AND "createdAt" < ${to}
      ) x GROUP BY 1`);
    const out = { positive: 0, neutral: 0, negative: 0, pending: 0, heard: 0 };
    for (const r of rows) {
      const n = num(r.n);
      out.heard += num(r.heard);
      if (r.s === 'positive') out.positive += n;
      else if (r.s === 'neutral') out.neutral += n;
      else if (r.s === 'negative') out.negative += n;
      else out.pending += n;
    }
    return out;
  });

  const places = section('places', partial, async () => {
    const rows = await prisma.$queryRaw<
      Array<{ dealerId: string; visits: number | bigint; reviews: number | bigint; avg: number | null; last: Date }>
    >(Prisma.sql`
      SELECT "dealerId",
             count(*) FILTER (WHERE kind = 'visit')::int AS visits,
             count(*) FILTER (WHERE kind = 'review')::int AS reviews,
             avg(rating)::float AS avg,
             max(at) AS last
        FROM (
          SELECT "dealerId", 'visit' AS kind, NULL::int AS rating, "createdAt" AS at FROM "Consumption"
           WHERE "customerId" = ${userId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
          UNION ALL
          SELECT q."dealerId", 'review', f."rating", f."createdAt" FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId"
           WHERE f."userId" = ${userId} AND f."deletedAt" IS NULL AND f."createdAt" >= ${from} AND f."createdAt" < ${to}
          UNION ALL
          SELECT c."dealerId", 'review', r."rating", r."createdAt" FROM "ConsumptionReview" r JOIN "Consumption" c ON c.id = r."consumptionId"
           WHERE r."customerId" = ${userId} AND r."deletedAt" IS NULL AND r."createdAt" >= ${from} AND r."createdAt" < ${to}
        ) x
       GROUP BY 1
       ORDER BY (count(*)) DESC, max(at) DESC
       LIMIT 5`);
    if (rows.length === 0) return [];
    const dealers = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.dealerId) } },
      select: { id: true, name: true, businessName: true, businessLogo: true },
    });
    const byId = new Map(dealers.map((d) => [d.id, d]));
    return rows.map((r) => {
      const d = byId.get(r.dealerId);
      return {
        dealerId: r.dealerId,
        name: d?.businessName || d?.name || '',
        logo: d?.businessLogo || null,
        visits: num(r.visits),
        reviews: num(r.reviews),
        avgRating: r.avg == null ? null : Math.round(Number(r.avg) * 10) / 10,
        lastAt: new Date(r.last).toISOString(),
      };
    });
  });

  const topProducts = section('places', partial, async () => {
    const grouped = await prisma.consumption.groupBy({
      by: ['productId'],
      where: { customerId: userId, createdAt: { gte: from, lt: to }, productId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 3,
    });
    const ids = grouped.map((g) => g.productId).filter((id): id is string => !!id);
    if (ids.length === 0) return [];
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const names = new Map(products.map((p) => [p.id, p.name]));
    return grouped
      .filter((g) => g.productId && names.has(g.productId))
      .map((g) => ({ id: g.productId as string, name: names.get(g.productId as string) as string, count: g._count._all }));
  });

  const [a, p, h, e, pl, tp] = await Promise.all([activity, points, habits, experience, places, topProducts]);

  const kpis: Kpi[] = [
    {
      key: 'reviews',
      current: a ? a.totals.reviews.cur : null,
      previous: a ? a.totals.reviews.prev : null,
      change: a ? changeOf(a.totals.reviews.cur, a.totals.reviews.prev) : { kind: 'none' },
    },
    {
      key: 'visits',
      current: a ? a.totals.visits.cur : null,
      previous: a ? a.totals.visits.prev : null,
      change: a ? changeOf(a.totals.visits.cur, a.totals.visits.prev) : { kind: 'none' },
    },
    {
      key: 'places',
      current: a ? a.totals.places.cur : null,
      previous: a ? a.totals.places.prev : null,
      change: a ? changeOf(a.totals.places.cur, a.totals.places.prev) : { kind: 'none' },
    },
    {
      key: 'pointsEarned',
      current: p ? p.totals.earned.cur : null,
      previous: p ? p.totals.earned.prev : null,
      change: p && p.totals.earned.prev != null ? changeOf(p.totals.earned.cur, p.totals.earned.prev) : { kind: 'none' },
    },
    {
      key: 'xpEarned',
      current: p ? p.totals.xp.cur : null,
      previous: p ? p.totals.xp.prev : null,
      change: p && p.totals.xp.prev != null ? changeOf(p.totals.xp.cur, p.totals.xp.prev) : { kind: 'none' },
    },
  ];

  return {
    asOf: now.toISOString(),
    period,
    unit: w.unit,
    fromDay: w.fromDay,
    toDay: w.toDay,
    keys: w.keys,
    kpis,
    pointsSpent: p ? p.totals.spent : null,
    series: {
      reviews: a ? a.reviews : w.keys.map(() => 0),
      visits: a ? a.visits : w.keys.map(() => 0),
      pointsEarned: p ? p.earned : null,
      xpEarned: p ? p.xp : null,
    },
    ledgerSince: p ? p.since : null,
    habits: h,
    experience: e,
    places: pl,
    topProducts: tp,
    partial: Array.from(new Set(partial)),
  };
}

/** Kısa önbellekli okuma (kullanıcı + dönem + İstanbul günü anahtarı). Kısmi sonuç önbelleğe girmez. */
export async function getProgressTrends(userId: string, period: ProgressPeriod, now: Date = new Date()): Promise<ProgressTrends> {
  const key = `me-progress:trends:v1:${userId}:${period}:${istanbulDay(now)}`;
  const cached = await redisGetJson<ProgressTrends>(key);
  if (cached && cached.period === period && Array.isArray(cached.kpis)) return cached;
  const fresh = await computeProgressTrends(userId, period, now);
  if (fresh.partial.length === 0) await redisSetJson(key, fresh, CACHE_TTL_SECONDS);
  return fresh;
}
