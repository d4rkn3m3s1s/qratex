/**
 * Bayi Etki — TEK sunucu yükleyicisi (SSR sayfası + `GET /api/dealer/analytics/impact`).
 *
 * Bütün sorgular bayi kimliğiyle kapsanır (`dealerId` yalnız oturumdan/kapsamdan) ve tek
 * `Promise.all` turundadır. Kovalar SQL'de İstanbul saatiyle (§4.4/10). Hata FIRLATILIR —
 * eski uçların yaptığı gibi `catch {}` ile "0" basılmaz (İş sonuçları B4 / ROI B4).
 *
 * Önbellek: bayi + dönem + karşılaştırma + ayar sürümü anahtarıyla 2 dk. Ayar kaydı yeni sürüm
 * yazdığı için eski sonuç kendiliğinden geçersizleşir.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { loadLocations } from '@/lib/dealer-benchmark/load';
import {
  EMPTY_FEEDBACK,
  EMPTY_VISITS,
  basketAssumption,
  buildClosedLoop,
  buildKpis,
  buildNextSteps,
  buildTrend,
  cohortDays,
  goalProgress,
  impactInstants,
  impactSettingsKey,
  normalizeImpactSettings,
  type ClosedLoopRow,
  type FeedbackWindow,
  type RemedyWindow,
  type VisitWindow,
} from './core';
import { IMPACT_TZ, type ImpactData, type ImpactQuery, type ImpactSettings, type Workload } from './types';

type Db = typeof prisma;

export const IMPACT_CACHE_TTL_SECONDS = 120;
export const impactCacheKey = (dealerId: string, q: ImpactQuery, settingsVersion: string) =>
  `dealer-impact:v1:data:${dealerId}:${q.range.from}:${q.range.to}:${q.compare}:${settingsVersion}`;

const toInt = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0) || 0);
const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
};

const NEG = (alias: string) =>
  Prisma.sql`(${Prisma.raw(alias)}.sentiment = 'negative' OR (${Prisma.raw(alias)}.sentiment IS NULL AND ${Prisma.raw(alias)}.rating <= 2))`;
const WEEK = (col: string) =>
  Prisma.sql`to_char(date_trunc('week', ((${Prisma.raw(col)} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')), 'YYYY-MM-DD')`;

export class ImpactDealerNotFoundError extends Error {
  constructor() {
    super('İşletme bulunamadı');
    this.name = 'ImpactDealerNotFoundError';
  }
}

// ───────────────────────────── Ayarlar ─────────────────────────────

export async function readImpactSettings(dealerId: string, db: Db = prisma): Promise<ImpactSettings> {
  const row = await db.settings.findUnique({ where: { key: impactSettingsKey(dealerId) }, select: { value: true } });
  return normalizeImpactSettings(row?.value);
}

export async function writeImpactSettings(
  dealerId: string,
  input: Omit<ImpactSettings, 'updatedAt'>,
  db: Db = prisma,
): Promise<ImpactSettings> {
  const value = { ...input, updatedAt: new Date().toISOString() };
  await db.settings.upsert({
    where: { key: impactSettingsKey(dealerId) },
    create: { key: impactSettingsKey(dealerId), value: value as unknown as Prisma.InputJsonValue, category: 'dealer' },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });
  return normalizeImpactSettings(value);
}

// ───────────────────────────── Sorgular ─────────────────────────────

type FbRow = {
  win: string;
  n: number | bigint;
  rating_sum: number | null;
  replied: number | bigint;
  negative: number | bigint;
  unreplied_negative: number | bigint;
  median_sec: number | null;
};

/** Bayinin birleşik geri bildirimi (QR + tüketim yorumu) — iki pencere tek sorguda. */
function unified(dealerId: string, a: { from: Date; to: Date }, b: { from: Date; to: Date }): Prisma.Sql {
  return Prisma.sql`
    SELECT f.rating, f.sentiment, f."createdAt" AS created_at, f."dealerRepliedAt" AS replied_at
      FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId"
     WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL
       AND ((f."createdAt" >= ${a.from} AND f."createdAt" < ${a.to}) OR (f."createdAt" >= ${b.from} AND f."createdAt" < ${b.to}))
    UNION ALL
    SELECT r.rating, r.sentiment, r."createdAt" AS created_at, r."dealerRepliedAt" AS replied_at
      FROM "ConsumptionReview" r JOIN "Consumption" c ON c.id = r."consumptionId"
     WHERE c."dealerId" = ${dealerId} AND r."deletedAt" IS NULL
       AND ((r."createdAt" >= ${a.from} AND r."createdAt" < ${a.to}) OR (r."createdAt" >= ${b.from} AND r."createdAt" < ${b.to}))`;
}

function toFeedbackWindow(r: FbRow | undefined): FeedbackWindow {
  if (!r) return { ...EMPTY_FEEDBACK };
  return {
    n: toInt(r.n),
    ratingSum: toNum(r.rating_sum) ?? 0,
    replied: toInt(r.replied),
    negative: toInt(r.negative),
    unrepliedNegative: toInt(r.unreplied_negative),
    medianReplySec: toNum(r.median_sec),
  };
}

type VisitRow = {
  win: string;
  customers: number | bigint;
  returning: number | bigint;
  visits: number | bigint;
  revenue: number | null;
  amount_n: number | bigint;
};

function toVisitWindow(r: VisitRow | undefined): VisitWindow {
  if (!r) return { ...EMPTY_VISITS };
  return {
    customers: toInt(r.customers),
    returning: toInt(r.returning),
    visits: toInt(r.visits),
    revenue: toNum(r.revenue) ?? 0,
    amountN: toInt(r.amount_n),
  };
}

/** Sayfa/BFF ortak giriş noktası. */
export async function loadDealerImpact(
  dealerId: string,
  query: ImpactQuery,
  opts: { fresh?: boolean; now?: Date; db?: Db; readOnly?: boolean } = {},
): Promise<ImpactData> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const [dealer, settings] = await Promise.all([
    db.user.findUnique({ where: { id: dealerId }, select: { role: true } }),
    readImpactSettings(dealerId, db),
  ]);
  if (!dealer || dealer.role !== 'DEALER') throw new ImpactDealerNotFoundError();

  const cacheKey = impactCacheKey(dealerId, query, settings.updatedAt ?? 'default');
  if (!opts.fresh) {
    const cached = await redisGetJson<ImpactData>(cacheKey);
    if (cached && cached.query?.range?.from === query.range.from) return { ...cached, readOnly: opts.readOnly === true };
  }

  const W = settings.returnWindowDays;
  const t = impactInstants(query, W, now);
  const cur = { from: t.from, to: t.to };
  const cmp = { from: t.cmpFrom, to: t.cmpTo };

  const [fbRows, visitRows, actionRow, remedyRow, loopRows, fbWeekly, visitWeekly, actionWeekly, anyRow, locations] = await Promise.all([
    db.$queryRaw<FbRow[]>`
      WITH fb AS (${unified(dealerId, cur, cmp)})
      SELECT CASE WHEN created_at >= ${t.from} AND created_at < ${t.to} THEN 'cur' ELSE 'cmp' END AS win,
             COUNT(*)::int AS n,
             COALESCE(SUM(rating), 0)::float AS rating_sum,
             COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied,
             COUNT(*) FILTER (WHERE ${NEG('fb')})::int AS negative,
             COUNT(*) FILTER (WHERE ${NEG('fb')} AND replied_at IS NULL)::int AS unreplied_negative,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (replied_at - created_at)))
               FILTER (WHERE replied_at IS NOT NULL AND replied_at >= created_at) AS median_sec
        FROM fb
       GROUP BY 1`,
    // Geri dönen müşteri: dönemde gelen müşterilerden, dönem öncesinde de gelmiş ya da dönemde ≥2 kez gelenler.
    db.$queryRaw<VisitRow[]>`
      WITH first AS (
        SELECT c."customerId" AS customer_id, MIN(c."createdAt") AS first_at
          FROM "Consumption" c WHERE c."dealerId" = ${dealerId} GROUP BY 1
      ), w AS (
        SELECT CASE WHEN c."createdAt" >= ${t.from} AND c."createdAt" < ${t.to} THEN 'cur' ELSE 'cmp' END AS win,
               c."customerId" AS customer_id,
               COUNT(*)::int AS visits,
               COALESCE(SUM(c.amount), 0)::float AS revenue,
               COUNT(c.amount)::int AS amount_n
          FROM "Consumption" c
         WHERE c."dealerId" = ${dealerId}
           AND ((c."createdAt" >= ${t.from} AND c."createdAt" < ${t.to}) OR (c."createdAt" >= ${t.cmpFrom} AND c."createdAt" < ${t.cmpTo}))
         GROUP BY 1, 2
      )
      SELECT w.win AS win,
             COUNT(*)::int AS customers,
             COUNT(*) FILTER (
               WHERE w.visits >= 2 OR f.first_at < (CASE WHEN w.win = 'cur' THEN ${t.from}::timestamp ELSE ${t.cmpFrom}::timestamp END)
             )::int AS returning,
             SUM(w.visits)::int AS visits,
             SUM(w.revenue)::float AS revenue,
             SUM(w.amount_n)::int AS amount_n
        FROM w JOIN first f ON f.customer_id = w.customer_id
       GROUP BY w.win`,
    db.$queryRaw<Array<{ closed_cur: number | bigint; closed_cmp: number | bigint; open: number | bigint; overdue: number | bigint }>>`
      SELECT COUNT(*) FILTER (WHERE a.status = 'done' AND COALESCE(a."completedAt", a."updatedAt") >= ${t.from}
                                AND COALESCE(a."completedAt", a."updatedAt") < ${t.to})::int AS closed_cur,
             COUNT(*) FILTER (WHERE a.status = 'done' AND COALESCE(a."completedAt", a."updatedAt") >= ${t.cmpFrom}
                                AND COALESCE(a."completedAt", a."updatedAt") < ${t.cmpTo})::int AS closed_cmp,
             COUNT(*) FILTER (WHERE a.status IN ('pending', 'assigned', 'in_progress'))::int AS open,
             COUNT(*) FILTER (WHERE a.status IN ('pending', 'assigned', 'in_progress') AND a."dueAt" < ${now})::int AS overdue
        FROM "ActionItem" a WHERE a."dealerId" = ${dealerId}`,
    // Telafi paydası: yalnız müşteriye ULAŞAN teklifler (onay kuyruğu ve bayinin reddettiği taslaklar hariç).
    db.$queryRaw<Array<{ delivered_cur: number | bigint; accepted_cur: number | bigint; delivered_cmp: number | bigint; accepted_cmp: number | bigint; awaiting: number | bigint }>>`
      SELECT COUNT(*) FILTER (WHERE o.status IN ('pending', 'accepted', 'expired') AND o."createdAt" >= ${t.from} AND o."createdAt" < ${t.to})::int AS delivered_cur,
             COUNT(*) FILTER (WHERE o.status = 'accepted' AND o."createdAt" >= ${t.from} AND o."createdAt" < ${t.to})::int AS accepted_cur,
             COUNT(*) FILTER (WHERE o.status IN ('pending', 'accepted', 'expired') AND o."createdAt" >= ${t.cmpFrom} AND o."createdAt" < ${t.cmpTo})::int AS delivered_cmp,
             COUNT(*) FILTER (WHERE o.status = 'accepted' AND o."createdAt" >= ${t.cmpFrom} AND o."createdAt" < ${t.cmpTo})::int AS accepted_cmp,
             COUNT(*) FILTER (WHERE o.status = 'awaiting_dealer_approval')::int AS awaiting
        FROM "RemedyOffer" o WHERE o."dealerId" = ${dealerId}`,
    // Kapanan döngü: müşterisi bilinen olumsuz yorumlar; müşteri başına İLK şikâyet; pencere içinde
    // aynı bayide yeni ziyaret var mı? (yanıtlanan ↔ yanıtlanmayan doğal kıyas).
    db.$queryRaw<Array<{ replied: boolean; matured: boolean; customers: number | bigint; returned: number | bigint; revenue: number | null }>>`
      WITH neg AS (
        SELECT f."userId" AS customer_id, f."createdAt" AS at, (f."dealerRepliedAt" IS NOT NULL) AS replied
          FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId"
         WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL AND f."userId" IS NOT NULL
           AND ${NEG('f')} AND f."createdAt" >= ${t.cohortFrom} AND f."createdAt" < ${t.to}
        UNION ALL
        SELECT r."customerId" AS customer_id, r."createdAt" AS at, (r."dealerRepliedAt" IS NOT NULL) AS replied
          FROM "ConsumptionReview" r JOIN "Consumption" c ON c.id = r."consumptionId"
         WHERE c."dealerId" = ${dealerId} AND r."deletedAt" IS NULL
           AND ${NEG('r')} AND r."createdAt" >= ${t.cohortFrom} AND r."createdAt" < ${t.to}
      ), first_neg AS (
        SELECT DISTINCT ON (customer_id) customer_id, at, replied
          FROM neg
         WHERE at < ${t.cohortTo} OR at >= ${t.pendingFrom}
         ORDER BY customer_id, at
      )
      SELECT fn.replied AS replied,
             (fn.at < ${t.cohortTo}) AS matured,
             COUNT(*)::int AS customers,
             COUNT(*) FILTER (WHERE x.visits > 0)::int AS returned,
             COALESCE(SUM(x.revenue), 0)::float AS revenue
        FROM first_neg fn
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS visits, SUM(c2.amount)::float AS revenue
            FROM "Consumption" c2
           WHERE c2."dealerId" = ${dealerId} AND c2."customerId" = fn.customer_id
             AND c2."createdAt" > fn.at AND c2."createdAt" <= fn.at + make_interval(days => ${W}::int)
        ) x ON true
       GROUP BY 1, 2`,
    db.$queryRaw<Array<{ week: string; n: number | bigint; rating_sum: number | null; replied: number | bigint; negative: number | bigint }>>`
      WITH fb AS (${unified(dealerId, cur, { from: t.from, to: t.from })})
      SELECT ${WEEK('created_at')} AS week,
             COUNT(*)::int AS n,
             COALESCE(SUM(rating), 0)::float AS rating_sum,
             COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied,
             COUNT(*) FILTER (WHERE ${NEG('fb')})::int AS negative
        FROM fb GROUP BY 1`,
    db.$queryRaw<Array<{ week: string; visits: number | bigint; revenue: number | null }>>`
      SELECT ${WEEK('c."createdAt"')} AS week, COUNT(*)::int AS visits, COALESCE(SUM(c.amount), 0)::float AS revenue
        FROM "Consumption" c
       WHERE c."dealerId" = ${dealerId} AND c."createdAt" >= ${t.from} AND c."createdAt" < ${t.to}
       GROUP BY 1`,
    db.$queryRaw<Array<{ week: string; closed: number | bigint }>>`
      SELECT ${WEEK('COALESCE(a."completedAt", a."updatedAt")')} AS week, COUNT(*)::int AS closed
        FROM "ActionItem" a
       WHERE a."dealerId" = ${dealerId} AND a.status = 'done'
         AND COALESCE(a."completedAt", a."updatedAt") >= ${t.from} AND COALESCE(a."completedAt", a."updatedAt") < ${t.to}
       GROUP BY 1`,
    db.$queryRaw<Array<{ fb: boolean; visits: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM "Feedback" f JOIN "QRCode" q ON q.id = f."qrCodeId" WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL) AS fb,
             EXISTS (SELECT 1 FROM "Consumption" c WHERE c."dealerId" = ${dealerId}) AS visits`,
    loadLocations(dealerId, query.range, { fresh: opts.fresh, db }),
  ]);

  const fbCur = toFeedbackWindow(fbRows.find((r) => r.win === 'cur'));
  const fbCmp = query.compareRange ? toFeedbackWindow(fbRows.find((r) => r.win === 'cmp')) : null;
  const vCur = toVisitWindow(visitRows.find((r) => r.win === 'cur'));
  const vCmp = query.compareRange ? toVisitWindow(visitRows.find((r) => r.win === 'cmp')) : null;
  const a = actionRow[0];
  const o = remedyRow[0];
  const remedy: RemedyWindow = { delivered: toInt(o?.delivered_cur), accepted: toInt(o?.accepted_cur) };
  const remedyCmp: RemedyWindow | null = query.compareRange
    ? { delivered: toInt(o?.delivered_cmp), accepted: toInt(o?.accepted_cmp) }
    : null;

  const trend = buildTrend(query.range, {
    feedback: fbWeekly.map((r) => ({ week: r.week, n: toInt(r.n), ratingSum: toNum(r.rating_sum) ?? 0, replied: toInt(r.replied), negative: toInt(r.negative) })),
    visits: visitWeekly.map((r) => ({ week: r.week, visits: toInt(r.visits), revenue: toNum(r.revenue) ?? 0 })),
    actions: actionWeekly.map((r) => ({ week: r.week, closed: toInt(r.closed) })),
  });

  const kpis = buildKpis({
    fb: fbCur,
    fbCmp,
    visits: vCur,
    visitsCmp: vCmp,
    remedy,
    remedyCmp,
    actionsClosed: toInt(a?.closed_cur),
    actionsClosedCmp: query.compareRange ? toInt(a?.closed_cmp) : null,
    trend,
  });

  const basket = basketAssumption(settings, vCur);
  const loop: ClosedLoopRow[] = loopRows.map((r) => ({
    replied: r.replied === true,
    matured: r.matured === true,
    customers: toInt(r.customers),
    returned: toInt(r.returned),
    revenue: toNum(r.revenue) ?? 0,
  }));
  const closedLoop = buildClosedLoop(loop, W, cohortDays(t, query.range, W), basket.value);

  const workload: Workload = {
    open: toInt(a?.open),
    overdue: toInt(a?.overdue),
    awaitingApproval: toInt(o?.awaiting),
    unrepliedNegative: fbCur.unrepliedNegative,
  };

  const data: ImpactData = {
    generatedAt: now.toISOString(),
    tz: IMPACT_TZ,
    query,
    settings,
    assumptions: { windowDays: W, basket },
    closedLoop,
    kpis,
    goals: goalProgress(settings, kpis),
    workload,
    trend,
    locations: locations.length >= 2 ? locations : [],
    nextSteps: buildNextSteps(workload, basket, vCur, Object.keys(settings.goals).length > 0),
    hasAnyData: anyRow[0]?.fb === true || anyRow[0]?.visits === true,
    readOnly: opts.readOnly === true,
  };
  await redisSetJson(cacheKey, { ...data, readOnly: false }, IMPACT_CACHE_TTL_SECONDS);
  return data;
}
