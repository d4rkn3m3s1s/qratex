/**
 * Harcama özeti (Cüzdan → Hareketler → Özet) — tek servis.
 *
 * Denetim (docs/audit/2026-10-08/musteri/customer_spending-overview.md):
 *  - B6: kovalar Europe/Istanbul takviminde (`AT TIME ZONE`), etiketler istemcide `Intl`.
 *  - B7: harcama kapsamı (kaç ziyarette tutar var) ve ortalama sepet; geçersiz/negatif/absürt
 *    tutarlar (NaN, ∞, ≤ 0, ≥ 1.000.000) toplamdan dışlanır (savunmacı katman).
 *  - B5: ortalama puan QR geri bildirimi + ziyaret yorumu birleşik (ağırlıklı).
 *  - B8: işletme etiketi ham `dealerId` olamaz; ad yoksa null (istemci "İsimsiz işletme").
 *  - Eksik özellikler: dönem seçici + önceki döneme göre değişim, harcama serisi, ürün kırılımı,
 *    bu dönemde kazanılan puan (defterden), son ziyaret.
 */
import { Prisma } from '@prisma/client';
import type { prisma as prismaClient } from '@/lib/prisma';
import { istanbulDay } from '@/components/ds/page/date-range';
import { bucketKeys, resolveSummaryPeriod, type ResolvedPeriod, type SummaryBucket, type SummaryRange } from '../periods';
import { sumPointsInRange } from './points-history';

type Db = Pick<typeof prismaClient, '$queryRaw' | 'consumption' | 'user' | 'feedback' | 'consumptionReview'>;

/** Geçerli tutar koşulu (NaN ve ∞ da `< 1e6` ile elenir: Postgres'te NaN en büyük değerdir). */
const VALID_AMOUNT = Prisma.sql`"amount" > 0 AND "amount" < 1000000`;
const LOCAL_TS = Prisma.sql`(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')`;

export type SpendTotals = {
  visits: number;
  dealers: number;
  spend: number;
  /** Tutarı kayıtlı ziyaret sayısı (kapsam). */
  spendCount: number;
  avgBasket: number | null;
};

export type SpendSummary = {
  range: SummaryRange;
  bucket: SummaryBucket;
  generatedAt: string;
  periodFrom: string | null;
  totals: SpendTotals;
  previous: { visits: number; spend: number } | null;
  series: Array<{ key: string; visits: number; spend: number }>;
  topDealers: Array<{ dealerId: string; name: string | null; logo: string | null; visits: number; spend: number; lastVisitAt: string }>;
  topProducts: Array<{ name: string; icon: string | null; count: number }>;
  rating: { avg: number | null; count: number; feedbackCount: number; reviewCount: number };
  points: { earned: number; spent: number; earnedFromVisits: number; earnedFromFeedback: number };
  /** Tüm zamanlarda yorum bekleyen ziyaret (sonraki adım kartı). */
  unreviewed: number;
  firstVisitAt: string | null;
};

type TotalsRow = { visits: number | bigint; dealers: number | bigint; spend: number | null; spend_count: number | bigint };

function periodCond(from: Date | null, to: Date): Prisma.Sql {
  return from ? Prisma.sql`AND "createdAt" >= ${from} AND "createdAt" < ${to}` : Prisma.sql`AND "createdAt" < ${to}`;
}

async function totalsFor(db: Db, userId: string, from: Date | null, to: Date): Promise<SpendTotals> {
  const rows = await db.$queryRaw<TotalsRow[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS visits,
           COUNT(DISTINCT "dealerId")::bigint AS dealers,
           COALESCE(SUM("amount") FILTER (WHERE ${VALID_AMOUNT}), 0)::float8 AS spend,
           COUNT(*) FILTER (WHERE ${VALID_AMOUNT})::bigint AS spend_count
      FROM "Consumption"
     WHERE "customerId" = ${userId} ${periodCond(from, to)}
  `);
  const r = rows[0];
  const visits = Number(r?.visits ?? 0);
  const spend = Math.round(Number(r?.spend ?? 0) * 100) / 100;
  const spendCount = Number(r?.spend_count ?? 0);
  return {
    visits,
    dealers: Number(r?.dealers ?? 0),
    spend,
    spendCount,
    avgBasket: spendCount > 0 ? Math.round((spend / spendCount) * 100) / 100 : null,
  };
}

const BUCKET_SQL: Record<SummaryBucket, Prisma.Sql> = {
  day: Prisma.raw(`'day'`),
  week: Prisma.raw(`'week'`),
  month: Prisma.raw(`'month'`),
};

async function seriesFor(db: Db, userId: string, period: ResolvedPeriod, firstDay: string | null) {
  const keys = bucketKeys(period, firstDay);
  if (keys.length === 0) return [];
  const rows = await db.$queryRaw<Array<{ key: string; visits: number | bigint; spend: number | null }>>(Prisma.sql`
    SELECT to_char(date_trunc(${BUCKET_SQL[period.bucket]}, ${LOCAL_TS}), 'YYYY-MM-DD') AS key,
           COUNT(*)::bigint AS visits,
           COALESCE(SUM("amount") FILTER (WHERE ${VALID_AMOUNT}), 0)::float8 AS spend
      FROM "Consumption"
     WHERE "customerId" = ${userId} ${periodCond(period.from, period.to)}
     GROUP BY 1
  `);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return keys.map((key) => {
    const r = byKey.get(key);
    return { key, visits: Number(r?.visits ?? 0), spend: Math.round(Number(r?.spend ?? 0) * 100) / 100 };
  });
}

async function topDealersFor(db: Db, userId: string, period: ResolvedPeriod) {
  const rows = await db.$queryRaw<Array<{ dealer_id: string; visits: number | bigint; spend: number | null; last_at: Date }>>(Prisma.sql`
    SELECT "dealerId" AS dealer_id,
           COUNT(*)::bigint AS visits,
           COALESCE(SUM("amount") FILTER (WHERE ${VALID_AMOUNT}), 0)::float8 AS spend,
           MAX("createdAt") AS last_at
      FROM "Consumption"
     WHERE "customerId" = ${userId} ${periodCond(period.from, period.to)}
     GROUP BY 1
     ORDER BY visits DESC, last_at DESC
     LIMIT 6
  `);
  if (rows.length === 0) return [];
  const dealers = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.dealer_id) } },
    select: { id: true, businessName: true, name: true, businessLogo: true },
  });
  const map = new Map(dealers.map((d) => [d.id, d]));
  return rows.map((r) => {
    const d = map.get(r.dealer_id);
    return {
      dealerId: r.dealer_id,
      name: d?.businessName?.trim() || d?.name?.trim() || null,
      logo: d?.businessLogo || null,
      visits: Number(r.visits),
      spend: Math.round(Number(r.spend ?? 0) * 100) / 100,
      lastVisitAt: new Date(r.last_at).toISOString(),
    };
  });
}

async function topProductsFor(db: Db, userId: string, period: ResolvedPeriod) {
  const cond = period.from
    ? Prisma.sql`AND c."createdAt" >= ${period.from} AND c."createdAt" < ${period.to}`
    : Prisma.sql`AND c."createdAt" < ${period.to}`;
  const rows = await db.$queryRaw<Array<{ name: string; icon: string | null; n: number | bigint }>>(Prisma.sql`
    SELECT p."name" AS name, pc."icon" AS icon, COUNT(*)::bigint AS n
      FROM "Consumption" c
      JOIN "Product" p ON p."id" = c."productId"
      LEFT JOIN "ProductCategory" pc ON pc."id" = p."categoryId"
     WHERE c."customerId" = ${userId} ${cond}
     GROUP BY p."name", pc."icon"
     ORDER BY n DESC, p."name" ASC
     LIMIT 5
  `);
  return rows.map((r) => ({ name: r.name, icon: r.icon, count: Number(r.n) }));
}

async function ratingFor(db: Db, userId: string, period: ResolvedPeriod) {
  const createdAt = period.from ? { gte: period.from, lt: period.to } : { lt: period.to };
  const [fb, rv] = await Promise.all([
    db.feedback.aggregate({ where: { userId, deletedAt: null, createdAt }, _avg: { rating: true }, _count: { _all: true } }),
    db.consumptionReview.aggregate({
      where: { customerId: userId, deletedAt: null, createdAt },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  const fc = fb._count._all ?? 0;
  const rc = rv._count._all ?? 0;
  const count = fc + rc;
  const sum = (fb._avg.rating ?? 0) * fc + (rv._avg.rating ?? 0) * rc;
  return { avg: count > 0 ? Math.round((sum / count) * 10) / 10 : null, count, feedbackCount: fc, reviewCount: rc };
}

export async function getSpendSummary(db: Db, userId: string, range: SummaryRange, now: Date = new Date()): Promise<SpendSummary> {
  const period = resolveSummaryPeriod(range, now);
  const first = await db.consumption.findFirst({
    where: { customerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const firstDay = first ? istanbulDay(first.createdAt) : null;

  const [totals, previous, series, topDealers, topProducts, rating, points, unreviewed] = await Promise.all([
    totalsFor(db, userId, period.from, period.to),
    period.compare ? totalsFor(db, userId, period.compare.from, period.compare.to) : Promise.resolve(null),
    seriesFor(db, userId, period, firstDay),
    topDealersFor(db, userId, period),
    topProductsFor(db, userId, period),
    ratingFor(db, userId, period),
    sumPointsInRange(db, userId, period.from, period.to),
    db.consumption.count({ where: { customerId: userId, review: null } }),
  ]);

  return {
    range: period.range,
    bucket: period.bucket,
    generatedAt: now.toISOString(),
    periodFrom: period.from ? period.from.toISOString() : null,
    totals,
    previous: previous ? { visits: previous.visits, spend: previous.spend } : null,
    series,
    topDealers,
    topProducts,
    rating,
    points,
    unreviewed,
    firstVisitAt: first ? first.createdAt.toISOString() : null,
  };
}

/** Yüzde değişim (önceki 0 ise null — "∞" gösterilmez). */
export function percentDelta(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
