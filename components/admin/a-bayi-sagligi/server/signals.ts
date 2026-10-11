/**
 * Bayi Sağlığı — sinyal toplayıcı. TÜM bayiler için tek geçiş (keyfi 200 sınırı yok, dev `IN`
 * listesi yok — denetim Bulgu 3 ve 9). Sorgular dealerId'ye göre gruplanır; QR geri bildirimi
 * ve tüketim yorumu birleştirilir (Bulgu 4). Sonuç Redis'te kısa süre önbelleğe alınır.
 *
 * Önbellekte YALNIZ ağır sinyaller durur; CSM görev sayıları her istekte canlı okunur (görev
 * oluşturma/kapatma anında listeye yansır).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import {
  EMPTY_REVIEWS,
  REMEDY_OVERDUE_HOURS,
  type DealerSignals,
  type HealthWindow,
  type IncidentSeverityKey,
  type ReviewWindow,
} from '../domain';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
export const SIGNALS_CACHE_TTL_SECONDS = 120;
const CACHE_PREFIX = 'admin:dealer-health:v2';

export interface SignalSnapshot {
  window: HealthWindow;
  computedAt: string;
  signals: DealerSignals[];
}

type ReviewAggRow = {
  dealerId: string;
  cur_n: bigint | number | null;
  cur_sum: bigint | number | null;
  cur_rep: bigint | number | null;
  cur_neg: bigint | number | null;
  prev_n: bigint | number | null;
  prev_sum: bigint | number | null;
  prev_rep: bigint | number | null;
  prev_neg: bigint | number | null;
  prev2_n: bigint | number | null;
};

type CountRow = { dealerId: string; cur: bigint | number | null; prev: bigint | number | null; prev2: bigint | number | null };
type CohortRow = { dealerId: string; new_c: bigint | number | null; returned_c: bigint | number | null };
type RemedyRow = { dealerId: string; queue: bigint | number | null; overdue: bigint | number | null; oldest: Date | null };

const num = (v: bigint | number | null | undefined): number => (v == null ? 0 : Number(v));

function reviewWindows(r: ReviewAggRow | undefined): { cur: ReviewWindow; prev: ReviewWindow; prev2: number } {
  if (!r) return { cur: { ...EMPTY_REVIEWS }, prev: { ...EMPTY_REVIEWS }, prev2: 0 };
  return {
    cur: { n: num(r.cur_n), ratingSum: num(r.cur_sum), replied: num(r.cur_rep), negative: num(r.cur_neg) },
    prev: { n: num(r.prev_n), ratingSum: num(r.prev_sum), replied: num(r.prev_rep), negative: num(r.prev_neg) },
    prev2: num(r.prev2_n),
  };
}

function addReviews(a: ReviewWindow, b: ReviewWindow): ReviewWindow {
  return { n: a.n + b.n, ratingSum: a.ratingSum + b.ratingSum, replied: a.replied + b.replied, negative: a.negative + b.negative };
}

function reviewAggSql(cur: Date, prev: Date, prev2: Date) {
  return Prisma.sql`
    COUNT(*) FILTER (WHERE x."createdAt" >= ${cur}) AS cur_n,
    COALESCE(SUM(x."rating") FILTER (WHERE x."createdAt" >= ${cur}), 0) AS cur_sum,
    COUNT(*) FILTER (WHERE x."createdAt" >= ${cur} AND x."dealerRepliedAt" IS NOT NULL) AS cur_rep,
    COUNT(*) FILTER (WHERE x."createdAt" >= ${cur} AND x."rating" <= 2) AS cur_neg,
    COUNT(*) FILTER (WHERE x."createdAt" >= ${prev} AND x."createdAt" < ${cur}) AS prev_n,
    COALESCE(SUM(x."rating") FILTER (WHERE x."createdAt" >= ${prev} AND x."createdAt" < ${cur}), 0) AS prev_sum,
    COUNT(*) FILTER (WHERE x."createdAt" >= ${prev} AND x."createdAt" < ${cur} AND x."dealerRepliedAt" IS NOT NULL) AS prev_rep,
    COUNT(*) FILTER (WHERE x."createdAt" >= ${prev} AND x."createdAt" < ${cur} AND x."rating" <= 2) AS prev_neg,
    COUNT(*) FILTER (WHERE x."createdAt" >= ${prev2} AND x."createdAt" < ${prev}) AS prev2_n`;
}

/** Ağır sinyalleri hesaplar (önbelleksiz). Test edilebilir: `now` dışarıdan verilebilir. */
export async function computeSignals(window: HealthWindow, now: Date = new Date()): Promise<SignalSnapshot> {
  const w = window * DAY_MS;
  const cur = new Date(now.getTime() - w);
  const prev = new Date(now.getTime() - 2 * w);
  const prev2 = new Date(now.getTime() - 3 * w);
  const cohortEnd = new Date(now.getTime() - 7 * DAY_MS);
  const overdueBefore = new Date(now.getTime() - REMEDY_OVERDUE_HOURS * HOUR_MS);

  const [dealers, fbRows, crRows, consRows, incidents, remedyRows, cohortRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'DEALER' },
      select: { id: true, businessName: true, name: true, email: true, fraudStatus: true, createdAt: true },
    }),
    prisma.$queryRaw<ReviewAggRow[]>(Prisma.sql`
      SELECT q."dealerId" AS "dealerId", ${reviewAggSql(cur, prev, prev2)}
      FROM "Feedback" x
      JOIN "QRCode" q ON q."id" = x."qrCodeId"
      WHERE x."deletedAt" IS NULL AND x."createdAt" >= ${prev2}
      GROUP BY q."dealerId"
    `),
    prisma.$queryRaw<ReviewAggRow[]>(Prisma.sql`
      SELECT c."dealerId" AS "dealerId", ${reviewAggSql(cur, prev, prev2)}
      FROM "ConsumptionReview" x
      JOIN "Consumption" c ON c."id" = x."consumptionId"
      WHERE x."deletedAt" IS NULL AND x."createdAt" >= ${prev2}
      GROUP BY c."dealerId"
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT "dealerId",
        COUNT(*) FILTER (WHERE "createdAt" >= ${cur}) AS cur,
        COUNT(*) FILTER (WHERE "createdAt" >= ${prev} AND "createdAt" < ${cur}) AS prev,
        COUNT(*) FILTER (WHERE "createdAt" >= ${prev2} AND "createdAt" < ${prev}) AS prev2
      FROM "Consumption"
      WHERE "createdAt" >= ${prev2}
      GROUP BY "dealerId"
    `),
    prisma.incident.groupBy({
      by: ['dealerId', 'severity'],
      where: { status: { in: ['open', 'assigned', 'in_progress'] } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<RemedyRow[]>(Prisma.sql`
      SELECT "dealerId",
        COUNT(*) AS queue,
        COUNT(*) FILTER (WHERE "createdAt" < ${overdueBefore}) AS overdue,
        MIN("createdAt") AS oldest
      FROM "RemedyOffer"
      WHERE "status" = 'awaiting_dealer_approval'
      GROUP BY "dealerId"
    `),
    // İlk ziyaret kohortu: pencere içinde ve en az 7 gün önce ilk kez gelen müşteriler; ikinci ziyaret yapanlar.
    prisma.$queryRaw<CohortRow[]>(Prisma.sql`
      SELECT t."dealerId",
        COUNT(*) AS new_c,
        COUNT(*) FILTER (WHERE t.visits > 1) AS returned_c
      FROM (
        SELECT "dealerId", "customerId", MIN("createdAt") AS first_at, COUNT(*) AS visits
        FROM "Consumption"
        GROUP BY "dealerId", "customerId"
      ) t
      WHERE t.first_at >= ${cur} AND t.first_at < ${cohortEnd}
      GROUP BY t."dealerId"
    `),
  ]);

  const fb = new Map(fbRows.map((r) => [r.dealerId, reviewWindows(r)]));
  const cr = new Map(crRows.map((r) => [r.dealerId, reviewWindows(r)]));
  const cons = new Map(consRows.map((r) => [r.dealerId, r]));
  const remedy = new Map(remedyRows.map((r) => [r.dealerId, r]));
  const cohort = new Map(cohortRows.map((r) => [r.dealerId, r]));
  const inc = new Map<string, Record<IncidentSeverityKey, number>>();
  for (const g of incidents) {
    const sev = (['critical', 'high', 'medium', 'low'] as const).includes(g.severity as IncidentSeverityKey)
      ? (g.severity as IncidentSeverityKey)
      : 'medium';
    const e = inc.get(g.dealerId) ?? { critical: 0, high: 0, medium: 0, low: 0 };
    e[sev] += g._count._all;
    inc.set(g.dealerId, e);
  }

  const signals: DealerSignals[] = dealers.map((d) => {
    const a = fb.get(d.id) ?? reviewWindows(undefined);
    const b = cr.get(d.id) ?? reviewWindows(undefined);
    const c = cons.get(d.id);
    const rm = remedy.get(d.id);
    const co = cohort.get(d.id);
    const oldest = rm?.oldest ? new Date(rm.oldest) : null;
    return {
      dealerId: d.id,
      label: d.businessName?.trim() || d.name?.trim() || d.email || d.id.slice(0, 8),
      email: d.email ?? null,
      createdAt: d.createdAt.toISOString(),
      fraudStatus: d.fraudStatus || 'clean',
      reviews: addReviews(a.cur, b.cur),
      prevReviews: addReviews(a.prev, b.prev),
      prev2ReviewCount: a.prev2 + b.prev2,
      consumptions: num(c?.cur),
      prevConsumptions: num(c?.prev),
      prev2Consumptions: num(c?.prev2),
      incidents: inc.get(d.id) ?? { critical: 0, high: 0, medium: 0, low: 0 },
      remedyQueue: num(rm?.queue),
      remedyOverdue: num(rm?.overdue),
      remedyOldestHours: oldest ? (now.getTime() - oldest.getTime()) / HOUR_MS : null,
      newCustomers: num(co?.new_c),
      returnedCustomers: num(co?.returned_c),
    };
  });

  return { window, computedAt: now.toISOString(), signals };
}

/** Önbellekli okuma. `fresh: true` → önbelleği atlar ve yeniler ("Yenile" düğmesi). */
export async function getSignals(window: HealthWindow, opts: { fresh?: boolean } = {}): Promise<SignalSnapshot> {
  const key = `${CACHE_PREFIX}:${window}`;
  if (!opts.fresh) {
    const cached = await redisGetJson<SignalSnapshot>(key);
    if (cached && Array.isArray(cached.signals)) return cached;
  }
  const snap = await computeSignals(window);
  await redisSetJson(key, snap, SIGNALS_CACHE_TTL_SECONDS);
  return snap;
}

/** Açık CSM görevleri (canlı). */
export async function openCsmCounts(): Promise<Map<string, number>> {
  const rows = await prisma.cSMTask.groupBy({
    by: ['dealerId'],
    where: { status: { in: ['open', 'in_progress'] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.dealerId, r._count._all]));
}
