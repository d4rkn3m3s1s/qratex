/**
 * Bayi "Bugün" verisi — TEK sunucu yükleyicisi.
 *
 * `app/dealer/page.tsx` (SSR ilk render) ve `GET /api/dealer/today` (tazeleme) bunu çağırır.
 * Bütün sorgular tek `Promise.all` turunda (öneri takibi hariç: o, öneri kayıtlarına bağlı
 * ikinci küçük tur). Her sorgu bayi kimliğiyle kapsanır (`dealerId` yalnız oturumdan/kapsamdan
 * gelir). Hata FIRLATILIR — "200 + sıfırlar" yok (dealer.md B4).
 *
 * Kısa Redis önbelleği (30 sn) yalnız aynı bayinin art arda açılışlarını sönümler; "Yenile"
 * (`fresh`) ve bu yüzeyin kendi yazma uçları önbelleği atlar/siler.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import {
  buildMetrics,
  buildNextActions,
  buildSetup,
  excerpt,
  feedbackHref,
  fillDaily,
  greetingFor,
  hoursBetween,
  latestCompletedWeek,
  maxSeverity,
  normalizeText,
  pickSuggestions,
  toInt,
  toNum,
  toPriority,
  todayWindows,
  weightedAvg,
  type DailyRow,
} from './core';
import type { DealerTodayData, FeedbackSource, TodoItem, WaitingItem } from './types';

type Db = typeof prisma;

const LOCAL_DAY = (col: string) =>
  Prisma.sql`to_char(((${Prisma.raw(col)} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD')`;

const OPEN_TODO = ['pending', 'assigned', 'in_progress'] as const;
const OPEN_INCIDENT = ['open', 'assigned', 'in_progress'] as const;

export const DEALER_TODAY_CACHE_TTL_SECONDS = 30;
export const dealerTodayCacheKey = (dealerId: string) => `dealer-today:v1:${dealerId}`;

export class DealerTodayNotFoundError extends Error {
  constructor() {
    super('İşletme bulunamadı');
    this.name = 'DealerTodayNotFoundError';
  }
}

type FeedbackDayRow = {
  src: FeedbackSource;
  day: string;
  n: number | bigint;
  sum: number | bigint | null;
  neg: number | bigint;
  neu: number | bigint;
  pos: number | bigint;
  replied: number | bigint;
};

type WaitingCountsRow = {
  total: number | bigint;
  neg: number | bigint;
  overdue: number | bigint;
  recent: number | bigint;
  oldest_neg: Date | null;
};

type WaitingItemRow = {
  id: string;
  src: FeedbackSource;
  rating: number;
  text: string | null;
  createdAt: Date;
  place: string | null;
};

/** Bayinin geri bildirimlerinin (iki kanal) birleşik alt sorgusu — `extra` her iki kola eklenir. */
function unionFeedback(dealerId: string, since: Date, cols: { qr: Prisma.Sql; cr: Prisma.Sql }, extra: { qr?: Prisma.Sql; cr?: Prisma.Sql } = {}) {
  return Prisma.sql`
    SELECT ${cols.qr}
    FROM "Feedback" f
    INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
    WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL AND f."createdAt" >= ${since} ${extra.qr ?? Prisma.empty}
    UNION ALL
    SELECT ${cols.cr}
    FROM "ConsumptionReview" cr
    INNER JOIN "Consumption" c ON c.id = cr."consumptionId"
    WHERE c."dealerId" = ${dealerId} AND cr."deletedAt" IS NULL AND cr."createdAt" >= ${since} ${extra.cr ?? Prisma.empty}
  `;
}

export async function loadDealerToday(
  dealerId: string,
  opts: { now?: Date; db?: Db; fresh?: boolean } = {}
): Promise<DealerTodayData> {
  const db = opts.db ?? prisma;
  if (!opts.fresh && !opts.now) {
    const hit = await redisGetJson<DealerTodayData>(dealerTodayCacheKey(dealerId));
    if (hit && typeof hit === 'object' && hit.generatedAt) return hit;
  }
  const data = await computeDealerToday(dealerId, opts.now ?? new Date(), db);
  if (!opts.now) await redisSetJson(dealerTodayCacheKey(dealerId), data, DEALER_TODAY_CACHE_TTL_SECONDS);
  return data;
}

async function computeDealerToday(dealerId: string, now: Date, db: Db): Promise<DealerTodayData> {
  const w = todayWindows(now);
  const h24 = new Date(now.getTime() - 24 * 3_600_000);

  const feedbackDaily = db.$queryRaw<FeedbackDayRow[]>(Prisma.sql`
    SELECT u.src, u.day,
           COUNT(*)::int AS n,
           COALESCE(SUM(u.rating), 0)::int AS sum,
           COUNT(*) FILTER (WHERE u.rating <= 2)::int AS neg,
           COUNT(*) FILTER (WHERE u.rating = 3)::int AS neu,
           COUNT(*) FILTER (WHERE u.rating >= 4)::int AS pos,
           COUNT(*) FILTER (WHERE u.replied)::int AS replied
    FROM (
      ${unionFeedback(dealerId, w.d14Start, {
        qr: Prisma.sql`'qr' AS src, ${LOCAL_DAY('f."createdAt"')} AS day, f.rating, (f."dealerReply" IS NOT NULL) AS replied`,
        cr: Prisma.sql`'consumption' AS src, ${LOCAL_DAY('cr."createdAt"')} AS day, cr.rating, (cr."dealerReply" IS NOT NULL) AS replied`,
      })}
    ) u
    GROUP BY u.src, u.day
  `);

  const sameTimeCounts = db.$queryRaw<Array<{ today: number | bigint; ysame: number | bigint }>>(Prisma.sql`
    SELECT COUNT(*) FILTER (WHERE u.ts >= ${w.todayStart})::int AS today,
           COUNT(*) FILTER (WHERE u.ts < ${w.sameTimeYesterday})::int AS ysame
    FROM (
      ${unionFeedback(dealerId, w.yesterdayStart, { qr: Prisma.sql`f."createdAt" AS ts`, cr: Prisma.sql`cr."createdAt" AS ts` })}
    ) u
  `);

  const consumptionDaily = db.$queryRaw<Array<{ day: string; n: number | bigint }>>(Prisma.sql`
    SELECT ${LOCAL_DAY('"createdAt"')} AS day, COUNT(*)::int AS n
    FROM "Consumption"
    WHERE "dealerId" = ${dealerId} AND "createdAt" >= ${w.d7Start}
    GROUP BY 1
  `);

  const consumptionsYesterdaySameTime = db.consumption.count({
    where: { dealerId, createdAt: { gte: w.yesterdayStart, lt: w.sameTimeYesterday } },
  });

  const medianResponse = db.$queryRaw<Array<{ median: number | null }>>(Prisma.sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY u.secs)::float AS median
    FROM (
      ${unionFeedback(
        dealerId,
        w.d7Start,
        {
          qr: Prisma.sql`EXTRACT(EPOCH FROM (f."dealerRepliedAt" - f."createdAt")) AS secs`,
          cr: Prisma.sql`EXTRACT(EPOCH FROM (cr."dealerRepliedAt" - cr."createdAt")) AS secs`,
        },
        {
          qr: Prisma.sql`AND f."dealerRepliedAt" IS NOT NULL AND f."dealerRepliedAt" >= f."createdAt"`,
          cr: Prisma.sql`AND cr."dealerRepliedAt" IS NOT NULL AND cr."dealerRepliedAt" >= cr."createdAt"`,
        }
      )}
    ) u
  `);

  const unanswered = { qr: Prisma.sql`AND f."dealerReply" IS NULL`, cr: Prisma.sql`AND cr."dealerReply" IS NULL` };

  const waitingCounts = db.$queryRaw<WaitingCountsRow[]>(Prisma.sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE u.rating <= 2)::int AS neg,
           COUNT(*) FILTER (WHERE u.rating <= 2 AND u.ts < ${h24})::int AS overdue,
           COUNT(*) FILTER (WHERE u.rating > 2 AND u.ts >= ${w.d7Start})::int AS recent,
           MIN(u.ts) FILTER (WHERE u.rating <= 2) AS oldest_neg
    FROM (
      ${unionFeedback(dealerId, w.d30Start, { qr: Prisma.sql`f.rating, f."createdAt" AS ts`, cr: Prisma.sql`cr.rating, cr."createdAt" AS ts` }, unanswered)}
    ) u
  `);

  const waitingItems = db.$queryRaw<WaitingItemRow[]>(Prisma.sql`
    SELECT * FROM (
      SELECT f.id, 'qr' AS src, f.rating, left(f.text, 200) AS text, f."createdAt", q.name AS place
      FROM "Feedback" f
      INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
      WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL AND f."dealerReply" IS NULL AND f."createdAt" >= ${w.d30Start}
      UNION ALL
      SELECT cr.id, 'consumption' AS src, cr.rating, left(cr.text, 200) AS text, cr."createdAt", p.name AS place
      FROM "ConsumptionReview" cr
      INNER JOIN "Consumption" c ON c.id = cr."consumptionId"
      LEFT JOIN "Product" p ON p.id = c."productId"
      WHERE c."dealerId" = ${dealerId} AND cr."deletedAt" IS NULL AND cr."dealerReply" IS NULL AND cr."createdAt" >= ${w.d30Start}
    ) u
    ORDER BY (u.rating <= 2) DESC,
             CASE WHEN u.rating <= 2 THEN EXTRACT(EPOCH FROM u."createdAt") ELSE -EXTRACT(EPOCH FROM u."createdAt") END ASC
    LIMIT 4
  `);

  const weakQr = db.$queryRaw<Array<{ name: string; avg: number; n: number | bigint }>>(Prisma.sql`
    SELECT q.name, AVG(f.rating)::float AS avg, COUNT(*)::int AS n
    FROM "Feedback" f
    INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
    WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL AND f."createdAt" >= ${w.d30Start} AND q."archivedAt" IS NULL
    GROUP BY q.id, q.name
    HAVING COUNT(*) >= 3
    ORDER BY avg ASC, n DESC
    LIMIT 1
  `);

  const [
    user,
    activeLocations,
    qrTotal,
    qrActive,
    productActive,
    anyFeedback,
    anyReview,
    fbDaily,
    sameTime,
    csDaily,
    csYesterday,
    median,
    wCounts,
    wItems,
    weak,
    remedyGroups,
    incidentGroups,
    todoRows,
    todoOpenTotal,
    todoOverdue,
    suggestionRows,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: dealerId },
      select: { name: true, businessName: true, businessDesc: true, address: true, latitude: true, longitude: true },
    }),
    db.dealerLocation.count({ where: { dealerId, isActive: true } }),
    db.qRCode.count({ where: { dealerId, archivedAt: null } }),
    db.qRCode.count({ where: { dealerId, archivedAt: null, revokedAt: null, isActive: true } }),
    db.product.count({ where: { dealerId, isActive: true } }),
    db.feedback.findFirst({ where: { qrCode: { dealerId }, deletedAt: null }, select: { id: true } }),
    db.consumptionReview.findFirst({ where: { consumption: { dealerId }, deletedAt: null }, select: { id: true } }),
    feedbackDaily,
    sameTimeCounts,
    consumptionDaily,
    consumptionsYesterdaySameTime,
    medianResponse,
    waitingCounts,
    waitingItems,
    weakQr,
    db.remedyOffer.groupBy({
      by: ['status'],
      where: { dealerId, status: { in: ['awaiting_dealer_approval', 'pending'] } },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
    db.incident.groupBy({
      by: ['severity'],
      where: { dealerId, status: { in: [...OPEN_INCIDENT] } },
      _count: { _all: true },
    }),
    db.actionItem.findMany({
      where: { dealerId, status: { in: [...OPEN_TODO] } },
      select: {
        id: true,
        suggestionText: true,
        priority: true,
        status: true,
        dueAt: true,
        feedbackId: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 6,
    }),
    db.actionItem.count({ where: { dealerId, status: { in: [...OPEN_TODO] } } }),
    db.actionItem.count({ where: { dealerId, status: { in: [...OPEN_TODO] }, dueAt: { lt: now } } }),
    db.feedback.findMany({
      where: {
        qrCode: { dealerId },
        deletedAt: null,
        createdAt: { gte: w.d14Start },
        actionSuggestions: { not: Prisma.AnyNull },
      },
      select: { id: true, rating: true, createdAt: true, actionSuggestions: true },
      orderBy: [{ rating: 'asc' }, { createdAt: 'desc' }],
      take: 15,
    }),
  ]);

  if (!user) throw new DealerTodayNotFoundError();

  // Öneri takibi: aynı geri bildirimden zaten aksiyona dönüşmüş (açık/bitmiş/yoksayılmış) metinler.
  const suggestionFeedbackIds = suggestionRows.map((r) => r.id);
  const trackedRows = suggestionFeedbackIds.length
    ? await db.actionItem.findMany({
        where: { dealerId, feedbackId: { in: suggestionFeedbackIds } },
        select: { suggestionText: true },
        take: 200,
      })
    : [];
  const tracked = new Set<string>([
    ...trackedRows.map((r) => normalizeText(r.suggestionText)),
    ...todoRows.map((r) => normalizeText(r.suggestionText)),
  ]);

  // ── Günlük kovalar → 7 gün / önceki 7 gün ──
  const days7 = new Set(w.days7);
  const fbRows = fbDaily.map((r) => ({
    src: r.src,
    day: r.day,
    n: toInt(r.n),
    sum: toInt(r.sum),
    neg: toInt(r.neg),
    neu: toInt(r.neu),
    pos: toInt(r.pos),
    replied: toInt(r.replied),
  }));
  const cur7 = { n: 0, sum: 0, replied: 0 };
  const prev7 = { n: 0, sum: 0, replied: 0 };
  const distribution = { positive: 0, neutral: 0, negative: 0, n: 0 };
  const sources7d: Record<FeedbackSource, number> = { qr: 0, consumption: 0 };
  for (const r of fbRows) {
    const bucket = days7.has(r.day) ? cur7 : prev7;
    bucket.n += r.n;
    bucket.sum += r.sum;
    bucket.replied += r.replied;
    if (days7.has(r.day)) {
      distribution.positive += r.pos;
      distribution.neutral += r.neu;
      distribution.negative += r.neg;
      distribution.n += r.n;
      sources7d[r.src] += r.n;
    }
  }
  const daily = fillDaily(
    w.days7,
    fbRows.filter((r) => days7.has(r.day)).map<DailyRow>((r) => ({ day: r.day, n: r.n, sum: r.sum })),
    csDaily.map((r) => ({ day: r.day, n: toInt(r.n) }))
  );
  const feedbackToday = toInt(sameTime[0]?.today);
  const consumptionsToday = daily[daily.length - 1]?.consumptions ?? 0;
  const generatedAt = now.toISOString();

  const metrics = buildMetrics({
    feedbackToday,
    feedbackYesterdaySameTime: toInt(sameTime[0]?.ysame),
    consumptionsToday,
    consumptionsYesterdaySameTime: csYesterday,
    cur7,
    prev7,
    medianFirstResponseSec: toNum(median[0]?.median) == null ? null : Math.round(toNum(median[0]?.median)!),
    daily,
    asOf: generatedAt,
  });

  // ── Bekleyenler ──
  const wc = wCounts[0];
  const waiting = {
    total: toInt(wc?.total),
    negative: toInt(wc?.neg),
    overdueNegative: toInt(wc?.overdue),
    items: wItems.map<WaitingItem>((r) => ({
      id: r.id,
      source: r.src,
      rating: r.rating,
      excerpt: excerpt(r.text),
      createdAt: new Date(r.createdAt).toISOString(),
      place: r.place,
      href: feedbackHref(r.src, r.id),
    })),
  };

  const remedyAwaiting = remedyGroups.find((g) => g.status === 'awaiting_dealer_approval');
  const remedyPending = remedyGroups.find((g) => g.status === 'pending');
  const incidentOpen = incidentGroups.reduce((s, g) => s + g._count._all, 0);
  const incidentMax = maxSeverity(incidentGroups.map((g) => g.severity));
  const weakRow = weak[0];

  const nextActions = buildNextActions({
    remedyAwaiting: remedyAwaiting?._count._all ?? 0,
    remedyOldestAwaitingHours: hoursBetween(remedyAwaiting?._min.createdAt ?? null, now),
    unansweredNegative: waiting.negative,
    unansweredNegativeOldestHours: hoursBetween(wc?.oldest_neg ?? null, now),
    unansweredRecent: toInt(wc?.recent),
    openIncidents: incidentOpen,
    incidentMaxSeverity: incidentMax,
    overdueTodos: todoOverdue,
    avgRating7d: weightedAvg(cur7.sum, cur7.n),
    avgRatingPrev7d: weightedAvg(prev7.sum, prev7.n),
    n7d: cur7.n,
    nPrev7d: prev7.n,
    weakQr: weakRow ? { name: weakRow.name, avg: Math.round(weakRow.avg * 10) / 10, n: toInt(weakRow.n) } : null,
    hasQr: qrTotal > 0,
    feedback7d: cur7.n,
  });

  const todos = {
    open: todoRows.map<TodoItem>((r) => ({
      id: r.id,
      text: r.suggestionText,
      priority: toPriority(r.priority),
      status: (OPEN_TODO as readonly string[]).includes(r.status) ? (r.status as TodoItem['status']) : 'pending',
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      overdue: !!r.dueAt && r.dueAt.getTime() < now.getTime(),
      assigneeName: r.assignedTo?.name ?? null,
      feedbackId: r.feedbackId,
      createdAt: r.createdAt.toISOString(),
    })),
    openTotal: todoOpenTotal,
    suggestions: pickSuggestions(suggestionRows, tracked),
  };

  const setup = buildSetup({
    businessName: user.businessName,
    businessDesc: user.businessDesc,
    hasUserLocation: !!(user.address && user.address.trim()) || (user.latitude != null && user.longitude != null),
    activeLocations,
    hasQr: qrTotal > 0,
    hasFeedback: !!anyFeedback || !!anyReview,
    hasProduct: productActive > 0,
  });

  return {
    generatedAt,
    today: w.today,
    greeting: greetingFor(now),
    dealer: { name: user.businessName?.trim() || user.name?.trim() || null },
    setup,
    metrics,
    nextActions,
    waiting,
    ops: {
      openTodos: todoOpenTotal,
      overdueTodos: todoOverdue,
      remedy: {
        awaitingApproval: remedyAwaiting?._count._all ?? 0,
        pendingCustomer: remedyPending?._count._all ?? 0,
        oldestAwaitingAt: remedyAwaiting?._min.createdAt ? remedyAwaiting._min.createdAt.toISOString() : null,
      },
      incidents: { open: incidentOpen, maxSeverity: incidentMax },
      catalog: { activeQr: qrActive, activeProducts: productActive, locations: activeLocations },
      daily,
      distribution,
      sources7d,
    },
    todos,
    latestCompletedWeek: latestCompletedWeek(now),
  };
}
