/**
 * Admin Analitik — sunucu yükleyicileri (SSR sayfası ve BFF aynı fonksiyonu kullanır).
 *
 * Veri katmanı ilkeleri (admin_analytics.md):
 *  - B-3: silinen geri bildirim/yorum hiçbir metriğe girmez (`deletedAt IS NULL` her kaynakta).
 *  - B-2: "değerlendirme" = QR geri bildirimi ∪ tüketim yorumu, iki dönem için AYNI SQL.
 *  - B-4: gün/saat kovaları SQL'de `AT TIME ZONE 'Europe/Istanbul'` (Prisma `timestamp(3)` UTC).
 *  - B-6: sınırsız `findMany` + bellek içi O(gün × satır) yok; her kırılım `GROUP BY`.
 *  - B-10: hata yutulmaz ("200 + sıfırlar" yok); hatalı sonuç önbelleğe yazılmaz.
 *  - B-11: her bölüm kendi Redis anahtarında (`admin:analytics:v2:{bölüm}:{sorgu}`), `fresh` atlar.
 *  - B-7: tarama = `qr_scanned` olayı (dönemsel); `scanCount` (tüm zamanlar sayacı) kullanılmaz.
 * insights.md B3: sektör `categorizeDealer` ile türetilir (businessCategory eşanlamlısı ya da ürün
 * kategorisi adları); `demo-*` ve tanınmayan metin yok sayılır.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { DEFAULT_RETENTION_DAYS } from '@/lib/analytics-event-retention';
import { categorizeDealer } from '@/lib/places/categories';
import {
  attentionDealers,
  avgOf,
  buildDealerBenchmark,
  buildHeatmap,
  buildRootCause,
  buildSectors,
  buildSeries,
  comparison,
  risingTopics,
  sharePct,
  toAggMap,
  toNum,
  K_MIN,
  MIN_N,
  MIN_PEERS,
  BAYES_C,
  Z_HIGH,
  Z_LOW,
  type DailyRaw,
  type DealerAggRaw,
  type RosterDealer,
  type TopicCountRaw,
  type TopicDealerRaw,
  type TopicPartRaw,
} from './core';
import { adminQueryCacheKey, toInstants, type Instants } from './params';
import {
  ANALYTICS_TZ,
  type AdminAnalyticsQuery,
  type AdminAnalyticsSection,
  type AdminCards,
  type AdminDealers,
  type AdminOverview,
  type AdminRootCause,
  type AdminSectors,
  type RoleKey,
  type SectionData,
} from './types';

export const ADMIN_ANALYTICS_CACHE_TTL = 120;
const ROSTER_TTL = 300;
const CACHE_VERSION = 'v2';

/* ───────────────────────── SQL yapı taşları ───────────────────────── */

function local(col: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')`;
}

const LOCAL_AT = local(Prisma.sql`ev."at"`);

/** Tek duygu tanımı (bayi analitiği ve Gelen Kutusu ile aynı). */
function sentimentCase(sentiment: Prisma.Sql, text: Prisma.Sql, analyzedAt: Prisma.Sql, rating: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE
      WHEN lower(${sentiment}) IN ('positive', 'neutral', 'negative') THEN lower(${sentiment})
      WHEN ${text} IS NOT NULL AND btrim(${text}) <> '' AND ${analyzedAt} IS NULL THEN 'pending'
      WHEN ${rating} <= 2 THEN 'negative'
      WHEN ${rating} >= 4 THEN 'positive'
      ELSE 'neutral'
    END`;
}

/** Temiz veri: gölge yasaklı / demo müşteri ve demo bayi hariç. */
function cleanUserCond(userCol: Prisma.Sql, dealerCol: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
       AND (${userCol} IS NULL OR NOT EXISTS (
             SELECT 1 FROM "User" cu WHERE cu."id" = ${userCol} AND (cu."fraudStatus" = 'shadow_ban' OR cu."isDemo" = true)))
       AND NOT EXISTS (SELECT 1 FROM "User" du WHERE du."id" = ${dealerCol} AND du."isDemo" = true)`;
}

function dealerCond(dealerCol: Prisma.Sql, dealerIds: string[] | null): Prisma.Sql {
  if (!dealerIds) return Prisma.empty;
  return Prisma.sql` AND ${dealerCol} = ANY(${dealerIds}::text[])`;
}

interface SourceOpts {
  clean: boolean;
  dealerIds: string[] | null;
}

function feedbackSource(w: Instants, o: SourceOpts): Prisma.Sql {
  return Prisma.sql`
    SELECT f."createdAt" AS "at", f."rating" AS rating,
           ${sentimentCase(Prisma.sql`f."sentiment"`, Prisma.sql`f."text"`, Prisma.sql`f."aiProcessedAt"`, Prisma.sql`f."rating"`)} AS s,
           'qr'::text AS ch, q."dealerId" AS dealer_id, f."userId" AS user_id, f."topics" AS topics
      FROM "Feedback" f
      JOIN "QRCode" q ON q."id" = f."qrCodeId"
     WHERE f."deletedAt" IS NULL
       AND f."createdAt" >= ${w.from} AND f."createdAt" < ${w.to}
       ${o.clean ? Prisma.sql`AND f."trustFlagged" = false ${cleanUserCond(Prisma.sql`f."userId"`, Prisma.sql`q."dealerId"`)}` : Prisma.empty}
       ${dealerCond(Prisma.sql`q."dealerId"`, o.dealerIds)}`;
}

function reviewSource(w: Instants, o: SourceOpts): Prisma.Sql {
  return Prisma.sql`
    SELECT r."createdAt" AS "at", r."rating" AS rating,
           ${sentimentCase(Prisma.sql`r."sentiment"`, Prisma.sql`r."text"`, Prisma.sql`r."analyzedAt"`, Prisma.sql`r."rating"`)} AS s,
           'consumption'::text AS ch, c."dealerId" AS dealer_id, r."customerId" AS user_id, NULL::jsonb AS topics
      FROM "ConsumptionReview" r
      JOIN "Consumption" c ON c."id" = r."consumptionId"
     WHERE r."deletedAt" IS NULL
       AND r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to}
       ${o.clean ? cleanUserCond(Prisma.sql`r."customerId"`, Prisma.sql`c."dealerId"`) : Prisma.empty}
       ${dealerCond(Prisma.sql`c."dealerId"`, o.dealerIds)}`;
}

function eventsSql(q: AdminAnalyticsQuery, w: Instants, dealerIds: string[] | null): Prisma.Sql {
  const o = { clean: q.clean, dealerIds };
  if (q.source === 'qr') return feedbackSource(w, o);
  if (q.source === 'consumption') return reviewSource(w, o);
  return Prisma.sql`${feedbackSource(w, o)} UNION ALL ${reviewSource(w, o)}`;
}

type Row = Record<string, unknown>;

async function windowAgg(q: AdminAnalyticsQuery, w: Instants, ids: string[] | null): Promise<Row> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH ev AS (${eventsSql(q, w, ids)})
    SELECT COUNT(*)::bigint AS n,
           COALESCE(SUM(ev.rating), 0)::bigint AS rating_sum,
           COUNT(*) FILTER (WHERE ev.s = 'positive')::bigint AS positive,
           COUNT(*) FILTER (WHERE ev.s = 'neutral')::bigint AS neutral,
           COUNT(*) FILTER (WHERE ev.s = 'negative')::bigint AS negative,
           COUNT(*) FILTER (WHERE ev.s = 'pending')::bigint AS pending,
           COUNT(*) FILTER (WHERE ev.rating = 1)::bigint AS r1,
           COUNT(*) FILTER (WHERE ev.rating = 2)::bigint AS r2,
           COUNT(*) FILTER (WHERE ev.rating = 3)::bigint AS r3,
           COUNT(*) FILTER (WHERE ev.rating = 4)::bigint AS r4,
           COUNT(*) FILTER (WHERE ev.rating = 5)::bigint AS r5,
           COUNT(DISTINCT ev.user_id)::bigint AS users
      FROM ev`);
  return rows[0] ?? {};
}

async function dailyReviews(q: AdminAnalyticsQuery, w: Instants, ids: string[] | null): Promise<DailyRaw[]> {
  return prisma.$queryRaw<DailyRaw[]>(Prisma.sql`
    WITH ev AS (${eventsSql(q, w, ids)})
    SELECT to_char(${LOCAL_AT}, 'YYYY-MM-DD') AS day,
           COUNT(*)::bigint AS n,
           COALESCE(SUM(ev.rating), 0)::bigint AS rating_sum,
           COUNT(*) FILTER (WHERE ev.s = 'negative')::bigint AS negative
      FROM ev
     GROUP BY 1`);
}

async function dowHour(q: AdminAnalyticsQuery, w: Instants, ids: string[] | null) {
  return prisma.$queryRaw<Array<{ dow: unknown; hour: unknown; n: unknown }>>(Prisma.sql`
    WITH ev AS (${eventsSql(q, w, ids)})
    SELECT EXTRACT(ISODOW FROM ${LOCAL_AT})::int AS dow,
           EXTRACT(HOUR FROM ${LOCAL_AT})::int AS hour,
           COUNT(*)::bigint AS n
      FROM ev
     GROUP BY 1, 2`);
}

async function dailyNewUsers(w: Instants, clean: boolean): Promise<DailyRaw[]> {
  const at = local(Prisma.sql`u."createdAt"`);
  return prisma.$queryRaw<DailyRaw[]>(Prisma.sql`
    SELECT to_char(${at}, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS n
      FROM "User" u
     WHERE u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to}
       ${clean ? Prisma.sql`AND u."isDemo" = false` : Prisma.empty}
     GROUP BY 1`);
}

function scanDealerCond(ids: string[] | null): Prisma.Sql {
  if (!ids) return Prisma.empty;
  return Prisma.sql` AND e."data"->>'dealerId' = ANY(${ids}::text[])`;
}

async function dailyScans(w: Instants, ids: string[] | null): Promise<DailyRaw[]> {
  const at = local(Prisma.sql`e."createdAt"`);
  return prisma.$queryRaw<DailyRaw[]>(Prisma.sql`
    SELECT to_char(${at}, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS n
      FROM "AnalyticsEvent" e
     WHERE e."event" = 'qr_scanned'
       AND e."createdAt" >= ${w.from} AND e."createdAt" < ${w.to}${scanDealerCond(ids)}
     GROUP BY 1`);
}

async function scansByDealer(w: Instants): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ dealer_id: string | null; n: unknown }>>(Prisma.sql`
    SELECT e."data"->>'dealerId' AS dealer_id, COUNT(*)::bigint AS n
      FROM "AnalyticsEvent" e
     WHERE e."event" = 'qr_scanned'
       AND e."createdAt" >= ${w.from} AND e."createdAt" < ${w.to}
     GROUP BY 1`);
  const out = new Map<string, number>();
  for (const r of rows) if (r.dealer_id) out.set(r.dealer_id, toNum(r.n));
  return out;
}

async function activation(w: Instants, clean: boolean): Promise<{ total: number; activated: number }> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE
             EXISTS (SELECT 1 FROM "Feedback" f WHERE f."userId" = u."id" AND f."deletedAt" IS NULL AND f."createdAt" < ${w.to})
             OR EXISTS (SELECT 1 FROM "Consumption" c WHERE c."customerId" = u."id" AND c."createdAt" < ${w.to})
           )::bigint AS activated
      FROM "User" u
     WHERE u."role" = 'CUSTOMER'
       AND u."createdAt" >= ${w.from} AND u."createdAt" < ${w.to}
       ${clean ? Prisma.sql`AND u."isDemo" = false` : Prisma.empty}`);
  const r = rows[0] ?? {};
  return { total: toNum(r.total), activated: toNum(r.activated) };
}

async function userBase(clean: boolean): Promise<{ total: number; byRole: Record<RoleKey, number> }> {
  const rows = await prisma.$queryRaw<Array<{ role: string; n: unknown }>>(Prisma.sql`
    SELECT u."role"::text AS role, COUNT(*)::bigint AS n
      FROM "User" u
     WHERE u."anonymizedAt" IS NULL
       ${clean ? Prisma.sql`AND u."isDemo" = false` : Prisma.empty}
     GROUP BY 1`);
  const byRole: Record<RoleKey, number> = { CUSTOMER: 0, DEALER: 0, STAFF: 0, ADMIN: 0 };
  let total = 0;
  for (const r of rows) {
    const n = toNum(r.n);
    total += n;
    if (r.role in byRole) byRole[r.role as RoleKey] += n;
  }
  return { total, byRole };
}

async function dealerAggs(q: AdminAnalyticsQuery, w: Instants, ids: string[] | null): Promise<DealerAggRaw[]> {
  return prisma.$queryRaw<DealerAggRaw[]>(Prisma.sql`
    WITH ev AS (${eventsSql(q, w, ids)})
    SELECT ev.dealer_id AS dealer_id,
           COUNT(*)::bigint AS n,
           COALESCE(SUM(ev.rating), 0)::bigint AS rating_sum,
           COALESCE(SUM(ev.rating * ev.rating), 0)::bigint AS rating_sq,
           COUNT(*) FILTER (WHERE ev.s = 'positive')::bigint AS positive,
           COUNT(*) FILTER (WHERE ev.s = 'negative')::bigint AS negative
      FROM ev
     GROUP BY 1`);
}

/* ───────────────────────── Bayi listesi (sektör türetme) ───────────────────────── */

interface RosterRaw {
  id: string;
  name: string | null;
  business_category: string | null;
  product_categories: string[] | null;
}

export async function loadRoster(clean: boolean): Promise<RosterDealer[]> {
  const key = `admin:analytics:${CACHE_VERSION}:roster:${clean ? 'c1' : 'c0'}`;
  const cached = await redisGetJson<RosterDealer[]>(key);
  if (Array.isArray(cached)) return cached;
  const rows = await prisma.$queryRaw<RosterRaw[]>(Prisma.sql`
    SELECT u."id" AS id,
           COALESCE(NULLIF(btrim(u."businessName"), ''), NULLIF(btrim(u."name"), '')) AS name,
           u."businessCategory" AS business_category,
           (SELECT array_agg(pc."name") FROM "ProductCategory" pc
             WHERE pc."dealerId" = u."id" AND pc."isActive" = true) AS product_categories
      FROM "User" u
     WHERE u."role" = 'DEALER'
       ${clean ? Prisma.sql`AND u."isDemo" = false AND u."fraudStatus" <> 'shadow_ban'` : Prisma.empty}`);
  const roster = rows.map((r) => ({
    id: r.id,
    name: r.name ?? '',
    sector: categorizeDealer({ businessCategory: r.business_category, productCategoryNames: r.product_categories ?? [] })[0] ?? null,
  }));
  await redisSetJson(key, roster, ROSTER_TTL);
  return roster;
}

function sectorDealerIds(roster: readonly RosterDealer[], q: AdminAnalyticsQuery): string[] | null {
  if (!q.sector) return null;
  return roster.filter((d) => (q.sector === 'none' ? d.sector == null : d.sector === q.sector)).map((d) => d.id);
}

function filteredRoster(roster: readonly RosterDealer[], q: AdminAnalyticsQuery): RosterDealer[] {
  if (!q.sector) return [...roster];
  return roster.filter((d) => (q.sector === 'none' ? d.sector == null : d.sector === q.sector));
}

function windows(q: AdminAnalyticsQuery): { cur: Instants; cmp: Instants | null } {
  return { cur: toInstants(q.range), cmp: q.compareRange ? toInstants(q.compareRange) : null };
}

const nowIso = () => new Date().toISOString();

/* ───────────────────────── Bölüm hesapları ───────────────────────── */

async function computeDealers(q: AdminAnalyticsQuery): Promise<AdminDealers> {
  const { cur, cmp } = windows(q);
  const roster = await loadRoster(q.clean);
  const ids = sectorDealerIds(roster, q);
  const [curRows, prevRows] = await Promise.all([dealerAggs(q, cur, ids), cmp ? dealerAggs(q, cmp, ids) : Promise.resolve(null)]);
  const scoped = filteredRoster(roster, q);
  const bench = buildDealerBenchmark(scoped, toAggMap(curRows), prevRows ? toAggMap(prevRows) : null);
  return {
    query: q,
    generatedAt: nowIso(),
    platformAvg: bench.platformAvg,
    minN: MIN_N,
    bayesPrior: BAYES_C,
    thresholds: { low: Z_LOW, high: Z_HIGH, minPeers: MIN_PEERS },
    rows: bench.rows,
    insufficient: bench.insufficient,
    silent: bench.silent,
    totalDealers: scoped.length,
  };
}

async function computeSectors(q: AdminAnalyticsQuery): Promise<AdminSectors> {
  const { cur, cmp } = windows(q);
  // Sektör sekmesi kırılımın kendisidir: sektör süzgeci burada uygulanmaz.
  const qAll: AdminAnalyticsQuery = { ...q, sector: null };
  const roster = await loadRoster(q.clean);
  const [curRows, prevRows, scans] = await Promise.all([
    dealerAggs(qAll, cur, null),
    cmp ? dealerAggs(qAll, cmp, null) : Promise.resolve(null),
    scansByDealer(cur),
  ]);
  const s = buildSectors({ roster, current: toAggMap(curRows), previous: prevRows ? toAggMap(prevRows) : null, scans });
  return { query: q, generatedAt: nowIso(), kMin: K_MIN, ...s };
}

async function computeRootCause(q: AdminAnalyticsQuery): Promise<AdminRootCause> {
  const { cur, cmp } = windows(q);
  const roster = await loadRoster(q.clean);
  const ids = sectorDealerIds(roster, q);
  const names = new Map(roster.map((d) => [d.id, d.name]));
  // Konular yalnız QR geri bildiriminde var; tüketim yorumu kaynağında döküm boş döner.
  const fbOnly: AdminAnalyticsQuery = { ...q, source: 'qr' };
  const negTopics = (w: Instants) => Prisma.sql`
    WITH ev AS (${eventsSql(fbOnly, w, ids)})
    SELECT ev.*, t.topic AS topic
      FROM ev
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(ev.topics) = 'array' THEN ev.topics ELSE '[]'::jsonb END
      ) AS t(topic)
     WHERE ev.s = 'negative'`;
  const topicBaseSql = (w: Instants) => Prisma.sql`
    WITH ev AS (${eventsSql(fbOnly, w, ids)})
    SELECT COUNT(*)::bigint AS n FROM ev
     WHERE ev.s = 'negative'
       AND CASE WHEN jsonb_typeof(ev.topics) = 'array' THEN jsonb_array_length(ev.topics) > 0 ELSE false END`;
  const negCount = (w: Instants) => Prisma.sql`
    WITH ev AS (${eventsSql(q, w, ids)})
    SELECT COUNT(*) FILTER (WHERE ev.s = 'negative')::bigint AS n FROM ev`;
  const topicsEnabled = q.source !== 'consumption';
  const [parts, dealers, prev, base, negCur, negPrev] = await Promise.all([
    topicsEnabled
      ? prisma.$queryRaw<TopicPartRaw[]>(Prisma.sql`
          WITH nt AS (${negTopics(cur)})
          SELECT nt.topic AS topic, EXTRACT(HOUR FROM ((nt."at" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'))::int AS hour, COUNT(*)::bigint AS n
            FROM nt GROUP BY 1, 2`)
      : Promise.resolve([] as TopicPartRaw[]),
    topicsEnabled
      ? prisma.$queryRaw<TopicDealerRaw[]>(Prisma.sql`
          WITH nt AS (${negTopics(cur)})
          SELECT nt.topic AS topic, nt.dealer_id AS dealer_id, COUNT(*)::bigint AS n
            FROM nt GROUP BY 1, 2`)
      : Promise.resolve([] as TopicDealerRaw[]),
    topicsEnabled && cmp
      ? prisma.$queryRaw<TopicCountRaw[]>(Prisma.sql`
          WITH nt AS (${negTopics(cmp)})
          SELECT nt.topic AS topic, COUNT(*)::bigint AS n FROM nt GROUP BY 1`)
      : Promise.resolve(null),
    topicsEnabled ? prisma.$queryRaw<Row[]>(topicBaseSql(cur)) : Promise.resolve([{ n: 0 }] as Row[]),
    prisma.$queryRaw<Row[]>(negCount(cur)),
    cmp ? prisma.$queryRaw<Row[]>(negCount(cmp)) : Promise.resolve(null),
  ]);
  const topicBase = toNum(base[0]?.n);
  return {
    query: q,
    generatedAt: nowIso(),
    negative: comparison(toNum(negCur[0]?.n), negPrev ? toNum(negPrev[0]?.n) : undefined, 0),
    topicBase,
    topics: buildRootCause({ parts, dealers, previous: prev, topicBase, names }),
  };
}

async function computeCards(q: AdminAnalyticsQuery): Promise<AdminCards> {
  const { cur, cmp } = windows(q);
  const roster = q.sector ? await loadRoster(q.clean) : null;
  const ids = roster ? sectorDealerIds(roster, q) : null;
  const periodSql = (w: Instants) => Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "PhysicalCard" pc WHERE pc."activatedAt" >= ${w.from} AND pc."activatedAt" < ${w.to})::bigint AS activated,
      (SELECT COUNT(*) FROM "PhysicalCard" pc WHERE pc."blockedAt" >= ${w.from} AND pc."blockedAt" < ${w.to})::bigint AS blocked,
      (SELECT COUNT(*) FROM "Consumption" c WHERE c."createdAt" >= ${w.from} AND c."createdAt" < ${w.to}${dealerCond(Prisma.sql`c."dealerId"`, ids)})::bigint AS consumptions,
      (SELECT COUNT(*) FROM "ConsumptionReview" r JOIN "Consumption" c ON c."id" = r."consumptionId"
        WHERE r."deletedAt" IS NULL AND r."createdAt" >= ${w.from} AND r."createdAt" < ${w.to}${dealerCond(Prisma.sql`c."dealerId"`, ids)})::bigint AS reviews`;
  const [statusRows, curRows, prevRows] = await Promise.all([
    prisma.$queryRaw<Array<{ status: string; archived: unknown; n: unknown }>>(Prisma.sql`
      SELECT pc."status"::text AS status, (pc."archivedAt" IS NOT NULL) AS archived, COUNT(*)::bigint AS n
        FROM "PhysicalCard" pc GROUP BY 1, 2`),
    prisma.$queryRaw<Row[]>(periodSql(cur)),
    cmp ? prisma.$queryRaw<Row[]>(periodSql(cmp)) : Promise.resolve(null),
  ]);
  const allTime = { total: 0, unused: 0, activated: 0, blocked: 0, archived: 0 };
  for (const r of statusRows) {
    const n = toNum(r.n);
    allTime.total += n;
    if (r.archived === true) allTime.archived += n;
    if (r.status === 'UNUSED') allTime.unused += n;
    else if (r.status === 'ACTIVATED') allTime.activated += n;
    else if (r.status === 'BLOCKED') allTime.blocked += n;
  }
  const c = curRows[0] ?? {};
  const p = prevRows ? (prevRows[0] ?? {}) : null;
  const pick = (k: string) => comparison(toNum(c[k]), p ? toNum(p[k]) : undefined, 0);
  const rate = (r: Row) => sharePct(toNum(r.reviews), toNum(r.consumptions));
  return {
    query: q,
    generatedAt: nowIso(),
    allTime,
    period: {
      activated: pick('activated'),
      blocked: pick('blocked'),
      consumptions: pick('consumptions'),
      reviews: pick('reviews'),
      reviewRate: comparison(rate(c), p ? rate(p) : undefined, 1),
    },
  };
}

async function computeOverview(q: AdminAnalyticsQuery, opts: { fresh?: boolean }): Promise<AdminOverview> {
  const { cur, cmp } = windows(q);
  const roster = q.sector ? await loadRoster(q.clean) : null;
  const ids = roster ? sectorDealerIds(roster, q) : null;
  const [aggCur, aggPrev, daily, dailyCmp, heat, usersCur, usersPrev, scansCur, scansPrev, actCur, actPrev, base, dealers, root] =
    await Promise.all([
      windowAgg(q, cur, ids),
      cmp ? windowAgg(q, cmp, ids) : Promise.resolve(null),
      dailyReviews(q, cur, ids),
      cmp ? dailyReviews(q, cmp, ids) : Promise.resolve([] as DailyRaw[]),
      dowHour(q, cur, ids),
      dailyNewUsers(cur, q.clean),
      cmp ? dailyNewUsers(cmp, q.clean) : Promise.resolve(null),
      dailyScans(cur, ids),
      cmp ? dailyScans(cmp, ids) : Promise.resolve(null),
      activation(cur, q.clean),
      cmp ? activation(cmp, q.clean) : Promise.resolve(null),
      userBase(q.clean),
      loadAdminSection('dealers', q, opts),
      loadAdminSection('root-cause', q, opts),
    ]);

  const sum = (rows: readonly DailyRaw[] | null) => (rows ? rows.reduce((s, r) => s + toNum(r.n), 0) : undefined);
  const n = toNum(aggCur.n);
  const pn = aggPrev ? toNum(aggPrev.n) : undefined;
  const avg = avgOf(toNum(aggCur.rating_sum), n);
  const pavg = aggPrev ? avgOf(toNum(aggPrev.rating_sum), toNum(aggPrev.n)) : undefined;
  const neg = sharePct(toNum(aggCur.negative), n);
  const pneg = aggPrev ? sharePct(toNum(aggPrev.negative), toNum(aggPrev.n)) : undefined;
  const retentionCutoff = Date.now() - DEFAULT_RETENTION_DAYS * 86_400_000;
  const scansPartial = cur.from.getTime() < retentionCutoff || (cmp != null && cmp.from.getTime() < retentionCutoff);

  const series = buildSeries({
    range: q.range,
    compareRange: q.compareRange,
    reviews: daily,
    compareReviews: dailyCmp,
    newUsers: usersCur,
    scans: scansCur,
  });

  return {
    query: q,
    generatedAt: nowIso(),
    tz: ANALYTICS_TZ,
    kpis: {
      reviews: comparison(n, pn, 0),
      avgRating: comparison(avg, pavg, 2),
      negativeShare: comparison(neg, pneg, 1),
      activeCustomers: comparison(toNum(aggCur.users), aggPrev ? toNum(aggPrev.users) : undefined, 0),
      newUsers: comparison(sum(usersCur) ?? 0, sum(usersPrev), 0),
      scans: comparison(sum(scansCur) ?? 0, sum(scansPrev), 0),
      activation: comparison(sharePct(actCur.activated, actCur.total), actPrev ? sharePct(actPrev.activated, actPrev.total) : undefined, 1),
    },
    ratingN: n,
    scansPartial,
    series,
    sentiment: {
      positive: toNum(aggCur.positive),
      neutral: toNum(aggCur.neutral),
      negative: toNum(aggCur.negative),
      pending: toNum(aggCur.pending),
      total: n,
    },
    ratings: [toNum(aggCur.r1), toNum(aggCur.r2), toNum(aggCur.r3), toNum(aggCur.r4), toNum(aggCur.r5)],
    heatmap: buildHeatmap(heat),
    userBase: base,
    attention: {
      dealers: attentionDealers((dealers as AdminDealers).rows),
      topics: risingTopics((root as AdminRootCause).topics),
    },
    hasAnyData: base.total > 0 || n > 0,
  };
}

/* ───────────────────────── Önbellekli giriş noktası ───────────────────────── */

export function sectionCacheKey(section: AdminAnalyticsSection, q: AdminAnalyticsQuery): string {
  return `admin:analytics:${CACHE_VERSION}:${section}:${adminQueryCacheKey(q)}`;
}

/**
 * Bölümü yükler. Önbellek isabeti yalnız aynı sorgu için kabul edilir; hata fırlatılır ve
 * önbelleğe YAZILMAZ (rapor B-10). `fresh` önbelleği atlar (Yenile gerçekten yeniler).
 */
export async function loadAdminSection<S extends AdminAnalyticsSection>(
  section: S,
  q: AdminAnalyticsQuery,
  opts: { fresh?: boolean } = {},
): Promise<SectionData[S]> {
  const key = sectionCacheKey(section, q);
  if (!opts.fresh) {
    const cached = await redisGetJson<SectionData[S]>(key);
    if (cached && (cached as { query?: AdminAnalyticsQuery }).query && adminQueryCacheKey((cached as { query: AdminAnalyticsQuery }).query) === adminQueryCacheKey(q)) {
      return cached;
    }
  }
  let data: SectionData[AdminAnalyticsSection];
  switch (section) {
    case 'overview':
      data = await computeOverview(q, opts);
      break;
    case 'dealers':
      data = await computeDealers(q);
      break;
    case 'sectors':
      data = await computeSectors(q);
      break;
    case 'root-cause':
      data = await computeRootCause(q);
      break;
    case 'cards':
      data = await computeCards(q);
      break;
    default:
      throw new Error(`Bilinmeyen analitik bölümü: ${String(section)}`);
  }
  await redisSetJson(key, data, ADMIN_ANALYTICS_CACHE_TTL);
  return data as SectionData[S];
}
