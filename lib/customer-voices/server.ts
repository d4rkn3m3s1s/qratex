/**
 * Seslerim (/customer/me/voices) — sunucu veri katmanı (BFF ve sunucu bileşeni ortak).
 *
 * Değişmezler:
 *  - Kapsam her sorguda kullanıcıdır (`Feedback.userId`, `ConsumptionReview.customerId`,
 *    `Consumption.customerId`, `RemedyOffer.userId`). Başkasının kaydı 404 (varlık sızdırılmaz).
 *  - Moderasyonla silinen (`deletedAt`) kayıt liste/istatistik/analize girmez.
 *  - Müşteriye yalnız açık `select` döner: bayi notu dışında iç alan (karakter kategorisi,
 *    churn, aciliyet, efor, aksiyon önerisi, kart token'ı) ASLA seçilmez.
 *  - Sayıyı kod hesaplar: toplamlar `count/aggregate`, puan `points_credited` defter olayından.
 *  - GET'te LLM yok; "AI ne anladı" yalnız kayıtlı analizden okunur ve modül kapısına bağlıdır.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import { getPointsMatrix } from '@/lib/points-rules';
import { getCapRule, sumEarnedInWindow } from '@/lib/economy';
import { describeRemedyOffer } from '@/lib/remedy-offer-service';
import { CUSTOMER_HIDDEN_TIMELINE_KINDS } from '@/lib/remedy-timeline';
import {
  buildVoiceJourney,
  creditedPointsFromEvents,
  cursorWhere,
  customerAnalysis,
  decodeVoiceCursor,
  istanbulMonthStart,
  mediaUrls,
  mergeVoicePages,
  normalizeDimensions,
  parseVoiceKey,
  pickActiveRemedy,
  previewText,
  voiceKey,
  voiceStage,
} from './core';
import {
  CUSTOMER_VISIBLE_REMEDY_STATUSES,
  type CustomerRemedyListItem,
  type CustomerRemedyStatus,
  type PendingConsumption,
  type ReviewRewardPreview,
  type VoiceBusiness,
  type VoiceDetail,
  type VoiceListItem,
  type VoiceListPage,
  type VoiceListParams,
  type VoiceRemedyDetail,
  type VoiceSummary,
} from './types';

export const AI_INSIGHTS_MODULE = 'customer_ai_insights';
const VISIBLE = [...CUSTOMER_VISIBLE_REMEDY_STATUSES];
const TOPIC_SAMPLE = 200;
const PENDING_PREVIEW = 6;
const EXPECTATION_MIN_SAMPLE = 5;

/** "Bulunamadı" — route bunu 404'e çevirir (başkasının kaydı da aynı yanıtı alır). */
export class VoiceNotFoundError extends Error {
  readonly code: 'NOT_FOUND' | 'VOICE_REMOVED';
  constructor(code: 'NOT_FOUND' | 'VOICE_REMOVED', message: string) {
    super(message);
    this.name = 'VoiceNotFoundError';
    this.code = code;
  }
}

/* ───────────────────────── Ortak seçimler ───────────────────────── */

const dealerSelect = { id: true, name: true, businessName: true, businessLogo: true } as const;

type DealerRow = { id: string; name: string | null; businessName: string | null; businessLogo: string | null };

function toBusiness(d: DealerRow | null | undefined): VoiceBusiness {
  if (!d) return { id: '', name: 'İşletme', logo: null };
  return { id: d.id, name: d.businessName?.trim() || d.name?.trim() || 'İşletme', logo: d.businessLogo || null };
}

const remedyBriefSelect = {
  where: { status: { in: VISIBLE } },
  orderBy: { createdAt: 'desc' as const },
  take: 5,
  select: { id: true, status: true, createdAt: true, selectedType: true, selectedValue: true, options: true },
};

type RemedyBriefRow = {
  id: string;
  status: string;
  createdAt: Date;
  selectedType: string | null;
  selectedValue: string | null;
  options: Prisma.JsonValue;
};

function remedyBrief(rows: RemedyBriefRow[]): VoiceListItem['remedy'] {
  const r = pickActiveRemedy(rows);
  if (!r) return null;
  return { id: r.id, status: r.status as CustomerRemedyStatus, selectionLabel: describeRemedyOffer(r).selectionLabel };
}

/* ───────────────────────── Liste ───────────────────────── */

function feedbackWhere(userId: string, p: VoiceListParams): Prisma.FeedbackWhereInput {
  const and: Prisma.FeedbackWhereInput[] = [{ userId, deletedAt: null }];
  const cw = cursorWhere(decodeVoiceCursor(p.cursor), 'fb', 'id');
  if (cw) and.push(cw as Prisma.FeedbackWhereInput);
  if (p.status === 'replied') and.push({ dealerRepliedAt: { not: null } });
  if (p.status === 'awaiting') and.push({ dealerRepliedAt: null });
  if (p.status === 'low') and.push({ rating: { lte: 2 } });
  if (p.status === 'remedy') and.push({ remedyOffers: { some: { status: { in: VISIBLE } } } });
  if (p.q) {
    const c = { contains: p.q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { text: c },
        { qrCode: { name: c } },
        { qrCode: { dealer: { businessName: c } } },
        { qrCode: { dealer: { name: c } } },
      ],
    });
  }
  return { AND: and };
}

function reviewWhere(userId: string, p: VoiceListParams): Prisma.ConsumptionReviewWhereInput {
  const and: Prisma.ConsumptionReviewWhereInput[] = [{ customerId: userId, deletedAt: null }];
  const cw = cursorWhere(decodeVoiceCursor(p.cursor), 'cs', 'consumptionId');
  if (cw) and.push(cw as Prisma.ConsumptionReviewWhereInput);
  if (p.status === 'replied') and.push({ dealerRepliedAt: { not: null } });
  if (p.status === 'awaiting') and.push({ dealerRepliedAt: null });
  if (p.status === 'low') and.push({ rating: { lte: 2 } });
  if (p.status === 'remedy') and.push({ remedyOffers: { some: { status: { in: VISIBLE } } } });
  if (p.q) {
    const c = { contains: p.q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { text: c },
        { consumption: { dealer: { businessName: c } } },
        { consumption: { dealer: { name: c } } },
        { consumption: { product: { name: c } } },
      ],
    });
  }
  return { AND: and };
}

/** Defterde kaynağa bağlı kredi (QR: `feedback`, tüketim yorumu: `review`). */
async function ledgerPoints(userId: string, source: 'feedback' | 'review', ids: string[]): Promise<Map<string, { points: number; xp: number }>> {
  const map = new Map<string, { points: number; xp: number }>();
  if (ids.length === 0) return map;
  const rows = await prisma.pointsLedger.findMany({
    where: { userId, source, sourceId: { in: ids }, status: 'posted', currency: 'POINTS' },
    select: { sourceId: true, delta: true, xpDelta: true },
  });
  for (const r of rows) {
    if (!r.sourceId) continue;
    const prev = map.get(r.sourceId) ?? { points: 0, xp: 0 };
    map.set(r.sourceId, { points: prev.points + Math.max(0, r.delta), xp: prev.xp + Math.max(0, r.xpDelta) });
  }
  return map;
}

/**
 * Birleşik, imleç tabanlı ses listesi. İki tablodan ayrı ayrı `limit + 1` satır çekilir,
 * (createdAt, anahtar) azalan sırada birleştirilir. Böylece hiçbir kayıt sessizce kesilmez.
 */
export async function listVoices(userId: string, params: VoiceListParams): Promise<VoiceListPage> {
  const limit = params.limit;
  const wantQr = params.type !== 'review';
  const wantReview = params.type !== 'qr';

  const [feedbacks, reviews] = await Promise.all([
    wantQr
      ? prisma.feedback.findMany({
          where: feedbackWhere(userId, params),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: {
            id: true,
            rating: true,
            text: true,
            createdAt: true,
            dealerRepliedAt: true,
            dealerFirstViewedAt: true,
            qrCode: { select: { name: true, dealer: { select: dealerSelect } } },
            remedyOffers: remedyBriefSelect,
          },
        })
      : Promise.resolve([]),
    wantReview
      ? prisma.consumptionReview.findMany({
          where: reviewWhere(userId, params),
          orderBy: [{ createdAt: 'desc' }, { consumptionId: 'desc' }],
          take: limit + 1,
          select: {
            id: true,
            consumptionId: true,
            rating: true,
            text: true,
            createdAt: true,
            dealerRepliedAt: true,
            consumption: { select: { dealer: { select: dealerSelect }, product: { select: { name: true } } } },
            remedyOffers: remedyBriefSelect,
          },
        })
      : Promise.resolve([]),
  ]);

  const qrItems: VoiceListItem[] = feedbacks.map((f) => ({
    key: voiceKey('qr', f.id),
    kind: 'qr',
    id: f.id,
    consumptionId: null,
    createdAt: f.createdAt.toISOString(),
    rating: f.rating,
    textPreview: previewText(f.text),
    business: toBusiness(f.qrCode?.dealer),
    place: f.qrCode?.name?.trim() || null,
    stage: voiceStage({ viewedAt: f.dealerFirstViewedAt, repliedAt: f.dealerRepliedAt }),
    repliedAt: f.dealerRepliedAt?.toISOString() ?? null,
    remedy: remedyBrief(f.remedyOffers),
    pointsEarned: null,
  }));
  const reviewItems: VoiceListItem[] = reviews.map((r) => ({
    key: voiceKey('review', r.consumptionId),
    kind: 'review',
    id: r.id,
    consumptionId: r.consumptionId,
    createdAt: r.createdAt.toISOString(),
    rating: r.rating,
    textPreview: previewText(r.text),
    business: toBusiness(r.consumption?.dealer),
    place: r.consumption?.product?.name?.trim() || null,
    stage: voiceStage({ repliedAt: r.dealerRepliedAt }),
    repliedAt: r.dealerRepliedAt?.toISOString() ?? null,
    remedy: remedyBrief(r.remedyOffers),
    pointsEarned: null,
  }));

  const page = mergeVoicePages(
    [
      { rows: qrItems, exhausted: feedbacks.length <= limit },
      { rows: reviewItems, exhausted: reviews.length <= limit },
    ],
    limit
  );

  const [fbPoints, rvPoints] = await Promise.all([
    ledgerPoints(userId, 'feedback', page.items.filter((i) => i.kind === 'qr').map((i) => i.id)),
    ledgerPoints(userId, 'review', page.items.filter((i) => i.kind === 'review').map((i) => i.id)),
  ]);
  for (const item of page.items) {
    const hit = (item.kind === 'qr' ? fbPoints : rvPoints).get(item.id);
    item.pointsEarned = hit ? hit.points : null;
  }
  return page;
}

/* ───────────────────────── Ödül önizlemesi ───────────────────────── */

/** Sunucu otoriter: eşik ve ödül admin matrisinden, kalan hak gerçek tavandan. */
export async function getReviewRewardPreview(userId: string): Promise<ReviewRewardPreview> {
  const rule = getCapRule('feedback');
  const [matrix, earned] = await Promise.all([
    getPointsMatrix(),
    rule ? sumEarnedInWindow(prisma, { userId, rule }) : Promise.resolve({ today: 0, week: 0, todayFromActor: 0 }),
  ]);
  const cfg = matrix.consumptionReview;
  let remaining = Number.POSITIVE_INFINITY;
  if (rule?.daily !== undefined) remaining = Math.min(remaining, rule.daily - earned.today);
  if (rule?.weekly !== undefined) remaining = Math.min(remaining, rule.weekly - earned.week);
  return {
    base: { points: cfg.base.points, xp: cfg.base.xp },
    detailed: { points: cfg.detailed.points, xp: cfg.detailed.xp },
    threshold: cfg.longTextThreshold,
    remainingToday: Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : cfg.detailed.points,
  };
}

/* ───────────────────────── Özet ("Sesin") ───────────────────────── */

async function isAiInsightsEnabled(): Promise<boolean> {
  try {
    const controls = await getModuleControls();
    return (controls as Record<string, boolean | undefined>)[AI_INSIGHTS_MODULE] !== false;
  } catch {
    return false;
  }
}

function countTopics(rows: Array<{ topics: Prisma.JsonValue }>): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!Array.isArray(r.topics)) continue;
    const seen = new Set<string>();
    for (const t of r.topics) {
      if (typeof t !== 'string') continue;
      const k = t.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([key, count]) => ({ key, count }));
}

export async function getVoiceSummary(userId: string, now: Date = new Date()): Promise<VoiceSummary> {
  const monthStart = istanbulMonthStart(now);
  const fbScope = { userId, deletedAt: null };
  const rvScope = { customerId: userId, deletedAt: null };

  const [
    fbAgg,
    rvAgg,
    fbReplied,
    rvReplied,
    pointsRows,
    pendingReviews,
    pendingPreview,
    pendingRemedies,
    favoriteRows,
    aiEnabled,
  ] = await Promise.all([
    prisma.feedback.aggregate({ where: fbScope, _count: { _all: true }, _avg: { rating: true } }),
    prisma.consumptionReview.aggregate({ where: rvScope, _count: { _all: true }, _avg: { rating: true } }),
    prisma.feedback.count({ where: { ...fbScope, dealerRepliedAt: { not: null } } }),
    prisma.consumptionReview.count({ where: { ...rvScope, dealerRepliedAt: { not: null } } }),
    prisma.$queryRaw<Array<{ total: number | null; month: number | null }>>`
      SELECT
        COALESCE(SUM(CASE WHEN jsonb_typeof("data"->'points') = 'number' THEN ("data"->>'points')::numeric ELSE 0 END), 0)::float8 AS "total",
        COALESCE(SUM(CASE WHEN "createdAt" >= ${monthStart} AND jsonb_typeof("data"->'points') = 'number' THEN ("data"->>'points')::numeric ELSE 0 END), 0)::float8 AS "month"
      FROM "AnalyticsEvent"
      WHERE "userId" = ${userId} AND "event" = 'points_credited' AND "category" = 'feedback'
    `,
    prisma.consumption.count({ where: { customerId: userId, review: { is: null } } }),
    prisma.consumption.findMany({
      where: { customerId: userId, review: { is: null } },
      orderBy: { createdAt: 'desc' },
      take: PENDING_PREVIEW,
      select: { id: true, createdAt: true, dealer: { select: dealerSelect }, product: { select: { name: true } } },
    }),
    prisma.remedyOffer.count({ where: { userId, status: 'pending' } }),
    prisma.$queryRaw<Array<{ dealerId: string; n: number; avg: number }>>`
      SELECT t."dealerId", COUNT(*)::int AS "n", AVG(t."rating")::float8 AS "avg"
      FROM (
        SELECT q."dealerId", f."rating" FROM "Feedback" f
          JOIN "QRCode" q ON q."id" = f."qrCodeId"
          WHERE f."userId" = ${userId} AND f."deletedAt" IS NULL
        UNION ALL
        SELECT c."dealerId", r."rating" FROM "ConsumptionReview" r
          JOIN "Consumption" c ON c."id" = r."consumptionId"
          WHERE r."customerId" = ${userId} AND r."deletedAt" IS NULL
      ) t
      GROUP BY t."dealerId"
      ORDER BY "n" DESC, "avg" DESC
      LIMIT 1
    `,
    isAiInsightsEnabled(),
  ]);

  const qr = fbAgg._count._all;
  const reviews = rvAgg._count._all;
  const voices = qr + reviews;
  const ratingSum = (fbAgg._avg.rating ?? 0) * qr + (rvAgg._avg.rating ?? 0) * reviews;
  const replied = fbReplied + rvReplied;

  const fav = favoriteRows[0];
  let favoritePlace: VoiceSummary['favoritePlace'] = null;
  if (fav && fav.n >= 2) {
    const dealer = await prisma.user.findUnique({ where: { id: fav.dealerId }, select: dealerSelect });
    if (dealer) favoritePlace = { business: toBusiness(dealer), count: fav.n, avgRating: Math.round(fav.avg * 10) / 10 };
  }

  const pendingReviewPreview: PendingConsumption[] = pendingPreview.map((c) => ({
    key: voiceKey('review', c.id),
    consumptionId: c.id,
    createdAt: c.createdAt.toISOString(),
    business: toBusiness(c.dealer),
    product: c.product?.name?.trim() || null,
  }));

  let insights: VoiceSummary['insights'] = null;
  if (aiEnabled && voices > 0) {
    const [fbSent, rvSent, topicRows] = await Promise.all([
      prisma.feedback.groupBy({ by: ['sentiment'], where: { ...fbScope, sentiment: { not: null } }, _count: { _all: true } }),
      prisma.consumptionReview.groupBy({ by: ['sentiment'], where: { ...rvScope, sentiment: { not: null } }, _count: { _all: true } }),
      prisma.feedback.findMany({
        where: { ...fbScope, aiProcessedAt: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: TOPIC_SAMPLE,
        select: { topics: true },
      }),
    ]);
    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    for (const g of [...fbSent, ...rvSent]) {
      const k = g.sentiment === 'positive' || g.sentiment === 'negative' ? g.sentiment : g.sentiment === 'neutral' ? 'neutral' : null;
      if (k) sentiment[k] += g._count._all;
    }
    const analyzed = sentiment.positive + sentiment.neutral + sentiment.negative;
    if (analyzed > 0) {
      insights = { analyzed, sentiment, topTopics: countTopics(topicRows), topicSample: topicRows.length };
    }
  }

  const reward = pendingReviews > 0 ? await getReviewRewardPreview(userId).catch(() => null) : null;
  const p = pointsRows[0];

  return {
    totals: {
      voices,
      qr,
      reviews,
      avgRating: voices > 0 ? Math.round((ratingSum / voices) * 10) / 10 : null,
      replied,
      replyRate: voices > 0 ? Math.round((replied / voices) * 100) : null,
    },
    points: { total: Math.round(p?.total ?? 0), thisMonth: Math.round(p?.month ?? 0) },
    favoritePlace,
    pending: { reviews: pendingReviews, remedies: pendingRemedies, reviewPreview: pendingReviewPreview, reward },
    insights,
  };
}

/* ───────────────────────── Detay ───────────────────────── */

type OfferWithEvents = {
  id: string;
  status: string;
  message: string;
  createdAt: Date;
  acceptedAt: Date | null;
  selectedType: string | null;
  selectedValue: string | null;
  options: Prisma.JsonValue;
  timelineEvents: Array<{ kind: string; createdAt: Date; meta: Prisma.JsonValue }>;
};

const offerDetailSelect = {
  id: true,
  status: true,
  message: true,
  createdAt: true,
  acceptedAt: true,
  selectedType: true,
  selectedValue: true,
  options: true,
  timelineEvents: {
    where: { kind: { notIn: [...CUSTOMER_HIDDEN_TIMELINE_KINDS] } },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { kind: true, createdAt: true, meta: true },
  },
} satisfies Prisma.RemedyOfferSelect;

function toRemedyDetail(o: OfferWithEvents): VoiceRemedyDetail {
  const { options, selection, selectionLabel } = describeRemedyOffer(o);
  const notified = o.timelineEvents.find((e) => e.kind === 'notified');
  return {
    id: o.id,
    status: o.status as CustomerRemedyStatus,
    message: o.message,
    offeredAt: (notified?.createdAt ?? o.createdAt).toISOString(),
    acceptedAt: o.acceptedAt?.toISOString() ?? null,
    options: o.status === 'pending' ? options : [],
    selectionLabel,
    selectionType: selection?.type ?? o.selectedType ?? null,
    creditedPoints: creditedPointsFromEvents(o.timelineEvents),
  };
}

function journeyRemedies(offers: OfferWithEvents[]) {
  return offers.map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.createdAt,
    acceptedAt: o.acceptedAt,
    events: o.timelineEvents,
    selectionLabel: describeRemedyOffer(o).selectionLabel,
  }));
}

/** İşletmenin son 90 gündeki medyan yanıt süresi (QR + tüketim yorumları; en az 5 örnek). */
async function dealerReplyExpectation(dealerId: string): Promise<VoiceDetail['expectation']> {
  if (!dealerId) return null;
  try {
    const rows = await prisma.$queryRaw<Array<{ med: number | null; n: number }>>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY t."secs")::float8 AS "med", COUNT(*)::int AS "n"
      FROM (
        SELECT EXTRACT(EPOCH FROM (f."dealerRepliedAt" - f."createdAt")) AS "secs" FROM "Feedback" f
          JOIN "QRCode" q ON q."id" = f."qrCodeId"
          WHERE q."dealerId" = ${dealerId} AND f."dealerRepliedAt" IS NOT NULL AND f."deletedAt" IS NULL
            AND f."createdAt" >= now() - interval '90 days'
        UNION ALL
        SELECT EXTRACT(EPOCH FROM (r."dealerRepliedAt" - r."createdAt")) FROM "ConsumptionReview" r
          JOIN "Consumption" c ON c."id" = r."consumptionId"
          WHERE c."dealerId" = ${dealerId} AND r."dealerRepliedAt" IS NOT NULL AND r."deletedAt" IS NULL
            AND r."createdAt" >= now() - interval '90 days'
      ) t
      WHERE t."secs" >= 0
    `;
    const r = rows[0];
    if (!r || r.n < EXPECTATION_MIN_SAMPLE || r.med == null) return null;
    return { medianHours: Math.max(1, Math.round(r.med / 3600)), sample: r.n };
  } catch {
    return null; // beklenti bilgisi ikincil: hesaplanamazsa gösterilmez
  }
}

async function getQrDetail(userId: string, feedbackId: string): Promise<VoiceDetail> {
  const f = await prisma.feedback.findFirst({
    where: { id: feedbackId, userId },
    select: {
      id: true,
      rating: true,
      text: true,
      media: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      dealerReply: true,
      dealerRepliedAt: true,
      dealerFirstViewedAt: true,
      topics: true,
      themes: true,
      statementSentiments: true,
      aiAnalysis: true,
      qrCode: { select: { name: true, dealer: { select: dealerSelect } } },
      remedyOffers: { where: { userId, status: { in: VISIBLE } }, orderBy: { createdAt: 'desc' }, select: offerDetailSelect },
    },
  });
  if (!f) throw new VoiceNotFoundError('NOT_FOUND', 'Geri bildirim bulunamadı.');
  if (f.deletedAt) throw new VoiceNotFoundError('VOICE_REMOVED', 'Bu geri bildirim moderasyon kararıyla kaldırıldı.');

  const business = toBusiness(f.qrCode?.dealer);
  const stage = voiceStage({ viewedAt: f.dealerFirstViewedAt, repliedAt: f.dealerRepliedAt });
  const [aiEnabled, ledger, expectation] = await Promise.all([
    isAiInsightsEnabled(),
    ledgerPoints(userId, 'feedback', [f.id]),
    stage === 'replied' ? Promise.resolve(null) : dealerReplyExpectation(business.id),
  ]);

  return {
    key: voiceKey('qr', f.id),
    kind: 'qr',
    id: f.id,
    consumptionId: null,
    business,
    place: f.qrCode?.name?.trim() || null,
    consumption: null,
    voice: {
      rating: f.rating,
      text: f.text?.trim() || null,
      dimensions: null,
      media: mediaUrls(f.media),
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    },
    moderated: false,
    reply: f.dealerReply?.trim() ? { text: f.dealerReply.trim(), at: f.dealerRepliedAt?.toISOString() ?? null } : null,
    stage,
    journey: buildVoiceJourney({
      createdAt: f.createdAt,
      viewedAt: f.dealerFirstViewedAt,
      repliedAt: f.dealerRepliedAt,
      remedies: journeyRemedies(f.remedyOffers),
    }),
    expectation,
    remedies: f.remedyOffers.map(toRemedyDetail),
    analysis: aiEnabled ? customerAnalysis(f) : null,
    reward: ledger.get(f.id) ?? null,
    composer: null,
  };
}

async function getConsumptionDetail(userId: string, consumptionId: string): Promise<VoiceDetail> {
  const c = await prisma.consumption.findFirst({
    where: { id: consumptionId, customerId: userId },
    select: {
      id: true,
      createdAt: true,
      amount: true,
      note: true,
      dealer: { select: dealerSelect },
      product: { select: { name: true, category: { select: { name: true, icon: true } } } },
      review: {
        select: {
          id: true,
          rating: true,
          text: true,
          dimensions: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          dealerReply: true,
          dealerRepliedAt: true,
          remedyOffers: { where: { userId, status: { in: VISIBLE } }, orderBy: { createdAt: 'desc' }, select: offerDetailSelect },
        },
      },
    },
  });
  if (!c) throw new VoiceNotFoundError('NOT_FOUND', 'Tüketim kaydı bulunamadı.');

  const business = toBusiness(c.dealer);
  const review = c.review && !c.review.deletedAt ? c.review : null;
  const moderated = !!c.review?.deletedAt;
  const stage = review ? voiceStage({ repliedAt: review.dealerRepliedAt }) : 'sent';

  const [ledger, expectation, reward] = await Promise.all([
    review ? ledgerPoints(userId, 'review', [review.id]) : Promise.resolve(new Map<string, { points: number; xp: number }>()),
    review && stage !== 'replied' ? dealerReplyExpectation(business.id) : Promise.resolve(null),
    !c.review ? getReviewRewardPreview(userId).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    key: voiceKey('review', c.id),
    kind: 'review',
    id: review?.id ?? null,
    consumptionId: c.id,
    business,
    place: c.product?.name?.trim() || null,
    consumption: {
      createdAt: c.createdAt.toISOString(),
      amount: typeof c.amount === 'number' && c.amount > 0 ? c.amount : null,
      note: c.note?.trim() || null,
      product: c.product
        ? { name: c.product.name, category: c.product.category?.name ?? null, icon: c.product.category?.icon ?? null }
        : null,
    },
    voice: review
      ? {
          rating: review.rating,
          text: review.text?.trim() || null,
          dimensions: normalizeDimensions(review.dimensions),
          media: [],
          createdAt: review.createdAt.toISOString(),
          updatedAt: review.updatedAt.toISOString(),
        }
      : null,
    moderated,
    reply: review?.dealerReply?.trim() ? { text: review.dealerReply.trim(), at: review.dealerRepliedAt?.toISOString() ?? null } : null,
    stage,
    journey: review
      ? buildVoiceJourney({ createdAt: review.createdAt, repliedAt: review.dealerRepliedAt, remedies: journeyRemedies(review.remedyOffers) })
      : [],
    expectation,
    remedies: review ? review.remedyOffers.map(toRemedyDetail) : [],
    analysis: null,
    reward: review ? ledger.get(review.id) ?? null : null,
    composer: moderated ? null : review ? { mode: 'edit', reward: null } : { mode: 'create', reward },
  };
}

export async function getVoiceDetail(userId: string, key: string): Promise<VoiceDetail> {
  const parsed = parseVoiceKey(key);
  if (!parsed) throw new VoiceNotFoundError('NOT_FOUND', 'Kayıt bulunamadı.');
  return parsed.kind === 'qr' ? getQrDetail(userId, parsed.id) : getConsumptionDetail(userId, parsed.id);
}

/* ───────────────────────── Telafi listesi ───────────────────────── */

export const REMEDY_LIST_LIMIT = 50;

export async function listCustomerRemedies(userId: string): Promise<{ items: CustomerRemedyListItem[]; hasMore: boolean }> {
  const rows = await prisma.remedyOffer.findMany({
    where: { userId, status: { in: VISIBLE } },
    // Açık teklifler önce (aksiyon), sonra en yeniler.
    orderBy: [{ createdAt: 'desc' }],
    take: REMEDY_LIST_LIMIT + 1,
    select: {
      ...offerDetailSelect,
      dealer: { select: dealerSelect },
      feedback: { select: { id: true, rating: true, text: true, deletedAt: true } },
      consumptionReview: { select: { consumptionId: true, rating: true, text: true, deletedAt: true } },
    },
  });
  const items = rows.slice(0, REMEDY_LIST_LIMIT).map((o): CustomerRemedyListItem => {
    const d = toRemedyDetail(o);
    const src = o.feedback && !o.feedback.deletedAt
      ? { key: voiceKey('qr', o.feedback.id), rating: o.feedback.rating, text: o.feedback.text }
      : o.consumptionReview && !o.consumptionReview.deletedAt
        ? { key: voiceKey('review', o.consumptionReview.consumptionId), rating: o.consumptionReview.rating, text: o.consumptionReview.text }
        : null;
    return {
      id: d.id,
      status: d.status,
      message: d.message,
      offeredAt: d.offeredAt,
      acceptedAt: d.acceptedAt,
      business: toBusiness(o.dealer),
      options: d.options,
      selectionLabel: d.selectionLabel,
      selectionType: d.selectionType,
      creditedPoints: d.creditedPoints,
      voiceKey: src?.key ?? null,
      source: src ? { rating: src.rating, textPreview: previewText(src.text, 120) } : null,
    };
  });
  // Bekleyenler en üstte; kendi içinde en yeni önce.
  items.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  return { items, hasMore: rows.length > REMEDY_LIST_LIMIT };
}
