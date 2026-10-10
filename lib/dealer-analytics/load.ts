/**
 * Bayi Analitik — sunucu yükleyicileri (SSR sayfası ve BFF aynı fonksiyonu kullanır).
 *
 * Rapor bulgularının "veri" tarafı:
 *  - B-3 / heatmap Bulgu 1-2: tüm kovalar SQL'de `AT TIME ZONE 'Europe/Istanbul'` ile (Prisma
 *    `timestamp(3)` sütunları UTC tutar → önce UTC olarak yorumlanır, sonra İstanbul'a çevrilir).
 *    Gün `ISODOW` (1 = Pazartesi) → Pazartesi başlangıçlı satır, sayısal etiket kayması yok.
 *  - B-5: 20k satırlık bellek içi dizi YOK; her kırılım `GROUP BY` ile DB'de. Yanıt süresi veri
 *    hacminden bağımsız, "güncel dönem düşer" yanlılığı yok.
 *  - B-11: bağımsız sorgular tek `Promise.all` dalgasında; kullanılmayan alan dönülmez.
 *  - heatmap Bulgu 3/12/13: ızgara `HeatmapData` (UTC, geri bildirim + tüketim karışık, zaman
 *    penceresiz) yerine olay tablolarından dönemle hesaplanır; metrik (geri bildirim / ziyaret /
 *    ciro / puan) ayrı. Silinen geri bildirim sayılmaz.
 *  - B-1: tarama = tekilleştirilmiş `qr_scanned` olayı (AnalyticsEvent, aynı pencere).
 *
 * Kiracı kapsamı: her sorgu `dealerId` ile (çağıran `resolveDealerScope` ile çözer).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import {
  aggFromRow,
  avgRatingOf,
  buildHeatRows,
  buildKpis,
  buildLocationRows,
  buildQrRows,
  buildTopicRows,
  computePeaks,
  detectAnomalies,
  fillSeries,
  heatInsights,
  pickBestQr,
  round,
  toNum,
  type DayRowRaw,
  type DowHourRaw,
  type HeatFeedbackRaw,
  type HeatVisitRaw,
  type QrAggRaw,
  type QrMeta,
} from './core';
import { effectiveChannel, queryCacheKey, toInstants, type Instants } from './params';
import type { RawTopicCount } from './topics';
import {
  ANALYTICS_TZ,
  type ActivityHeatmap,
  type AnalyticsChannel,
  type AnalyticsOverview,
  type AnalyticsQuery,
  type HeatmapMetric,
  type HeatmapQuery,
  type LocationOption,
} from './types';

export const ANALYTICS_CACHE_TTL_SECONDS = 60;
const CACHE_VERSION = 'v2';

/* ───────────────────────── SQL yapı taşları ───────────────────────── */

/** `timestamp(3)` (UTC) → İstanbul yerel zamanı. */
function local(col: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')`;
}

const EV_AT = Prisma.sql`ev."at"`;
const LOCAL_AT = local(EV_AT);

/**
 * Tek duygu tanımı (Gelen Kutusu `unifiedSentiment` ile aynı): AI duygusu; metinli ve henüz
 * analiz edilmemişse "pending"; aksi hâlde puan eşiği (≤2 olumsuz, ≥4 olumlu).
 */
function sentimentCase(sentiment: Prisma.Sql, text: Prisma.Sql, analyzedAt: Prisma.Sql, rating: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE
      WHEN lower(${sentiment}) IN ('positive', 'neutral', 'negative') THEN lower(${sentiment})
      WHEN ${text} IS NOT NULL AND btrim(${text}) <> '' AND ${analyzedAt} IS NULL THEN 'pending'
      WHEN ${rating} <= 2 THEN 'negative'
      WHEN ${rating} >= 4 THEN 'positive'
      ELSE 'neutral'
    END`;
}

function locationCond(location: string | null): Prisma.Sql {
  if (!location) return Prisma.empty;
  if (location === 'none') return Prisma.sql` AND q."locationId" IS NULL`;
  return Prisma.sql` AND q."locationId" = ${location}`;
}

/** QR geri bildirimi olay kaynağı (silinenler hariç). */
function feedbackSource(dealerId: string, w: Instants, location: string | null): Prisma.Sql {
  return Prisma.sql`
    SELECT f."createdAt" AS "at", f."rating" AS rating,
           ${sentimentCase(Prisma.sql`f."sentiment"`, Prisma.sql`f."text"`, Prisma.sql`f."aiProcessedAt"`, Prisma.sql`f."rating"`)} AS s,
           f."dealerRepliedAt" AS replied_at, 'qr'::text AS ch, f."qrCodeId" AS qr_id,
           f."npsScore" AS nps, f."topics" AS topics
      FROM "Feedback" f
      JOIN "QRCode" q ON q."id" = f."qrCodeId"
     WHERE q."dealerId" = ${dealerId}
       AND f."deletedAt" IS NULL
       AND f."createdAt" >= ${w.from} AND f."createdAt" < ${w.to}${locationCond(location)}`;
}

/** Tüketim (ziyaret) yorumu olay kaynağı (silinenler hariç). */
function reviewSource(dealerId: string, w: Instants): Prisma.Sql {
  return Prisma.sql`
    SELECT r."createdAt" AS "at", r."rating" AS rating,
           ${sentimentCase(Prisma.sql`r."sentiment"`, Prisma.sql`r."text"`, Prisma.sql`r."analyzedAt"`, Prisma.sql`r."rating"`)} AS s,
           r."dealerRepliedAt" AS replied_at, 'consumption'::text AS ch, NULL::text AS qr_id,
           NULL::int AS nps, NULL::jsonb AS topics
      FROM "ConsumptionReview" r
      JOIN "Consumption" c ON c."id" = r."consumptionId"
     WHERE c."dealerId" = ${dealerId}
       AND r."deletedAt" IS NULL
       AND r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to}`;
}

function eventsSql(dealerId: string, w: Instants, channel: AnalyticsChannel, location: string | null): Prisma.Sql {
  if (channel === 'qr') return feedbackSource(dealerId, w, location);
  if (channel === 'consumption') return reviewSource(dealerId, w);
  return Prisma.sql`${feedbackSource(dealerId, w, location)} UNION ALL ${reviewSource(dealerId, w)}`;
}

const SENTIMENT_COUNTS = Prisma.sql`
  COUNT(*) FILTER (WHERE ev.s = 'positive')::bigint AS positive,
  COUNT(*) FILTER (WHERE ev.s = 'neutral')::bigint AS neutral,
  COUNT(*) FILTER (WHERE ev.s = 'negative')::bigint AS negative,
  COUNT(*) FILTER (WHERE ev.s = 'pending')::bigint AS pending`;

async function windowAgg(dealerId: string, w: Instants, channel: AnalyticsChannel, location: string | null) {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    WITH ev AS (${eventsSql(dealerId, w, channel, location)})
    SELECT COUNT(*)::bigint AS n,
           COALESCE(SUM(ev.rating), 0)::bigint AS rating_sum,
           ${SENTIMENT_COUNTS},
           COUNT(*) FILTER (WHERE ev.replied_at IS NOT NULL)::bigint AS replied,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ev.replied_at - ev."at"))::float8)
             FILTER (WHERE ev.replied_at IS NOT NULL AND ev.replied_at >= ev."at") AS reply_median_sec,
           COUNT(ev.nps)::bigint AS nps_n,
           COUNT(*) FILTER (WHERE ev.nps >= 9)::bigint AS promoters,
           COUNT(*) FILTER (WHERE ev.nps <= 6)::bigint AS detractors,
           COUNT(*) FILTER (WHERE ev.rating = 1)::bigint AS r1,
           COUNT(*) FILTER (WHERE ev.rating = 2)::bigint AS r2,
           COUNT(*) FILTER (WHERE ev.rating = 3)::bigint AS r3,
           COUNT(*) FILTER (WHERE ev.rating = 4)::bigint AS r4,
           COUNT(*) FILTER (WHERE ev.rating = 5)::bigint AS r5,
           COUNT(*) FILTER (WHERE ev.ch = 'qr')::bigint AS qr_n,
           COUNT(*) FILTER (WHERE CASE WHEN jsonb_typeof(ev.topics) = 'array' THEN jsonb_array_length(ev.topics) > 0 ELSE false END)::bigint AS topics_base
      FROM ev`);
  return rows[0] ?? null;
}

async function dailyRows(dealerId: string, w: Instants, channel: AnalyticsChannel, location: string | null): Promise<DayRowRaw[]> {
  return prisma.$queryRaw<DayRowRaw[]>(Prisma.sql`
    WITH ev AS (${eventsSql(dealerId, w, channel, location)})
    SELECT to_char(${LOCAL_AT}, 'YYYY-MM-DD') AS day,
           COUNT(*)::bigint AS n,
           COALESCE(SUM(ev.rating), 0)::bigint AS rating_sum,
           ${SENTIMENT_COUNTS}
      FROM ev
     GROUP BY 1`);
}

async function dailyCounts(dealerId: string, w: Instants, channel: AnalyticsChannel, location: string | null) {
  return prisma.$queryRaw<Array<{ day: string; n: unknown }>>(Prisma.sql`
    WITH ev AS (${eventsSql(dealerId, w, channel, location)})
    SELECT to_char(${LOCAL_AT}, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS n
      FROM ev
     GROUP BY 1`);
}

async function dowHourFeedback(dealerId: string, w: Instants, channel: AnalyticsChannel, location: string | null): Promise<HeatFeedbackRaw[]> {
  return prisma.$queryRaw<HeatFeedbackRaw[]>(Prisma.sql`
    WITH ev AS (${eventsSql(dealerId, w, channel, location)})
    SELECT EXTRACT(ISODOW FROM ${LOCAL_AT})::int AS dow,
           EXTRACT(HOUR FROM ${LOCAL_AT})::int AS hour,
           COUNT(*)::bigint AS n,
           COALESCE(SUM(ev.rating), 0)::bigint AS rating_sum,
           COUNT(*) FILTER (WHERE ev.s = 'negative')::bigint AS negative
      FROM ev
     GROUP BY 1, 2`);
}

/** Geçerli tutar (NaN/∞/≤0/absürt hariç; Postgres'te NaN en büyük değerdir → `< 1e6` eler). */
const VALID_AMOUNT = Prisma.sql`c."amount" > 0 AND c."amount" < 1000000`;

async function dowHourVisits(dealerId: string, w: Instants): Promise<HeatVisitRaw[]> {
  const at = local(Prisma.sql`c."createdAt"`);
  return prisma.$queryRaw<HeatVisitRaw[]>(Prisma.sql`
    SELECT EXTRACT(ISODOW FROM ${at})::int AS dow,
           EXTRACT(HOUR FROM ${at})::int AS hour,
           COUNT(*)::bigint AS n,
           COALESCE(SUM(c."amount") FILTER (WHERE ${VALID_AMOUNT}), 0)::float8 AS revenue
      FROM "Consumption" c
     WHERE c."dealerId" = ${dealerId}
       AND c."createdAt" >= ${w.from} AND c."createdAt" < ${w.to}
     GROUP BY 1, 2`);
}

async function topicCounts(dealerId: string, w: Instants, location: string | null): Promise<RawTopicCount[]> {
  const rows = await prisma.$queryRaw<Array<{ topic: string; n: unknown; positive: unknown; negative: unknown }>>(Prisma.sql`
    WITH ev AS (${feedbackSource(dealerId, w, location)})
    SELECT t.topic AS topic,
           COUNT(*)::bigint AS n,
           COUNT(*) FILTER (WHERE ev.s = 'positive')::bigint AS positive,
           COUNT(*) FILTER (WHERE ev.s = 'negative')::bigint AS negative
      FROM ev
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(ev.topics) = 'array' THEN ev.topics ELSE '[]'::jsonb END
      ) AS t(topic)
     GROUP BY 1
     ORDER BY 2 DESC
     LIMIT 200`);
  return rows.map((r) => ({ topic: String(r.topic), count: toNum(r.n), positive: toNum(r.positive), negative: toNum(r.negative) }));
}

async function qrAgg(dealerId: string, w: Instants, location: string | null): Promise<QrAggRaw[]> {
  return prisma.$queryRaw<QrAggRaw[]>(Prisma.sql`
    WITH ev AS (${feedbackSource(dealerId, w, location)})
    SELECT ev.qr_id AS qr_id,
           COUNT(*)::bigint AS n,
           COALESCE(SUM(ev.rating), 0)::bigint AS rating_sum,
           ${SENTIMENT_COUNTS}
      FROM ev
     GROUP BY 1`);
}

async function qrCounts(dealerId: string, w: Instants, location: string | null) {
  return prisma.$queryRaw<Array<{ qr_id: string; n: unknown }>>(Prisma.sql`
    WITH ev AS (${feedbackSource(dealerId, w, location)})
    SELECT ev.qr_id AS qr_id, COUNT(*)::bigint AS n FROM ev GROUP BY 1`);
}

/** Dönem içi tekilleştirilmiş QR tarama olayları (QR başına). */
async function scanCounts(dealerId: string, w: Instants): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ qr_id: string | null; n: unknown }>>(Prisma.sql`
    SELECT e."data"->>'qrCodeId' AS qr_id, COUNT(*)::bigint AS n
      FROM "AnalyticsEvent" e
     WHERE e."event" = 'qr_scanned'
       AND e."createdAt" >= ${w.from} AND e."createdAt" < ${w.to}
       AND e."data"->>'dealerId' = ${dealerId}
     GROUP BY 1`);
  const out = new Map<string, number>();
  for (const r of rows) if (r.qr_id) out.set(r.qr_id, toNum(r.n));
  return out;
}

function sumScans(map: Map<string, number>, allowed: Set<string> | null): number {
  let total = 0;
  for (const [id, n] of map) if (!allowed || allowed.has(id)) total += n;
  return total;
}

async function loadQrMeta(dealerId: string, location: string | null): Promise<QrMeta[]> {
  const rows = await prisma.qRCode.findMany({
    where: {
      dealerId,
      ...(location === 'none' ? { locationId: null } : location ? { locationId: location } : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      locationId: true,
      isActive: true,
      archivedAt: true,
      revokedAt: true,
      location: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  return rows.map((q) => ({
    id: q.id,
    name: q.name,
    code: q.code,
    locationId: q.locationId,
    locationName: q.location?.name ?? null,
    archived: !!q.archivedAt || !!q.revokedAt || !q.isActive,
  }));
}

async function loadLocations(dealerId: string): Promise<LocationOption[]> {
  const rows = await prisma.dealerLocation.findMany({
    where: { dealerId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function hasAnyRecord(dealerId: string): Promise<boolean> {
  const [fb, cr] = await Promise.all([
    prisma.feedback.findFirst({ where: { qrCode: { dealerId }, deletedAt: null }, select: { id: true } }),
    prisma.consumptionReview.findFirst({ where: { consumption: { dealerId }, deletedAt: null }, select: { id: true } }),
  ]);
  return !!fb || !!cr;
}

/** Seçili şube bu bayiye ait değilse süzgeç düşer (başka kiracının şubesi sorgulanamaz). */
function sanitizeLocation(location: string | null, locations: readonly LocationOption[]): string | null {
  if (!location || location === 'none') return location;
  return locations.some((l) => l.id === location) ? location : null;
}

/* ───────────────────────── Önbellek ───────────────────────── */

async function withCache<T>(key: string, fresh: boolean, load: () => Promise<T>): Promise<T> {
  if (!fresh) {
    const hit = await redisGetJson<T>(key);
    if (hit) return hit;
  }
  const value = await load();
  await redisSetJson(key, value, ANALYTICS_CACHE_TTL_SECONDS);
  return value;
}

/* ───────────────────────── Genel bakış ───────────────────────── */

async function computeOverview(dealerId: string, query: AnalyticsQuery): Promise<AnalyticsOverview> {
  const locations = await loadLocations(dealerId);
  const location = sanitizeLocation(query.location, locations);
  const q: AnalyticsQuery = { ...query, location };
  const channel = effectiveChannel(q);
  const cur = toInstants(q.range);
  const cmp = q.compareRange ? toInstants(q.compareRange) : null;
  const wantsQr = channel !== 'consumption';

  const [curRow, cmpRow, days, cmpDays, dowHour, topics, cmpTopics, qrCur, qrCmp, meta, scansCur, scansCmp] = await Promise.all([
    windowAgg(dealerId, cur, channel, location),
    cmp ? windowAgg(dealerId, cmp, channel, location) : Promise.resolve(null),
    dailyRows(dealerId, cur, channel, location),
    cmp ? dailyCounts(dealerId, cmp, channel, location) : Promise.resolve(null),
    dowHourFeedback(dealerId, cur, channel, location),
    wantsQr ? topicCounts(dealerId, cur, location) : Promise.resolve([] as RawTopicCount[]),
    wantsQr && cmp ? topicCounts(dealerId, cmp, location) : Promise.resolve(null),
    wantsQr ? qrAgg(dealerId, cur, location) : Promise.resolve([] as QrAggRaw[]),
    wantsQr && cmp ? qrCounts(dealerId, cmp, location) : Promise.resolve(null),
    wantsQr ? loadQrMeta(dealerId, location) : Promise.resolve([] as QrMeta[]),
    wantsQr ? scanCounts(dealerId, cur) : Promise.resolve(null),
    wantsQr && cmp ? scanCounts(dealerId, cmp) : Promise.resolve(null),
  ]);

  const curAgg = aggFromRow(curRow);
  const cmpAgg = cmpRow ? aggFromRow(cmpRow) : null;
  const series = fillSeries(q.range, q.compareRange, days, cmpDays);
  const allowedQr = location ? new Set(meta.map((m) => m.id)) : null;
  const scans = {
    current: scansCur ? sumScans(scansCur, allowedQr) : null,
    compare: scansCmp ? sumScans(scansCmp, allowedQr) : null,
  };
  const { kpis, conversionStatus } = buildKpis({ cur: curAgg, cmp: cmpAgg, series, scans, channel });
  const prior = avgRatingOf(curAgg);
  const qr = wantsQr ? buildQrRows({ meta, cur: qrCur, cmp: qrCmp, scans: scansCur, prior }) : [];

  return {
    generatedAt: new Date().toISOString(),
    tz: ANALYTICS_TZ,
    query: q,
    filters: { channel: q.channel, location, effectiveChannel: channel, locations },
    kpis,
    conversionStatus,
    series,
    sentiment: {
      positive: curAgg.positive,
      neutral: curAgg.neutral,
      negative: curAgg.negative,
      pending: curAgg.pending,
      total: curAgg.n,
    },
    ratings: [
      { star: 5, count: curAgg.r5 },
      { star: 4, count: curAgg.r4 },
      { star: 3, count: curAgg.r3 },
      { star: 2, count: curAgg.r2 },
      { star: 1, count: curAgg.r1 },
    ],
    topics: buildTopicRows(topics, cmpTopics),
    topicsBase: toNum(curRow?.topics_base),
    qr,
    bestQr: pickBestQr(qr),
    peaks: computePeaks(dowHour as DowHourRaw[]),
    anomalies: detectAnomalies(series),
    hasAnyData: curAgg.n > 0 || (cmpAgg?.n ?? 0) > 0 ? true : await hasAnyRecord(dealerId),
  };
}

export async function loadAnalyticsOverview(dealerId: string, query: AnalyticsQuery, opts: { fresh?: boolean } = {}): Promise<AnalyticsOverview> {
  const key = `dealer-analytics:${CACHE_VERSION}:overview:${dealerId}:${queryCacheKey(query)}`;
  return withCache(key, !!opts.fresh, () => computeOverview(dealerId, query));
}

/* ───────────────────────── Yoğunluk (ısı haritası) ───────────────────────── */

async function computeHeatmap(dealerId: string, query: HeatmapQuery): Promise<ActivityHeatmap> {
  const locations = await loadLocations(dealerId);
  const location = sanitizeLocation(query.location, locations);
  const channel: AnalyticsChannel = location ? 'qr' : 'all';
  const cur = toInstants(query.range);
  const cmp = query.compareRange ? toInstants(query.compareRange) : null;
  const visitsAvailable = !location;

  const [fbGrid, visitGrid, cmpFbGrid, cmpVisitGrid, agg, meta] = await Promise.all([
    dowHourFeedback(dealerId, cur, channel, location),
    visitsAvailable ? dowHourVisits(dealerId, cur) : Promise.resolve(null),
    cmp ? dowHourFeedback(dealerId, cmp, channel, location) : Promise.resolve(null),
    cmp && visitsAvailable ? dowHourVisits(dealerId, cmp) : Promise.resolve(null),
    qrAgg(dealerId, cur, location),
    loadQrMeta(dealerId, location),
  ]);

  const rows = buildHeatRows({ feedback: fbGrid, visits: visitGrid, compareFeedback: cmpFbGrid, compareVisits: cmpVisitGrid });

  let feedback = 0;
  let ratingSum = 0;
  for (const r of fbGrid) {
    feedback += toNum(r.n);
    ratingSum += toNum(r.rating_sum);
  }
  const sumOf = (list: readonly { n: unknown; revenue?: unknown }[] | null, field: 'n' | 'revenue') =>
    list ? list.reduce((s, r) => s + toNum(field === 'n' ? r.n : r.revenue), 0) : null;
  const visits = sumOf(visitGrid, 'n') ?? 0;
  const revenue = round(sumOf(visitGrid, 'revenue') ?? 0, 2);
  const compareRevenue = cmpVisitGrid ? round(sumOf(cmpVisitGrid, 'revenue') ?? 0, 2) : null;
  const revenueAvailable = visitsAvailable && (revenue > 0 || (compareRevenue ?? 0) > 0);

  // İstenen metrik bu süzgeçte yoksa (ör. şube seçiliyken ziyaret) geri bildirime düşer.
  let metric: HeatmapMetric = query.metric;
  if ((metric === 'visits' && !visitsAvailable) || (metric === 'revenue' && !revenueAvailable)) metric = 'feedback';

  const overallAvg = feedback > 0 ? round(ratingSum / feedback, 2) : null;
  const locationRows = buildLocationRows({ meta, agg, prior: overallAvg });

  return {
    generatedAt: new Date().toISOString(),
    tz: ANALYTICS_TZ,
    query: { ...query, location, metric },
    filters: { channel: 'all', location, effectiveChannel: channel, locations, metric },
    availability: { visits: visitsAvailable, revenue: revenueAvailable },
    rows,
    totals: {
      feedback,
      visits,
      revenue,
      compareFeedback: cmpFbGrid ? sumOf(cmpFbGrid, 'n') : null,
      compareVisits: cmpVisitGrid ? sumOf(cmpVisitGrid, 'n') : null,
      compareRevenue,
      avgRating: overallAvg,
    },
    insights: heatInsights({ rows, metric, overallAvg, locations: locationRows }),
    locations: locationRows,
  };
}

export async function loadActivityHeatmap(dealerId: string, query: HeatmapQuery, opts: { fresh?: boolean } = {}): Promise<ActivityHeatmap> {
  const key = `dealer-analytics:${CACHE_VERSION}:heatmap:${dealerId}:${queryCacheKey(query)}`;
  return withCache(key, !!opts.fresh, () => computeHeatmap(dealerId, query));
}
