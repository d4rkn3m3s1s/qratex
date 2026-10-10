/**
 * Bayi Kıyas — TEK sunucu yükleyicisi (SSR sayfası ve `GET /api/dealer/analytics/benchmark`).
 *
 * İki katman (denetim B6):
 *  1. Platform anlık görüntüsü — bayiden BAĞIMSIZ; tek `Promise.all` turunda 8 GROUP BY sorgusu,
 *     tek Redis anahtarında 10 dk paylaşılır (eskiden her bayi için 43 sorgu + 25k satır belleğe).
 *  2. Bayiye özel parçalar — profil (taze; kategori değişikliği anında görünür) ve şube ligi
 *     (2 dk önbellek).
 *
 * Kovalar SQL'de İstanbul saatiyle (`AT TIME ZONE`, §4.4/10). İki kaynak birleşik: QR geri
 * bildirimi + tüketim yorumu (Gelen Kutusu ile aynı tanım). Olumsuz = AI duygusu `negative`, AI
 * duygusu yoksa puan ≤ 2. Hata FIRLATILIR: "üst %50" gibi yedek değer uydurulmaz (B5).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { compareRangeFor, istanbulDay, resolvePreset, dayRangeToInstants, type DayRange } from '@/components/ds/page/date-range';
import { categorizeDealer, categoryFromBusinessCategory } from '@/lib/places/categories';
import { cityFromAddress } from './city';
import {
  bucketFor,
  buildRails,
  buildRank,
  buildRecommendations,
  buildSeries,
  buildTopicGaps,
  contributorsOf,
  minFeedbackFor,
  normalizeTopic,
  resolveGroup,
  segmentInfos,
  segmentMembers,
  type BucketTuple,
  type DealerAgg,
  type PlatformSnapshot,
  type RosterEntry,
  type SegmentContext,
  type TopicTuple,
} from './core';
import { BENCHMARK_TZ, type BenchmarkData, type BenchmarkProfile, type BenchmarkQuery, type LocationRow } from './types';

type Db = typeof prisma;

export const SNAPSHOT_TTL_SECONDS = 600;
export const LOCATIONS_TTL_SECONDS = 120;
export const snapshotCacheKey = (range: DayRange) => `dealer-bench:v1:snap:${range.from}:${range.to}`;
export const locationsCacheKey = (dealerId: string, range: DayRange) => `dealer-bench:v1:loc:${dealerId}:${range.from}:${range.to}`;

export class BenchmarkDealerNotFoundError extends Error {
  constructor() {
    super('İşletme bulunamadı');
    this.name = 'BenchmarkDealerNotFoundError';
  }
}

const toInt = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0) || 0);
const toNumOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
};

const NEGATIVE = Prisma.sql`(sentiment = 'negative' OR (sentiment IS NULL AND rating <= 2))`;
const LOCAL_TS = (col: string) => Prisma.sql`((${Prisma.raw(col)} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')`;

/** QR geri bildirimi + tüketim yorumu, tek satır şeması (bayi kimliği QR/tüketim üzerinden). */
function unifiedFeedback(from: Date, to: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT q."dealerId" AS dealer_id, f.rating AS rating, f.sentiment AS sentiment,
           f."createdAt" AS created_at, f."dealerRepliedAt" AS replied_at
      FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId"
     WHERE f."deletedAt" IS NULL AND f."createdAt" >= ${from} AND f."createdAt" < ${to}
    UNION ALL
    SELECT c."dealerId" AS dealer_id, r.rating AS rating, r.sentiment AS sentiment,
           r."createdAt" AS created_at, r."dealerRepliedAt" AS replied_at
      FROM "ConsumptionReview" r JOIN "Consumption" c ON c.id = r."consumptionId"
     WHERE r."deletedAt" IS NULL AND r."createdAt" >= ${from} AND r."createdAt" < ${to}`;
}

type TotalsRow = {
  dealer_id: string;
  n: number | bigint;
  rating_sum: number | null;
  replied: number | bigint;
  negative: number | bigint;
  reply_median_sec: number | null;
};
type ActionsRow = { dealer_id: string; closed: number | bigint; relevant: number | bigint };
type BucketRow = {
  dealer_id: string;
  bucket: string;
  n: number | bigint;
  rating_sum: number | null;
  replied: number | bigint;
  negative: number | bigint;
};
type TopicRow = { dealer_id: string; topic: string; mentions: number | bigint };
type TopicBaseRow = { dealer_id: string; n: number | bigint };
type RosterRow = {
  id: string;
  business_category: string | null;
  is_demo: boolean;
  address: string | null;
  product_categories: string[] | null;
};

function totalsQuery(db: Db, from: Date, to: Date) {
  return db.$queryRaw<TotalsRow[]>`
    WITH fb AS (${unifiedFeedback(from, to)})
    SELECT dealer_id,
           COUNT(*)::int AS n,
           COALESCE(SUM(rating), 0)::float AS rating_sum,
           COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied,
           COUNT(*) FILTER (WHERE ${NEGATIVE})::int AS negative,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (replied_at - created_at)))
             FILTER (WHERE replied_at IS NOT NULL AND replied_at >= created_at) AS reply_median_sec
      FROM fb
     GROUP BY dealer_id`;
}

/**
 * Aksiyon kapanış oranı paydası: dönem sonundan önce açılmış, dönem başından önce kapanmamış ve
 * İPTAL EDİLMEMİŞ aksiyonlar; pay: dönem içinde tamamlananlar (`completedAt`, eski kayıtta
 * `updatedAt`). Denetim B10 / ROI Bulgu 2.
 */
function actionsQuery(db: Db, from: Date, to: Date) {
  return db.$queryRaw<ActionsRow[]>`
    SELECT a."dealerId" AS dealer_id,
           COUNT(*) FILTER (
             WHERE a.status = 'done'
               AND COALESCE(a."completedAt", a."updatedAt") >= ${from}
               AND COALESCE(a."completedAt", a."updatedAt") < ${to}
           )::int AS closed,
           COUNT(*)::int AS relevant
      FROM "ActionItem" a
     WHERE a.status <> 'cancelled'
       AND a."createdAt" < ${to}
       AND NOT (a.status = 'done' AND COALESCE(a."completedAt", a."updatedAt") < ${from})
     GROUP BY a."dealerId"`;
}

function bucketsQuery(db: Db, from: Date, to: Date, unit: 'day' | 'week') {
  return db.$queryRaw<BucketRow[]>`
    WITH fb AS (${unifiedFeedback(from, to)})
    SELECT dealer_id,
           to_char(date_trunc(${unit}, ${LOCAL_TS('created_at')}), 'YYYY-MM-DD') AS bucket,
           COUNT(*)::int AS n,
           COALESCE(SUM(rating), 0)::float AS rating_sum,
           COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied,
           COUNT(*) FILTER (WHERE ${NEGATIVE})::int AS negative
      FROM fb
     GROUP BY 1, 2`;
}

/** Olumsuz QR yorumlarında AI konularının anılma sayısı (yalnız konu dizisi olanlar). */
function topicsQuery(db: Db, from: Date, to: Date) {
  return db.$queryRaw<TopicRow[]>`
    SELECT q."dealerId" AS dealer_id, t.topic AS topic, COUNT(*)::int AS mentions
      FROM "Feedback" f
      JOIN "QRCode" q ON q.id = f."qrCodeId"
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(f.topics) = 'array' THEN f.topics ELSE '[]'::jsonb END
      ) AS t(topic)
     WHERE f."deletedAt" IS NULL AND f."createdAt" >= ${from} AND f."createdAt" < ${to}
       AND jsonb_typeof(f.topics) = 'array'
       AND (f.sentiment = 'negative' OR (f.sentiment IS NULL AND f.rating <= 2))
     GROUP BY 1, 2`;
}

function topicBaseQuery(db: Db, from: Date, to: Date) {
  return db.$queryRaw<TopicBaseRow[]>`
    SELECT q."dealerId" AS dealer_id, COUNT(*)::int AS n
      FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId"
     WHERE f."deletedAt" IS NULL AND f."createdAt" >= ${from} AND f."createdAt" < ${to}
       AND jsonb_typeof(f.topics) = 'array'
       AND (f.sentiment = 'negative' OR (f.sentiment IS NULL AND f.rating <= 2))
     GROUP BY 1`;
}

/** Aktif bayi listesi (gölge yasaklılar kıyasa girmez). Şehir için profil adresi, yoksa ilk şube adresi. */
function rosterQuery(db: Db) {
  return db.$queryRaw<RosterRow[]>`
    SELECT u.id AS id,
           u."businessCategory" AS business_category,
           u."isDemo" AS is_demo,
           COALESCE(
             NULLIF(btrim(u.address), ''),
             (SELECT l.address FROM "DealerLocation" l
               WHERE l."dealerId" = u.id AND l."isActive" = true AND l.address IS NOT NULL
               ORDER BY l."createdAt" ASC LIMIT 1)
           ) AS address,
           (SELECT array_agg(pc.name) FROM "ProductCategory" pc
             WHERE pc."dealerId" = u.id AND pc."isActive" = true) AS product_categories
      FROM "User" u
     WHERE u.role = 'DEALER' AND u."fraudStatus" <> 'shadow_ban'`;
}

function toAggMap(totals: TotalsRow[], actions: ActionsRow[]): Record<string, DealerAgg> {
  const map: Record<string, DealerAgg> = {};
  const blank = (): DealerAgg => ({ n: 0, ratingSum: 0, replied: 0, negative: 0, replyMedianSec: null, actClosed: 0, actRelevant: 0 });
  for (const r of totals) {
    map[r.dealer_id] = {
      ...blank(),
      n: toInt(r.n),
      ratingSum: toNumOrNull(r.rating_sum) ?? 0,
      replied: toInt(r.replied),
      negative: toInt(r.negative),
      replyMedianSec: toNumOrNull(r.reply_median_sec),
    };
  }
  for (const a of actions) {
    const cur = map[a.dealer_id] ?? blank();
    cur.actClosed = toInt(a.closed);
    cur.actRelevant = toInt(a.relevant);
    map[a.dealer_id] = cur;
  }
  return map;
}

export function rosterEntry(r: RosterRow): RosterEntry {
  const categories = categorizeDealer({ businessCategory: r.business_category, productCategoryNames: r.product_categories ?? [] });
  return { id: r.id, category: categories[0] ?? null, city: cityFromAddress(r.address), isDemo: r.is_demo === true };
}

/** Platform anlık görüntüsü (bayiden bağımsız; 10 dk paylaşılan önbellek). */
export async function loadPlatformSnapshot(range: DayRange, opts: { fresh?: boolean; db?: Db } = {}): Promise<PlatformSnapshot> {
  const key = snapshotCacheKey(range);
  if (!opts.fresh) {
    const cached = await redisGetJson<PlatformSnapshot>(key);
    if (cached && cached.range?.from === range.from && cached.range?.to === range.to) return cached;
  }
  const db = opts.db ?? prisma;
  const compareRange = compareRangeFor(range, 'previous') as DayRange;
  const cur = dayRangeToInstants(range);
  const prev = dayRangeToInstants(compareRange);
  const from = new Date(cur.from);
  const to = new Date(cur.to);
  const pFrom = new Date(prev.from);
  const pTo = new Date(prev.to);
  const bucket = bucketFor(range);

  const [totals, actions, prevTotals, prevActions, buckets, topics, topicBase, roster] = await Promise.all([
    totalsQuery(db, from, to),
    actionsQuery(db, from, to),
    totalsQuery(db, pFrom, pTo),
    actionsQuery(db, pFrom, pTo),
    bucketsQuery(db, from, to, bucket),
    topicsQuery(db, from, to),
    topicBaseQuery(db, from, to),
    rosterQuery(db),
  ]);

  const current = toAggMap(totals, actions);
  const previous = toAggMap(prevTotals, prevActions);
  const active = new Set([...Object.keys(current), ...Object.keys(previous)]);

  const topicMap = new Map<string, number>();
  for (const t of topics) {
    const k = normalizeTopic(t.topic);
    if (!k) continue;
    const id = `${t.dealer_id}\u0000${k}`;
    topicMap.set(id, (topicMap.get(id) ?? 0) + toInt(t.mentions));
  }
  const topicTuples: TopicTuple[] = [...topicMap.entries()].map(([id, n]) => {
    const [dealerId, topic] = id.split('\u0000');
    return [dealerId, topic, n];
  });

  const snapshot: PlatformSnapshot = {
    range,
    compareRange,
    bucket,
    current,
    previous,
    buckets: buckets.map(
      (b): BucketTuple => [b.dealer_id, b.bucket, toInt(b.n), toNumOrNull(b.rating_sum) ?? 0, toInt(b.replied), toInt(b.negative)],
    ),
    topics: topicTuples,
    topicBase: Object.fromEntries(topicBase.map((r) => [r.dealer_id, toInt(r.n)])),
    roster: roster.filter((r) => active.has(r.id)).map(rosterEntry),
  };
  await redisSetJson(key, snapshot, SNAPSHOT_TTL_SECONDS);
  return snapshot;
}

/** Bayinin profili — TAZE okunur (kategori değişikliği anında yansısın). */
export async function loadBenchmarkProfile(dealerId: string, db: Db = prisma): Promise<BenchmarkProfile & { isDemo: boolean }> {
  const [user, products, location] = await Promise.all([
    db.user.findUnique({ where: { id: dealerId }, select: { businessCategory: true, address: true, isDemo: true, role: true } }),
    db.productCategory.findMany({ where: { dealerId, isActive: true }, select: { name: true } }),
    db.dealerLocation.findFirst({
      where: { dealerId, isActive: true, address: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { address: true },
    }),
  ]);
  if (!user || user.role !== 'DEALER') throw new BenchmarkDealerNotFoundError();
  const fromProfile = categoryFromBusinessCategory(user.businessCategory);
  const fromProducts = fromProfile ? null : categorizeDealer({ productCategoryNames: products.map((p) => p.name) })[0] ?? null;
  const address = user.address?.trim() ? user.address : location?.address ?? null;
  const city = cityFromAddress(address);
  return {
    category: fromProfile ?? fromProducts,
    categorySource: fromProfile ? 'profile' : fromProducts ? 'products' : null,
    city,
    citySource: city ? 'address' : null,
    isDemo: user.isDemo === true,
  };
}

type LocationAggRow = {
  location_id: string | null;
  n: number | bigint;
  rating_sum: number | null;
  replied: number | bigint;
  negative: number | bigint;
  reply_median_sec: number | null;
};

/** Bayinin şube ligi (yalnız kendi verisi; QR geri bildirimi şubeye bağlıdır). */
export async function loadLocations(dealerId: string, range: DayRange, opts: { fresh?: boolean; db?: Db } = {}): Promise<LocationRow[]> {
  const key = locationsCacheKey(dealerId, range);
  if (!opts.fresh) {
    const cached = await redisGetJson<LocationRow[]>(key);
    if (Array.isArray(cached)) return cached;
  }
  const db = opts.db ?? prisma;
  const inst = dayRangeToInstants(range);
  const from = new Date(inst.from);
  const to = new Date(inst.to);
  const [rows, locations] = await Promise.all([
    db.$queryRaw<LocationAggRow[]>`
      SELECT q."locationId" AS location_id,
             COUNT(*)::int AS n,
             COALESCE(SUM(f.rating), 0)::float AS rating_sum,
             COUNT(*) FILTER (WHERE f."dealerRepliedAt" IS NOT NULL)::int AS replied,
             COUNT(*) FILTER (WHERE f.sentiment = 'negative' OR (f.sentiment IS NULL AND f.rating <= 2))::int AS negative,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (f."dealerRepliedAt" - f."createdAt")))
               FILTER (WHERE f."dealerRepliedAt" IS NOT NULL AND f."dealerRepliedAt" >= f."createdAt") AS reply_median_sec
        FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId"
       WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL
         AND f."createdAt" >= ${from} AND f."createdAt" < ${to}
       GROUP BY 1`,
    db.dealerLocation.findMany({ where: { dealerId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(locations.map((l) => [l.id, l.name]));
  const out: LocationRow[] = rows
    .map((r) => {
      const n = toInt(r.n);
      const median = toNumOrNull(r.reply_median_sec);
      return {
        id: r.location_id,
        name: r.location_id ? names.get(r.location_id) ?? null : null,
        feedback: n,
        avgRating: n > 0 ? Math.round(((toNumOrNull(r.rating_sum) ?? 0) / n) * 100) / 100 : null,
        replyRate: n > 0 ? Math.round((toInt(r.replied) / n) * 1000) / 10 : null,
        negativeShare: n > 0 ? Math.round((toInt(r.negative) / n) * 1000) / 10 : null,
        medianReplySec: median == null ? null : Math.round(median),
      };
    })
    .sort((a, b) => b.feedback - a.feedback);
  await redisSetJson(key, out, LOCATIONS_TTL_SECONDS);
  return out;
}

/** Sayfa/BFF ortak giriş noktası. */
export async function loadDealerBenchmark(
  dealerId: string,
  query: BenchmarkQuery,
  opts: { fresh?: boolean; now?: Date; db?: Db } = {},
): Promise<BenchmarkData> {
  const today = istanbulDay(opts.now ?? new Date());
  const range = resolvePreset(query.preset, today);
  const [profile, snapshot, locations] = await Promise.all([
    loadBenchmarkProfile(dealerId, opts.db),
    loadPlatformSnapshot(range, { fresh: opts.fresh, db: opts.db }),
    loadLocations(dealerId, range, { fresh: opts.fresh, db: opts.db }),
  ]);

  const minFeedback = minFeedbackFor(query.preset);
  const ctx: SegmentContext = { selfId: dealerId, isDemo: profile.isDemo, category: profile.category, city: profile.city };
  const segments = segmentInfos(snapshot, ctx, minFeedback);
  const group = resolveGroup(query.group, segments);
  const members = segmentMembers(snapshot.roster, ctx, group);
  const contributors = members ? contributorsOf(members, snapshot.current, minFeedback) : [];
  const selfFeedback = snapshot.current[dealerId]?.n ?? 0;
  const insufficient = selfFeedback < minFeedback;

  const metrics = buildRails(snapshot, dealerId, contributors, minFeedback);
  const topics = buildTopicGaps(snapshot, dealerId, contributors);
  const { isDemo: _isDemo, ...publicProfile } = profile;
  void _isDemo;

  return {
    generatedAt: new Date().toISOString(),
    tz: BENCHMARK_TZ,
    period: { preset: query.preset, range, compareRange: snapshot.compareRange, bucket: snapshot.bucket },
    group,
    segments,
    profile: publicProfile,
    self: { feedback: selfFeedback, minFeedback, status: insufficient ? 'insufficient_data' : 'ready' },
    rank: buildRank(snapshot, dealerId, members, minFeedback),
    metrics,
    series: buildSeries(snapshot, dealerId, members),
    topics,
    locations: locations.length >= 2 ? locations : [],
    recommendations: buildRecommendations(metrics, topics, { insufficient, categoryMissing: !profile.category }),
  };
}
