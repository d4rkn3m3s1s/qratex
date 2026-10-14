/**
 * Bayi Gelen Kutusu — sunucu servisi (QR geri bildirimleri + tüketim yorumları tek liste).
 *
 * Kapsam: her sorgu çözülmüş bayi kimliğiyle daraltılır (`qrCode.dealerId` /
 * `consumption.dealerId`); moderasyonla kaldırılan kayıt (`deletedAt`) görünmez.
 *
 * Durum modeli (şema değişikliği olmadan, mevcut alanlarla):
 *   - "Yeni" / "Yanıtlandı" → `dealerReply` / `dealerRepliedAt`
 *   - "Çözüldü", atama, SLA vadesi → kayda bağlı **vaka** (`Incident`, `metadata.feedbackId`
 *     ya da `metadata.consumptionReviewId`). Gelen kutusunun açtığı vakalar `type='inbox_case'`;
 *     otomatik kural (`FEEDBACK`) ve SLA aşımı (`negative_feedback_sla_breach`) olayları da aynı
 *     bağlantıyla okunur ve kapatılır (kapalı döngü: Vakalar sekmesiyle aynı kayıt).
 *
 * Yanıt: ilk yanıtta müşteriye bildirim + e-posta (bir kez); düzenleme sessizdir. Yazım
 * iyimser eşzamanlılıkla yapılır: bayinin gördüğü yanıt (`expectedReply`) değişmişse — ör.
 * otomatik yanıt kuralı araya girdiyse — 409 döner ve kimsenin yanıtı ezilmez.
 */
import { servedFeedbackMedia } from '@/lib/storage/served-url';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runAfterResponse } from '@/lib/run-after';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { parsePositiveIntEnv } from '@/lib/safe-env-number';
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import { validateAssignee } from '@/lib/dealer/assignee';
import { describeRemedyOffer, REMEDY_BLOCKING_STATUSES } from '@/lib/remedy-offer-service';
import {
  INBOX_CASE_TYPE,
  LINKED_CASE_TYPES,
  OPEN_CASE_STATUSES,
  buildCaseIndex,
  caseSets,
  computeSla,
  decodeInboxCursor,
  deriveStatus,
  displayName,
  hasMedia,
  inboxCursorWhere,
  inboxKey,
  isNegativeItem,
  last4,
  median,
  mergeInboxPages,
  normalizeActionSuggestions,
  normalizeDimensions,
  normalizeMedia,
  normalizeTopics,
  parseInboxKey,
  previewText,
  priorityOf,
  rangeDays,
  ratio,
  roundRating,
  sourcesFor,
  unifiedSentiment,
  CHURN_THRESHOLD,
  URGENT_THRESHOLD,
  type CaseIndexEntry,
} from './core';
import type {
  InboxAction,
  InboxActionResult,
  InboxCase,
  InboxDetail,
  InboxFilters,
  InboxHistoryItem,
  InboxListItem,
  InboxListPage,
  InboxMeta,
  InboxPerson,
  InboxRemedyStatus,
  InboxReplyResult,
  InboxSource,
  InboxSuggestResult,
  InboxSummary,
  InboxTemplate,
} from './types';

/* ───────────────────────── Ayarlar ───────────────────────── */

export const INBOX_PAGE_SIZE = 25;
export const INBOX_PAGE_MAX = 50;
export const INBOX_BULK_MAX = 50;
export const INBOX_EXPORT_MAX = 5000;
const CASE_SCAN_LIMIT = 3000;
const REPLY_TIME_SAMPLE = 2000;

/** SLA hedefleri sunucudan (olumsuz: SLA işiyle aynı ortam değişkeni). */
export function inboxSlaHours(): { negative: number; default: number } {
  return {
    negative: parsePositiveIntEnv(process.env.NEGATIVE_FEEDBACK_SLA_HOURS, 24),
    default: parsePositiveIntEnv(process.env.INBOX_SLA_HOURS, 72),
  };
}

/* ───────────────────────── Hatalar ───────────────────────── */

export type InboxErrorCode = 'NOT_FOUND' | 'REPLY_CONFLICT' | 'INVALID_ASSIGNEE' | 'VALIDATION';

export class InboxError extends Error {
  readonly code: InboxErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(code: InboxErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'InboxError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/* ───────────────────────── Önbellek sürümü ───────────────────────── */

function versionKey(dealerId: string): string {
  return `dealer-inbox:ver:${dealerId}`;
}

/** Yazımdan sonra özet önbelleğini bayatlatır (anahtar sürümü değişir). */
export async function bumpInboxVersion(dealerId: string): Promise<void> {
  await redisSetJson(versionKey(dealerId), Date.now(), 7 * 86_400);
}

/* ───────────────────────── Kapsam yardımcıları ───────────────────────── */

function fbBase(dealerId: string): Prisma.FeedbackWhereInput {
  return { deletedAt: null, qrCode: { dealerId } };
}

function crBase(dealerId: string): Prisma.ConsumptionReviewWhereInput {
  return { deletedAt: null, consumption: { dealerId } };
}

const FB_UNREPLIED: Prisma.FeedbackWhereInput = { dealerReply: null, dealerRepliedAt: null };
const FB_REPLIED: Prisma.FeedbackWhereInput = { OR: [{ dealerReply: { not: null } }, { dealerRepliedAt: { not: null } }] };
const CR_UNREPLIED: Prisma.ConsumptionReviewWhereInput = { dealerReply: null, dealerRepliedAt: null };
const CR_REPLIED: Prisma.ConsumptionReviewWhereInput = {
  OR: [{ dealerReply: { not: null } }, { dealerRepliedAt: { not: null } }],
};

function negativeWhere(): { OR: Array<Record<string, unknown>> } {
  return { OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }] };
}

function sentimentWhere(sentiment: InboxFilters['sentiment'], analyzedField: 'aiProcessedAt' | 'analyzedAt') {
  switch (sentiment) {
    case 'negative':
      return { OR: [{ sentiment: 'negative' }, { sentiment: null, rating: { lte: 2 } }] };
    case 'neutral':
      return { OR: [{ sentiment: 'neutral' }, { sentiment: null, rating: 3 }] };
    case 'positive':
      return { OR: [{ sentiment: 'positive' }, { sentiment: null, rating: { gte: 4 } }] };
    case 'pending':
      return { sentiment: null, [analyzedField]: null, text: { not: null } };
    default:
      return null;
  }
}

function rangeStart(range: InboxFilters['range'], now: Date): Date | null {
  const days = rangeDays(range);
  if (!days) return null;
  return istanbulDayStart(addDays(istanbulDay(now), -(days - 1)));
}

/* ───────────────────────── Vaka dizini ───────────────────────── */

export async function loadCaseIndex(dealerId: string): Promise<Map<string, CaseIndexEntry>> {
  const rows = await prisma.incident.findMany({
    where: { dealerId, type: { in: [...LINKED_CASE_TYPES] } },
    orderBy: { createdAt: 'desc' },
    take: CASE_SCAN_LIMIT,
    select: { id: true, status: true, assignedToId: true, resolvedAt: true, createdAt: true, metadata: true },
  });
  return buildCaseIndex(rows);
}

/** Yalnız verilen kayıtlara bağlı vakalar (detay/işlem için; tam tarama yapmaz). */
async function loadCasesFor(dealerId: string, keys: ReadonlyArray<{ source: InboxSource; id: string }>) {
  if (keys.length === 0) return new Map<string, CaseIndexEntry>();
  const rows = await prisma.incident.findMany({
    where: {
      dealerId,
      type: { in: [...LINKED_CASE_TYPES] },
      OR: keys.map((k) => ({
        metadata: { path: [k.source === 'qr' ? 'feedbackId' : 'consumptionReviewId'], equals: k.id },
      })),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, status: true, assignedToId: true, resolvedAt: true, createdAt: true, metadata: true },
  });
  return buildCaseIndex(rows);
}

async function personNames(ids: ReadonlyArray<string>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, displayName(u.name) ?? 'Ekip üyesi']));
}

function caseDto(entry: CaseIndexEntry | undefined, names: Map<string, string>): InboxCase | null {
  if (!entry) return null;
  return {
    id: entry.id,
    status: entry.status,
    assignee: entry.assignedToId ? { id: entry.assignedToId, name: names.get(entry.assignedToId) ?? 'Ekip üyesi' } : null,
    resolvedAt: entry.resolvedAt ? entry.resolvedAt.toISOString() : null,
  };
}

function remedyStatusOf(offers: ReadonlyArray<{ status: string }> | undefined): InboxRemedyStatus | null {
  const s = offers?.[0]?.status;
  return s === 'awaiting_dealer_approval' || s === 'pending' || s === 'accepted' || s === 'expired' || s === 'rejected'
    ? s
    : null;
}

/* ───────────────────────── Liste ───────────────────────── */

export interface ListInboxOptions {
  cursor?: string | null;
  limit?: number;
  now?: Date;
  /** Önceden yüklenmiş vaka dizini (dışa aktarmada tekrar taramamak için). */
  caseIndex?: Map<string, CaseIndexEntry>;
  /** Önizleme yerine tam metin (dışa aktarma). */
  fullText?: boolean;
}

const latestRemedy = {
  orderBy: { createdAt: 'desc' as const },
  take: 1,
  select: { status: true },
};

function buildFeedbackWhere(
  dealerId: string,
  f: InboxFilters,
  sets: ReturnType<typeof caseSets>,
  cursorWhere: Record<string, unknown> | null,
  now: Date
): Prisma.FeedbackWhereInput {
  const and: Prisma.FeedbackWhereInput[] = [fbBase(dealerId)];
  if (f.status === 'new') and.push(FB_UNREPLIED, { id: { notIn: sets.resolved.qr } });
  else if (f.status === 'replied') and.push(FB_REPLIED, { id: { notIn: sets.resolved.qr } });
  else if (f.status === 'resolved') and.push({ id: { in: sets.resolved.qr } });
  if (f.rating !== 'all') and.push({ rating: Number(f.rating) });
  const sw = sentimentWhere(f.sentiment, 'aiProcessedAt');
  if (sw) and.push(sw as Prisma.FeedbackWhereInput);
  if (f.signal === 'urgent') and.push({ urgency: { gte: URGENT_THRESHOLD } });
  else if (f.signal === 'churn') and.push({ churnRisk: { gte: CHURN_THRESHOLD } });
  else if (f.signal === 'trust') and.push({ OR: [{ trustFlagged: true }, { isToxic: true }] });
  if (f.assigned === 'me') and.push({ id: { in: sets.assignedToMe.qr } });
  else if (f.assigned === 'unassigned') and.push({ id: { notIn: sets.assignedAny.qr } });
  const start = rangeStart(f.range, now);
  if (start) and.push({ createdAt: { gte: start } });
  if (f.qr) and.push({ qrCodeId: f.qr });
  if (f.q) {
    and.push({
      OR: [
        { text: { contains: f.q, mode: 'insensitive' } },
        { user: { name: { contains: f.q, mode: 'insensitive' } } },
        { qrCode: { name: { contains: f.q, mode: 'insensitive' } } },
      ],
    });
  }
  if (cursorWhere) and.push(cursorWhere as Prisma.FeedbackWhereInput);
  return { AND: and };
}

function buildReviewWhere(
  dealerId: string,
  f: InboxFilters,
  sets: ReturnType<typeof caseSets>,
  cursorWhere: Record<string, unknown> | null,
  now: Date
): Prisma.ConsumptionReviewWhereInput {
  const and: Prisma.ConsumptionReviewWhereInput[] = [crBase(dealerId)];
  if (f.status === 'new') and.push(CR_UNREPLIED, { id: { notIn: sets.resolved.consumption } });
  else if (f.status === 'replied') and.push(CR_REPLIED, { id: { notIn: sets.resolved.consumption } });
  else if (f.status === 'resolved') and.push({ id: { in: sets.resolved.consumption } });
  if (f.rating !== 'all') and.push({ rating: Number(f.rating) });
  const sw = sentimentWhere(f.sentiment, 'analyzedAt');
  if (sw) and.push(sw as Prisma.ConsumptionReviewWhereInput);
  if (f.signal === 'churn') and.push({ churnRisk: { gte: CHURN_THRESHOLD } });
  if (f.assigned === 'me') and.push({ id: { in: sets.assignedToMe.consumption } });
  else if (f.assigned === 'unassigned') and.push({ id: { notIn: sets.assignedAny.consumption } });
  const start = rangeStart(f.range, now);
  if (start) and.push({ createdAt: { gte: start } });
  if (f.q) {
    and.push({
      OR: [
        { text: { contains: f.q, mode: 'insensitive' } },
        { customer: { name: { contains: f.q, mode: 'insensitive' } } },
        { consumption: { product: { name: { contains: f.q, mode: 'insensitive' } } } },
      ],
    });
  }
  if (cursorWhere) and.push(cursorWhere as Prisma.ConsumptionReviewWhereInput);
  return { AND: and };
}

export async function listInbox(
  dealerId: string,
  actorId: string,
  filters: InboxFilters,
  opts: ListInboxOptions = {}
): Promise<InboxListPage> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? INBOX_PAGE_SIZE, 1), opts.fullText ? 1000 : INBOX_PAGE_MAX);
  const cursor = decodeInboxCursor(opts.cursor ?? null);
  const index = opts.caseIndex ?? (await loadCaseIndex(dealerId));
  const sets = caseSets(index, actorId);
  const which = sourcesFor(filters);
  const dir = filters.sort === 'newest' ? 'desc' : 'asc';
  const sla = inboxSlaHours();
  const previewMax = opts.fullText ? 5000 : 220;

  const [feedbacks, reviews] = await Promise.all([
    which.qr
      ? prisma.feedback.findMany({
          where: buildFeedbackWhere(dealerId, filters, sets, inboxCursorWhere(cursor, 'qr', filters.sort), now),
          orderBy: [{ createdAt: dir }, { id: dir }],
          take: limit + 1,
          select: {
            id: true,
            rating: true,
            npsScore: true,
            text: true,
            createdAt: true,
            dealerReply: true,
            dealerRepliedAt: true,
            dealerFirstViewedAt: true,
            sentiment: true,
            aiProcessedAt: true,
            urgency: true,
            churnRisk: true,
            trustFlagged: true,
            isToxic: true,
            topics: true,
            media: true,
            userId: true,
            user: { select: { name: true } },
            qrCode: { select: { name: true } },
            remedyOffers: latestRemedy,
          },
        })
      : Promise.resolve([]),
    which.consumption
      ? prisma.consumptionReview.findMany({
          where: buildReviewWhere(dealerId, filters, sets, inboxCursorWhere(cursor, 'cr', filters.sort), now),
          orderBy: [{ createdAt: dir }, { id: dir }],
          take: limit + 1,
          select: {
            id: true,
            rating: true,
            text: true,
            createdAt: true,
            dealerReply: true,
            dealerRepliedAt: true,
            sentiment: true,
            analyzedAt: true,
            churnRisk: true,
            customer: { select: { name: true } },
            consumption: { select: { product: { select: { name: true } } } },
            remedyOffers: latestRemedy,
          },
        })
      : Promise.resolve([]),
  ]);

  const qrRows: InboxListItem[] = feedbacks.map((f) => {
    const key = inboxKey('qr', f.id);
    const entry = index.get(key);
    const replied = !!(f.dealerReply || f.dealerRepliedAt);
    const resolved = entry?.status === 'resolved';
    const hasText = !!f.text?.trim();
    const s = unifiedSentiment({ sentiment: f.sentiment, rating: f.rating, hasText, analyzed: !!f.aiProcessedAt });
    return {
      key,
      source: 'qr',
      id: f.id,
      createdAt: f.createdAt.toISOString(),
      rating: f.rating,
      npsScore: f.npsScore ?? null,
      textPreview: previewText(f.text, previewMax),
      customerName: f.userId ? displayName(f.user?.name) : null,
      anonymous: !f.userId,
      contextLabel: f.qrCode?.name?.trim() || null,
      status: deriveStatus({ replied, resolved }),
      repliedAt: f.dealerRepliedAt?.toISOString() ?? null,
      viewedAt: f.dealerFirstViewedAt?.toISOString() ?? null,
      sentiment: s.sentiment,
      sentimentBasis: s.basis,
      urgent: (f.urgency ?? 0) >= URGENT_THRESHOLD,
      churnHigh: (f.churnRisk ?? 0) >= CHURN_THRESHOLD,
      trustFlagged: !!f.trustFlagged,
      toxic: !!f.isToxic,
      topics: normalizeTopics(f.topics),
      hasMedia: hasMedia(f.media),
      priority: priorityOf({ rating: f.rating, sentiment: f.sentiment, urgency: f.urgency, churnRisk: f.churnRisk }),
      sla: computeSla({
        createdAt: f.createdAt,
        negative: isNegativeItem(f.rating, f.sentiment),
        closed: replied || resolved,
        now,
        hours: sla,
      }),
      case: null,
      remedyStatus: remedyStatusOf(f.remedyOffers),
    };
  });

  const crRows: InboxListItem[] = reviews.map((r) => {
    const key = inboxKey('consumption', r.id);
    const entry = index.get(key);
    const replied = !!(r.dealerReply || r.dealerRepliedAt);
    const resolved = entry?.status === 'resolved';
    const hasText = !!r.text?.trim();
    const s = unifiedSentiment({ sentiment: r.sentiment, rating: r.rating, hasText, analyzed: !!r.analyzedAt });
    return {
      key,
      source: 'consumption',
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      rating: r.rating,
      npsScore: null,
      textPreview: previewText(r.text, previewMax),
      customerName: displayName(r.customer?.name),
      anonymous: false,
      contextLabel: r.consumption?.product?.name?.trim() || null,
      status: deriveStatus({ replied, resolved }),
      repliedAt: r.dealerRepliedAt?.toISOString() ?? null,
      viewedAt: null,
      sentiment: s.sentiment,
      sentimentBasis: s.basis,
      urgent: false,
      churnHigh: (r.churnRisk ?? 0) >= CHURN_THRESHOLD,
      trustFlagged: false,
      toxic: false,
      topics: [],
      hasMedia: false,
      priority: priorityOf({ rating: r.rating, sentiment: r.sentiment, churnRisk: r.churnRisk }),
      sla: computeSla({
        createdAt: r.createdAt,
        negative: isNegativeItem(r.rating, r.sentiment),
        closed: replied || resolved,
        now,
        hours: sla,
      }),
      case: null,
      remedyStatus: remedyStatusOf(r.remedyOffers),
    };
  });

  const page = mergeInboxPages(
    [
      { rows: qrRows, exhausted: feedbacks.length <= limit },
      { rows: crRows, exhausted: reviews.length <= limit },
    ],
    limit,
    filters.sort
  );

  const assigneeIds = page.items
    .map((i) => index.get(i.key)?.assignedToId)
    .filter((v): v is string => typeof v === 'string');
  const names = await personNames(assigneeIds);
  for (const item of page.items) item.case = caseDto(index.get(item.key), names);
  return page;
}

/* ───────────────────────── Özet (KPI) ───────────────────────── */

export interface InboxPeriod {
  from: Date;
  to: Date;
}

/** Varsayılan dönem: son 30 İstanbul günü (bugün dahil). */
export function defaultInboxPeriod(now = new Date()): InboxPeriod {
  const today = istanbulDay(now);
  return { from: istanbulDayStart(addDays(today, -29)), to: istanbulDayStart(addDays(today, 1)) };
}

function inRange<T extends object>(base: T, from: Date, to: Date): { AND: [T, { createdAt: { gte: Date; lt: Date } }] } {
  return { AND: [base, { createdAt: { gte: from, lt: to } }] };
}

async function computeSummary(dealerId: string, period: InboxPeriod, now: Date): Promise<InboxSummary> {
  const span = period.to.getTime() - period.from.getTime();
  const prev: InboxPeriod = { from: new Date(period.from.getTime() - span), to: period.from };
  const index = await loadCaseIndex(dealerId);
  const sets = caseSets(index, '');
  const sla = inboxSlaHours();
  const negCut = new Date(now.getTime() - sla.negative * 3_600_000);
  const defCut = new Date(now.getTime() - sla.default * 3_600_000);
  const overdueWhere = {
    OR: [{ AND: [negativeWhere(), { createdAt: { lt: negCut } }] }, { createdAt: { lt: defCut } }],
  };

  const fb = fbBase(dealerId);
  const cr = crBase(dealerId);
  const fbNotResolved: Prisma.FeedbackWhereInput = { id: { notIn: sets.resolved.qr } };
  const crNotResolved: Prisma.ConsumptionReviewWhereInput = { id: { notIn: sets.resolved.consumption } };

  const [
    fbAgg,
    crAgg,
    fbAggPrev,
    crAggPrev,
    fbDist,
    crDist,
    fbReplied,
    crReplied,
    fbRepliedPrev,
    crRepliedPrev,
    fbNeg,
    crNeg,
    fbNegPrev,
    crNegPrev,
    fbTimes,
    crTimes,
    fbNew,
    crNew,
    fbRepliedAll,
    crRepliedAll,
    fbResolved,
    crResolved,
    fbOverdue,
    crOverdue,
  ] = await Promise.all([
    prisma.feedback.aggregate({ where: inRange(fb, period.from, period.to), _avg: { rating: true }, _count: { _all: true } }),
    prisma.consumptionReview.aggregate({ where: inRange(cr, period.from, period.to), _avg: { rating: true }, _count: { _all: true } }),
    prisma.feedback.aggregate({ where: inRange(fb, prev.from, prev.to), _avg: { rating: true }, _count: { _all: true } }),
    prisma.consumptionReview.aggregate({ where: inRange(cr, prev.from, prev.to), _avg: { rating: true }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ['rating'], where: inRange(fb, period.from, period.to), _count: { _all: true } }),
    prisma.consumptionReview.groupBy({ by: ['rating'], where: inRange(cr, period.from, period.to), _count: { _all: true } }),
    prisma.feedback.count({ where: { AND: [inRange(fb, period.from, period.to), FB_REPLIED] } }),
    prisma.consumptionReview.count({ where: { AND: [inRange(cr, period.from, period.to), CR_REPLIED] } }),
    prisma.feedback.count({ where: { AND: [inRange(fb, prev.from, prev.to), FB_REPLIED] } }),
    prisma.consumptionReview.count({ where: { AND: [inRange(cr, prev.from, prev.to), CR_REPLIED] } }),
    prisma.feedback.count({ where: { AND: [inRange(fb, period.from, period.to), negativeWhere()] } }),
    prisma.consumptionReview.count({ where: { AND: [inRange(cr, period.from, period.to), negativeWhere()] } }),
    prisma.feedback.count({ where: { AND: [inRange(fb, prev.from, prev.to), negativeWhere()] } }),
    prisma.consumptionReview.count({ where: { AND: [inRange(cr, prev.from, prev.to), negativeWhere()] } }),
    prisma.feedback.findMany({
      where: { AND: [inRange(fb, period.from, period.to), { dealerRepliedAt: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      take: REPLY_TIME_SAMPLE,
      select: { createdAt: true, dealerRepliedAt: true },
    }),
    prisma.consumptionReview.findMany({
      where: { AND: [inRange(cr, period.from, period.to), { dealerRepliedAt: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      take: REPLY_TIME_SAMPLE,
      select: { createdAt: true, dealerRepliedAt: true },
    }),
    prisma.feedback.count({ where: { AND: [fb, FB_UNREPLIED, fbNotResolved] } }),
    prisma.consumptionReview.count({ where: { AND: [cr, CR_UNREPLIED, crNotResolved] } }),
    prisma.feedback.count({ where: { AND: [fb, FB_REPLIED, fbNotResolved] } }),
    prisma.consumptionReview.count({ where: { AND: [cr, CR_REPLIED, crNotResolved] } }),
    sets.resolved.qr.length ? prisma.feedback.count({ where: { AND: [fb, { id: { in: sets.resolved.qr } }] } }) : Promise.resolve(0),
    sets.resolved.consumption.length
      ? prisma.consumptionReview.count({ where: { AND: [cr, { id: { in: sets.resolved.consumption } }] } })
      : Promise.resolve(0),
    prisma.feedback.count({ where: { AND: [fb, FB_UNREPLIED, fbNotResolved, overdueWhere as Prisma.FeedbackWhereInput] } }),
    prisma.consumptionReview.count({
      where: { AND: [cr, CR_UNREPLIED, crNotResolved, overdueWhere as Prisma.ConsumptionReviewWhereInput] },
    }),
  ]);

  const avgOf = (a: typeof fbAgg, b: typeof crAgg) => {
    const n = a._count._all + b._count._all;
    if (n === 0) return { value: null, n };
    const sum = (a._avg.rating ?? 0) * a._count._all + (b._avg.rating ?? 0) * b._count._all;
    return { value: roundRating(sum / n), n };
  };
  const cur = avgOf(fbAgg, crAgg);
  const before = avgOf(fbAggPrev, crAggPrev);

  const distribution: InboxSummary['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const row of [...fbDist, ...crDist]) {
    const k = String(row.rating) as keyof typeof distribution;
    if (k in distribution) distribution[k] += row._count._all;
  }

  const seconds = [...fbTimes, ...crTimes]
    .map((r) => (r.dealerRepliedAt ? (r.dealerRepliedAt.getTime() - r.createdAt.getTime()) / 1000 : NaN))
    .filter((s) => Number.isFinite(s) && s >= 0);
  const med = median(seconds);

  return {
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      compareFrom: prev.from.toISOString(),
      compareTo: prev.to.toISOString(),
    },
    pending: fbNew + crNew,
    overdue: fbOverdue + crOverdue,
    avgRating: { value: cur.value, previous: before.value, n: cur.n },
    replyRate: { value: ratio(fbReplied + crReplied, cur.n), previous: ratio(fbRepliedPrev + crRepliedPrev, before.n), n: cur.n },
    medianReplySeconds: { value: med === null ? null : Math.round(med), n: seconds.length },
    negativeShare: { value: ratio(fbNeg + crNeg, cur.n), previous: ratio(fbNegPrev + crNegPrev, before.n), n: cur.n },
    distribution,
    statusCounts: { new: fbNew + crNew, replied: fbRepliedAll + crRepliedAll, resolved: fbResolved + crResolved },
    sources: { qr: fbNew + fbRepliedAll + fbResolved, consumption: crNew + crRepliedAll + crResolved },
    asOf: now.toISOString(),
  };
}

/** KPI özeti — Redis'te 60 sn (yazımlar sürümü değiştirir). Redis yoksa doğrudan hesaplar. */
export async function getInboxSummary(dealerId: string, period: InboxPeriod, now = new Date()): Promise<InboxSummary> {
  const ver = (await redisGetJson<number>(versionKey(dealerId))) ?? 0;
  const key = `dealer-inbox:summary:${dealerId}:${ver}:${period.from.toISOString()}:${period.to.toISOString()}`;
  const cached = await redisGetJson<InboxSummary>(key);
  if (cached) return cached;
  const fresh = await computeSummary(dealerId, period, now);
  await redisSetJson(key, fresh, 60);
  return fresh;
}

/* ───────────────────────── Meta (ekip, QR, şablonlar) ───────────────────────── */

export async function getInboxMeta(dealerId: string, actorId: string): Promise<InboxMeta> {
  const [dealer, actor, staff, qrCodes, rules, remedyEnabled, aiEnabled] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, select: { name: true, businessName: true, defaultReplyTemplate: true } }),
    actorId === dealerId ? Promise.resolve(null) : prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
    prisma.dealerStaff.findMany({
      where: { dealerId, isActive: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { user: { select: { id: true, name: true } } },
    }),
    prisma.qRCode.findMany({
      where: { dealerId, archivedAt: null },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true },
    }),
    prisma.autoReplyRule.findMany({
      where: { dealerId, isActive: true, action: 'reply' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: { id: true, name: true, template: true },
    }),
    isRemedyModuleEnabled(),
    isInboxAiEnabled(dealerId),
  ]);

  const businessName = displayName(dealer?.businessName) ?? displayName(dealer?.name) ?? 'İşletme';
  const assignees: InboxPerson[] = [
    { id: dealerId, name: `${displayName(dealer?.name) ?? businessName} (işletme sahibi)` },
    ...staff
      .filter((s) => s.user)
      .map((s) => ({ id: s.user.id, name: displayName(s.user.name) ?? 'Personel' })),
  ];

  const templates: InboxTemplate[] = [];
  const own = dealer?.defaultReplyTemplate?.trim();
  if (own) templates.push({ id: 'default', label: 'Varsayılan şablonum', body: own.slice(0, 2000) });
  for (const r of rules) {
    const body = r.template?.trim();
    if (body) templates.push({ id: `rule-${r.id}`, label: `Otomatik yanıt: ${r.name}`.slice(0, 80), body: body.slice(0, 2000) });
  }

  const me: InboxPerson =
    actorId === dealerId
      ? { id: dealerId, name: assignees[0].name }
      : { id: actorId, name: displayName(actor?.name) ?? 'Ben' };

  return {
    assignees,
    qrCodes: qrCodes.map((q) => ({ id: q.id, name: q.name })),
    templates,
    sla: (() => {
      const h = inboxSlaHours();
      return { negativeHours: h.negative, defaultHours: h.default };
    })(),
    remedyEnabled,
    aiEnabled,
    business: { name: businessName },
    me,
  };
}

async function isRemedyModuleEnabled(): Promise<boolean> {
  try {
    const { getModuleControls } = await import('@/lib/module-gate');
    const controls = (await getModuleControls()) as Record<string, boolean | undefined>;
    return controls.remedy_offers !== false;
  } catch {
    return false;
  }
}

async function isInboxAiEnabled(dealerId: string): Promise<boolean> {
  try {
    const [{ isAIConfigured }, { isDealerAiEnabled }] = await Promise.all([
      import('@/lib/ai-engine'),
      import('@/lib/ai-policy'),
    ]);
    if (!isAIConfigured()) return false;
    return await isDealerAiEnabled(dealerId);
  } catch {
    return false;
  }
}

/* ───────────────────────── Detay ───────────────────────── */

const remedySelect = {
  orderBy: { createdAt: 'desc' as const },
  take: 5,
  select: {
    id: true,
    status: true,
    createdAt: true,
    acceptedAt: true,
    options: true,
    selectedType: true,
    selectedValue: true,
  },
};

type RemedyRow = {
  id: string;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  options: unknown;
  selectedType: string | null;
  selectedValue: string | null;
};

function remedyBriefs(rows: RemedyRow[]) {
  return rows.map((r) => ({
    id: r.id,
    status: (remedyStatusOf([r]) ?? 'pending') as InboxRemedyStatus,
    createdAt: r.createdAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    selectionLabel: describeRemedyOffer(r).selectionLabel,
  }));
}

function remedyGate(
  enabled: boolean,
  anonymous: boolean,
  rows: RemedyRow[]
): InboxDetail['remedy'] {
  if (!enabled) return { allowed: false, reason: 'module_off' };
  if (anonymous) return { allowed: false, reason: 'anonymous' };
  const blocking = rows.find((r) => (REMEDY_BLOCKING_STATUSES as readonly string[]).includes(r.status));
  if (blocking) return { allowed: false, reason: blocking.status === 'accepted' ? 'already_remedied' : 'open_offer' };
  return { allowed: true, reason: null };
}

async function customerContext(
  dealerId: string,
  customerId: string,
  excludeKey: string
): Promise<InboxDetail['customer']> {
  const [visits, fbAgg, crAgg, firstVisit, firstFb, recentFb, recentCr] = await Promise.all([
    prisma.consumption.count({ where: { dealerId, customerId } }),
    prisma.feedback.aggregate({ where: { AND: [fbBase(dealerId), { userId: customerId }] }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.consumptionReview.aggregate({
      where: { AND: [crBase(dealerId), { customerId }] },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.consumption.findFirst({ where: { dealerId, customerId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.feedback.findFirst({
      where: { AND: [fbBase(dealerId), { userId: customerId }] },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.feedback.findMany({
      where: { AND: [fbBase(dealerId), { userId: customerId }] },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, rating: true, text: true, createdAt: true },
    }),
    prisma.consumptionReview.findMany({
      where: { AND: [crBase(dealerId), { customerId }] },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, rating: true, text: true, createdAt: true },
    }),
  ]);
  const voices = fbAgg._count._all + crAgg._count._all;
  const sum = (fbAgg._avg.rating ?? 0) * fbAgg._count._all + (crAgg._avg.rating ?? 0) * crAgg._count._all;
  const recent: InboxHistoryItem[] = [
    ...recentFb.map((r) => ({ key: inboxKey('qr', r.id), source: 'qr' as const, createdAt: r.createdAt, rating: r.rating, text: r.text })),
    ...recentCr.map((r) => ({
      key: inboxKey('consumption', r.id),
      source: 'consumption' as const,
      createdAt: r.createdAt,
      rating: r.rating,
      text: r.text,
    })),
  ]
    .filter((r) => r.key !== excludeKey)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((r) => ({
      key: r.key,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      rating: r.rating,
      textPreview: previewText(r.text, 140),
    }));
  const firsts = [firstVisit?.createdAt, firstFb?.createdAt].filter((d): d is Date => d instanceof Date);
  const firstSeen = firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null;
  return {
    visits,
    voices,
    avgRating: voices > 0 ? roundRating(sum / voices) : null,
    firstSeenAt: firstSeen?.toISOString() ?? null,
    recent,
  };
}

async function autoReplyHint(
  dealerId: string,
  item: { rating: number; sentiment: string | null; text: string | null; isToxic: boolean; trustFlagged: boolean }
): Promise<InboxDetail['autoReply']> {
  if (item.isToxic || item.trustFlagged) return null;
  const rules = await prisma.autoReplyRule.findMany({
    where: { dealerId, isActive: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: { name: true, action: true, condition: true },
  });
  if (rules.length === 0) return null;
  const { matchesAutoReplyCondition } = await import('@/lib/auto-reply-engine');
  // Motorla aynı kural: yalnız ilk eşleşen kural çalışır; o kural "yanıt" ise uyarı verilir.
  const rule = rules.find((r) =>
    matchesAutoReplyCondition(r.condition as unknown as Parameters<typeof matchesAutoReplyCondition>[0], item)
  );
  return rule && rule.action === 'reply' ? { ruleName: rule.name } : null;
}

export async function getInboxDetail(dealerId: string, actorId: string, key: string, now = new Date()): Promise<InboxDetail> {
  const parsed = parseInboxKey(key);
  if (!parsed) throw new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
  const sla = inboxSlaHours();
  const [cases, remedyEnabled] = await Promise.all([loadCasesFor(dealerId, [parsed]), isRemedyModuleEnabled()]);
  const entry = cases.get(inboxKey(parsed.source, parsed.id));
  const names = await personNames(entry?.assignedToId ? [entry.assignedToId] : []);

  if (parsed.source === 'qr') {
    const f = await prisma.feedback.findFirst({
      where: { AND: [fbBase(dealerId), { id: parsed.id }] },
      select: {
        id: true,
        rating: true,
        npsScore: true,
        text: true,
        media: true,
        createdAt: true,
        dealerReply: true,
        dealerRepliedAt: true,
        dealerFirstViewedAt: true,
        sentiment: true,
        aiProcessedAt: true,
        intent: true,
        urgency: true,
        churnRisk: true,
        trustFlagged: true,
        trustReason: true,
        isToxic: true,
        topics: true,
        actionSuggestions: true,
        userId: true,
        user: { select: { name: true } },
        qrCode: { select: { name: true } },
        remedyOffers: remedySelect,
      },
    });
    if (!f) throw new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
    const replied = !!(f.dealerReply || f.dealerRepliedAt);
    const resolved = entry?.status === 'resolved';
    const hasText = !!f.text?.trim();
    const s = unifiedSentiment({ sentiment: f.sentiment, rating: f.rating, hasText, analyzed: !!f.aiProcessedAt });
    const itemKey = inboxKey('qr', f.id);
    const [customer, autoReply] = await Promise.all([
      f.userId ? customerContext(dealerId, f.userId, itemKey) : Promise.resolve(null),
      replied ? Promise.resolve(null) : autoReplyHint(dealerId, f),
    ]);
    return {
      key: itemKey,
      source: 'qr',
      id: f.id,
      createdAt: f.createdAt.toISOString(),
      rating: f.rating,
      npsScore: f.npsScore ?? null,
      textPreview: previewText(f.text),
      text: f.text?.trim() || null,
      reply: f.dealerReply ?? null,
      customerName: f.userId ? displayName(f.user?.name) : null,
      anonymous: !f.userId,
      contextLabel: f.qrCode?.name?.trim() || null,
      status: deriveStatus({ replied, resolved }),
      repliedAt: f.dealerRepliedAt?.toISOString() ?? null,
      viewedAt: f.dealerFirstViewedAt?.toISOString() ?? null,
      sentiment: s.sentiment,
      sentimentBasis: s.basis,
      urgent: (f.urgency ?? 0) >= URGENT_THRESHOLD,
      churnHigh: (f.churnRisk ?? 0) >= CHURN_THRESHOLD,
      trustFlagged: !!f.trustFlagged,
      toxic: !!f.isToxic,
      topics: normalizeTopics(f.topics, 8),
      hasMedia: hasMedia(f.media),
      media: normalizeMedia(servedFeedbackMedia(f.id, f.media)),
      priority: priorityOf({ rating: f.rating, sentiment: f.sentiment, urgency: f.urgency, churnRisk: f.churnRisk }),
      sla: computeSla({ createdAt: f.createdAt, negative: isNegativeItem(f.rating, f.sentiment), closed: replied || resolved, now, hours: sla }),
      case: caseDto(entry, names),
      remedyStatus: remedyStatusOf(f.remedyOffers),
      dimensions: [],
      intent: f.intent ?? null,
      urgency: f.urgency ?? null,
      churnRisk: f.churnRisk ?? null,
      trustReason: f.trustFlagged ? f.trustReason?.slice(0, 200) ?? null : null,
      actionSuggestions: normalizeActionSuggestions(f.actionSuggestions),
      analyzedAt: f.aiProcessedAt?.toISOString() ?? null,
      amount: null,
      cardLast4: null,
      categoryName: null,
      customer,
      remedies: remedyBriefs(f.remedyOffers),
      remedy: remedyGate(remedyEnabled, !f.userId, f.remedyOffers),
      autoReply,
    };
  }

  const r = await prisma.consumptionReview.findFirst({
    where: { AND: [crBase(dealerId), { id: parsed.id }] },
    select: {
      id: true,
      rating: true,
      text: true,
      dimensions: true,
      createdAt: true,
      dealerReply: true,
      dealerRepliedAt: true,
      sentiment: true,
      churnRisk: true,
      analyzedAt: true,
      customerId: true,
      customer: { select: { name: true } },
      consumption: {
        select: {
          amount: true,
          card: { select: { token: true } },
          product: { select: { name: true, category: { select: { name: true } } } },
        },
      },
      remedyOffers: remedySelect,
    },
  });
  if (!r) throw new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
  const replied = !!(r.dealerReply || r.dealerRepliedAt);
  const resolved = entry?.status === 'resolved';
  const hasText = !!r.text?.trim();
  const s = unifiedSentiment({ sentiment: r.sentiment, rating: r.rating, hasText, analyzed: !!r.analyzedAt });
  const itemKey = inboxKey('consumption', r.id);
  const customer = await customerContext(dealerId, r.customerId, itemKey);
  const amount = typeof r.consumption?.amount === 'number' && r.consumption.amount > 0 ? r.consumption.amount : null;
  return {
    key: itemKey,
    source: 'consumption',
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    rating: r.rating,
    npsScore: null,
    textPreview: previewText(r.text),
    text: r.text?.trim() || null,
    reply: r.dealerReply ?? null,
    customerName: displayName(r.customer?.name),
    anonymous: false,
    contextLabel: r.consumption?.product?.name?.trim() || null,
    status: deriveStatus({ replied, resolved }),
    repliedAt: r.dealerRepliedAt?.toISOString() ?? null,
    viewedAt: null,
    sentiment: s.sentiment,
    sentimentBasis: s.basis,
    urgent: false,
    churnHigh: (r.churnRisk ?? 0) >= CHURN_THRESHOLD,
    trustFlagged: false,
    toxic: false,
    topics: [],
    hasMedia: false,
    media: [],
    priority: priorityOf({ rating: r.rating, sentiment: r.sentiment, churnRisk: r.churnRisk }),
    sla: computeSla({ createdAt: r.createdAt, negative: isNegativeItem(r.rating, r.sentiment), closed: replied || resolved, now, hours: sla }),
    case: caseDto(entry, names),
    remedyStatus: remedyStatusOf(r.remedyOffers),
    dimensions: normalizeDimensions(r.dimensions),
    intent: null,
    urgency: null,
    churnRisk: r.churnRisk ?? null,
    trustReason: null,
    actionSuggestions: [],
    analyzedAt: r.analyzedAt?.toISOString() ?? null,
    amount,
    cardLast4: last4(r.consumption?.card?.token),
    categoryName: r.consumption?.product?.category?.name?.trim() || null,
    customer,
    remedies: remedyBriefs(r.remedyOffers),
    remedy: remedyGate(remedyEnabled, false, r.remedyOffers),
    autoReply: null,
  };
}

/* ───────────────────────── Yanıt ───────────────────────── */

async function resolveDealerName(dealerId: string): Promise<string> {
  const d = await prisma.user.findUnique({ where: { id: dealerId }, select: { businessName: true, name: true } });
  return d?.businessName || d?.name || 'İşletme';
}

/** Yanıt e-postası yanıt döndükten SONRA (after) gider: sunucusuz dondurmada kaybolmaz (arka plan O4). */
function fireReplyEmail(customerId: string, dealerId: string, snippet: string | null) {
  runAfterResponse('gelen kutusu yanıt e-postası', async () => {
    const { emailDealerReply } = await import('@/lib/notify-email');
    const dealerName = await resolveDealerName(dealerId);
    await emailDealerReply({ customerId, dealerName, feedbackSnippet: snippet });
  });
}

/**
 * Yanıt yaz ya da düzenle. `expectedReply`: bayinin ekranda gördüğü mevcut yanıt (`null` =
 * yanıtsız gördü). Kayıt bu arada değiştiyse (otomatik yanıt, başka sekme, ekip arkadaşı)
 * `REPLY_CONFLICT` (409) + güncel yanıt döner; hiçbir yanıt ezilmez.
 */
export async function replyToInboxItem(params: {
  dealerId: string;
  key: string;
  reply: string;
  expectedReply: string | null;
  now?: Date;
}): Promise<InboxReplyResult> {
  const parsed = parseInboxKey(params.key);
  if (!parsed) throw new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
  const reply = params.reply.trim();
  if (!reply) throw new InboxError('VALIDATION', 'Yanıt boş olamaz.', 400);
  const now = params.now ?? new Date();
  const { dealerId } = params;

  const current =
    parsed.source === 'qr'
      ? await prisma.feedback.findFirst({
          where: { AND: [fbBase(dealerId), { id: parsed.id }] },
          select: { id: true, userId: true, text: true, dealerReply: true, dealerRepliedAt: true, dealerFirstViewedAt: true },
        })
      : await prisma.consumptionReview.findFirst({
          where: { AND: [crBase(dealerId), { id: parsed.id }] },
          select: { id: true, customerId: true, text: true, dealerReply: true, dealerRepliedAt: true },
        });
  if (!current) throw new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);

  const conflict = (latest: { dealerReply: string | null; dealerRepliedAt: Date | null } | null) =>
    new InboxError('REPLY_CONFLICT', 'Bu kayda siz yazarken başka bir yanıt kaydedildi. Güncel yanıtı inceleyip tekrar deneyin.', 409, {
      currentReply: latest?.dealerReply ?? null,
      currentRepliedAt: latest?.dealerRepliedAt?.toISOString() ?? null,
    });

  const isFirst = current.dealerReply == null && current.dealerRepliedAt == null;
  if (params.expectedReply === null ? !isFirst : current.dealerReply !== params.expectedReply) {
    throw conflict(current);
  }

  const guard = isFirst ? { dealerReply: null, dealerRepliedAt: null } : { dealerReply: params.expectedReply };
  let count: number;
  if (parsed.source === 'qr') {
    const fbCurrent = current as { dealerFirstViewedAt: Date | null };
    const res = await prisma.feedback.updateMany({
      where: { AND: [fbBase(dealerId), { id: parsed.id }, guard] },
      data: isFirst
        ? { dealerReply: reply, dealerRepliedAt: now, dealerFirstViewedAt: fbCurrent.dealerFirstViewedAt ?? now }
        : { dealerReply: reply },
    });
    count = res.count;
  } else {
    const res = await prisma.consumptionReview.updateMany({
      where: { AND: [crBase(dealerId), { id: parsed.id }, guard] },
      data: isFirst ? { dealerReply: reply, dealerRepliedAt: now } : { dealerReply: reply },
    });
    count = res.count;
  }
  if (count === 0) {
    const latest =
      parsed.source === 'qr'
        ? await prisma.feedback.findFirst({ /* soft-delete: silinmiş dahil — kapsamı az önce doğrulanmış kaydın 409 için güncel yanıtı */ where: { id: parsed.id }, select: { dealerReply: true, dealerRepliedAt: true } })
        : await prisma.consumptionReview.findFirst({ /* soft-delete: silinmiş dahil — kapsamı az önce doğrulanmış kaydın 409 için güncel yanıtı */ where: { id: parsed.id }, select: { dealerReply: true, dealerRepliedAt: true } });
    throw conflict(latest);
  }

  // Bildirim + e-posta YALNIZ ilk yanıtta (düzenleme müşteriyi tekrar rahatsız etmez).
  const customerId = parsed.source === 'qr' ? (current as { userId: string | null }).userId : (current as { customerId: string }).customerId;
  let notified = false;
  if (isFirst && customerId) {
    try {
      await prisma.notification.create({
        data: {
          userId: customerId,
          type: parsed.source === 'qr' ? 'FEEDBACK_REPLY' : 'REVIEW_REPLY',
          title: 'İşletme Yanıtı',
          message: parsed.source === 'qr' ? 'Geri bildiriminize işletme yanıt verdi.' : 'Tüketim yorumunuza işletme yanıt verdi.',
          data: parsed.source === 'qr' ? { feedbackId: parsed.id } : { reviewId: parsed.id },
        },
      });
      notified = true;
    } catch (err) {
      console.warn('[INBOX_REPLY] bildirim yazılamadı:', err);
    }
    fireReplyEmail(customerId, dealerId, current.text ?? null);
  }
  await bumpInboxVersion(dealerId);

  return {
    key: inboxKey(parsed.source, parsed.id),
    reply,
    repliedAt: (isFirst ? now : current.dealerRepliedAt ?? now).toISOString(),
    edited: !isFirst,
    notified,
  };
}

/* ───────────────────────── İşlemler (tekli + toplu) ───────────────────────── */

function severityFor(rating: number): string {
  if (rating <= 2) return 'high';
  if (rating === 3) return 'medium';
  return 'low';
}

/**
 * Durum/atama işlemi. `viewed` yalnız QR'da iz bırakır (tüketim yorumunda alan yok → no-op).
 * Kapatma: kayda bağlı açık vakaların hepsi kapanır; vaka yoksa kapanmış bir gelen kutusu
 * vakası açılır (kim/ne zaman kapattı izi kalır). Atama: açık vaka varsa ona, yoksa yeni vaka.
 */
export async function applyInboxAction(params: {
  dealerId: string;
  actorId: string;
  keys: readonly string[];
  action: InboxAction;
  assigneeId?: string | null;
  now?: Date;
}): Promise<InboxActionResult[]> {
  const { dealerId, actorId, action } = params;
  const now = params.now ?? new Date();
  const parsedKeys = [...new Set(params.keys)].slice(0, INBOX_BULK_MAX).map((k) => ({ key: k, parsed: parseInboxKey(k) }));

  let assigneeId: string | null = null;
  if (action === 'assign') {
    const v = await validateAssignee(dealerId, params.assigneeId ?? null);
    if (!v.ok || !v.value) throw new InboxError('INVALID_ASSIGNEE', v.ok ? 'Atanacak kişiyi seçin.' : v.error, 400);
    assigneeId = v.value;
  }

  const qrIds = parsedKeys.filter((k) => k.parsed?.source === 'qr').map((k) => k.parsed!.id);
  const crIds = parsedKeys.filter((k) => k.parsed?.source === 'consumption').map((k) => k.parsed!.id);
  const [fbRows, crRows] = await Promise.all([
    qrIds.length
      ? prisma.feedback.findMany({
          where: { AND: [fbBase(dealerId), { id: { in: qrIds } }] },
          select: { id: true, rating: true, createdAt: true, sentiment: true, dealerRepliedAt: true, qrCode: { select: { name: true } } },
        })
      : Promise.resolve([]),
    crIds.length
      ? prisma.consumptionReview.findMany({
          where: { AND: [crBase(dealerId), { id: { in: crIds } }] },
          select: {
            id: true,
            rating: true,
            createdAt: true,
            sentiment: true,
            dealerRepliedAt: true,
            consumption: { select: { product: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  type Owned = { source: InboxSource; id: string; rating: number; createdAt: Date; sentiment: string | null; label: string | null };
  const owned = new Map<string, Owned>();
  for (const f of fbRows) {
    owned.set(inboxKey('qr', f.id), { source: 'qr', id: f.id, rating: f.rating, createdAt: f.createdAt, sentiment: f.sentiment, label: f.qrCode?.name ?? null });
  }
  for (const r of crRows) {
    owned.set(inboxKey('consumption', r.id), {
      source: 'consumption',
      id: r.id,
      rating: r.rating,
      createdAt: r.createdAt,
      sentiment: r.sentiment,
      label: r.consumption?.product?.name ?? null,
    });
  }

  const cases = action === 'viewed' ? new Map<string, CaseIndexEntry>() : await loadCasesFor(dealerId, [...owned.values()]);
  const sla = inboxSlaHours();
  const results: InboxActionResult[] = [];
  let changed = false;

  for (const { key, parsed } of parsedKeys) {
    const item = parsed ? owned.get(inboxKey(parsed.source, parsed.id)) : undefined;
    if (!item) {
      results.push({ key, ok: false, error: 'Kayıt bulunamadı.' });
      continue;
    }
    const itemKey = inboxKey(item.source, item.id);
    const entry = cases.get(itemKey);
    try {
      if (action === 'viewed') {
        if (item.source !== 'qr') {
          // Tüketim yorumunda "görüldü" alanı yok (ŞEMA İSTEĞİ) → sahte "güncellendi" sayılmaz.
          results.push({ key: itemKey, ok: false, error: 'Tüketim yorumlarında okundu işareti tutulmuyor.' });
          continue;
        }
        await prisma.feedback.updateMany({
          where: { AND: [fbBase(dealerId), { id: item.id, dealerFirstViewedAt: null }] },
          data: { dealerFirstViewedAt: now },
        });
      } else if (action === 'resolve') {
        if (entry?.openIds.length) {
          await prisma.incident.updateMany({
            where: { dealerId, id: { in: entry.openIds } },
            data: { status: 'resolved', resolvedAt: now },
          });
          changed = true;
        } else if (!entry || entry.status !== 'resolved') {
          await createCaseOnce(dealerId, itemKey, item, {
            status: 'resolved',
            resolvedAt: now,
            assignedToId: null,
            dueAt: null,
            actorId,
          });
          changed = true;
        }
      } else if (action === 'reopen') {
        if (!entry?.openIds.length && entry?.lastResolvedId) {
          await prisma.incident.updateMany({
            where: { dealerId, id: entry.lastResolvedId },
            data: { status: 'open', resolvedAt: null },
          });
          changed = true;
        }
      } else if (action === 'assign') {
        if (entry?.openIds.length) {
          await prisma.incident.updateMany({
            where: { dealerId, id: entry.id },
            data: { assignedToId: assigneeId, status: 'assigned' },
          });
        } else {
          const due = computeSla({
            createdAt: item.createdAt,
            negative: isNegativeItem(item.rating, item.sentiment),
            closed: false,
            now,
            hours: sla,
          });
          await createCaseOnce(dealerId, itemKey, item, {
            status: 'assigned',
            resolvedAt: null,
            assignedToId: assigneeId,
            dueAt: new Date(due.dueAt),
            actorId,
          });
        }
        changed = true;
        if (assigneeId && assigneeId !== actorId) {
          try {
            await prisma.notification.create({
              data: {
                userId: assigneeId,
                type: 'info',
                title: 'Size bir müşteri yorumu atandı',
                message: `★${item.rating} · ${item.label ?? (item.source === 'qr' ? 'QR geri bildirimi' : 'Tüketim yorumu')}`.slice(0, 200),
                data: { type: 'inbox_assigned', href: inboxAssignHref(dealerId, assigneeId, itemKey), key: itemKey },
              },
            });
          } catch (err) {
            console.warn('[INBOX_ASSIGN] bildirim yazılamadı:', err);
          }
        }
      } else if (action === 'unassign') {
        if (entry?.openIds.length && entry.assignedToId) {
          await prisma.incident.updateMany({
            where: { dealerId, id: entry.id },
            data: { assignedToId: null, status: 'open' },
          });
          changed = true;
        }
      }
      results.push({ key: itemKey, ok: true });
    } catch (err) {
      console.error('[INBOX_ACTION]', action, itemKey, err);
      results.push({ key: itemKey, ok: false, error: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' });
    }
  }

  if (changed) await bumpInboxVersion(dealerId);
  return results;
}

/**
 * Atama bildiriminin bağlantısı alıcının açabileceği yüzeye gider: personel `/dealer/*`
 * sayfalarını açamaz (proxy rol eşlemesi) → personel panelindeki "Size atananlar" listesi.
 */
export function inboxAssignHref(dealerId: string, assigneeId: string, itemKey: string): string {
  return assigneeId === dealerId ? `/dealer/inbox?id=${encodeURIComponent(itemKey)}` : '/staff';
}

/** Kayıt başına tek gelen kutusu vakası (çift tık / iki sekme serileşir). */
async function createCaseOnce(
  dealerId: string,
  itemKey: string,
  item: { source: InboxSource; id: string; rating: number; label: string | null },
  init: { status: 'resolved' | 'assigned'; resolvedAt: Date | null; assignedToId: string | null; dueAt: Date | null; actorId: string }
): Promise<void> {
  const linkField = item.source === 'qr' ? 'feedbackId' : 'consumptionReviewId';
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inbox-case:${itemKey}`}))`;
    const open = await tx.incident.findFirst({
      where: {
        dealerId,
        type: { in: [...LINKED_CASE_TYPES] },
        status: { in: [...OPEN_CASE_STATUSES] },
        metadata: { path: [linkField], equals: item.id },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (open) {
      await tx.incident.update({
        where: { id: open.id },
        data:
          init.status === 'resolved'
            ? { status: 'resolved', resolvedAt: init.resolvedAt }
            : { status: 'assigned', assignedToId: init.assignedToId },
      });
      return;
    }
    const label = item.label?.trim() || (item.source === 'qr' ? 'QR geri bildirimi' : 'Tüketim yorumu');
    await tx.incident.create({
      data: {
        dealerId,
        type: INBOX_CASE_TYPE,
        severity: severityFor(item.rating),
        status: init.status,
        title: `Müşteri yorumu takibi: ★${item.rating} · ${label}`.slice(0, 200),
        description: `Gelen kutusundan açıldı. Kayıt: /dealer/inbox?id=${itemKey}`,
        assignedToId: init.assignedToId,
        dueAt: init.dueAt,
        resolvedAt: init.resolvedAt,
        metadata: { [linkField]: item.id, inboxKey: itemKey, source: 'inbox', openedBy: init.actorId },
      },
    });
  });
}

/* ───────────────────────── AI yanıt taslağı ───────────────────────── */

/**
 * Yanıt taslakları (3 ton) — tek AI geçidi `suggestResponseWithGroq` (bayi AI anahtarı, kiracı
 * bütçesi, prompt enjeksiyonu süzgeci, maliyet kaydı). Taslak GÖNDERİLMEZ; editöre dolar.
 * AI kullanılamıyorsa boş liste + dürüst neden döner (şablon "AI" diye sunulmaz).
 */
export async function suggestInboxReplies(dealerId: string, actorId: string, key: string): Promise<InboxSuggestResult> {
  const parsed = parseInboxKey(key);
  if (!parsed) throw new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
  const item =
    parsed.source === 'qr'
      ? await prisma.feedback.findFirst({
          where: { AND: [fbBase(dealerId), { id: parsed.id }] },
          select: { rating: true, text: true, qrCode: { select: { name: true } } },
        })
      : await prisma.consumptionReview.findFirst({
          where: { AND: [crBase(dealerId), { id: parsed.id }] },
          select: { rating: true, text: true, dimensions: true, consumption: { select: { product: { select: { name: true } } } } },
        });
  if (!item) throw new InboxError('NOT_FOUND', 'Kayıt bulunamadı.', 404);

  const [{ isAIConfigured }, { isDealerAiEnabled }] = await Promise.all([import('@/lib/ai-engine'), import('@/lib/ai-policy')]);
  if (!isAIConfigured()) return { drafts: [], source: 'unavailable', reason: 'not_configured' };
  if (!(await isDealerAiEnabled(dealerId))) return { drafts: [], source: 'unavailable', reason: 'ai_disabled' };

  let text = item.text?.trim() ?? '';
  if (!text) {
    // Metinsiz yorum: yalnız puan + ürün + boyut puanlarından kısa bağlam (müşteri metni uydurulmaz).
    const product =
      parsed.source === 'consumption'
        ? (item as { consumption?: { product?: { name?: string | null } | null } | null }).consumption?.product?.name
        : (item as { qrCode?: { name?: string | null } | null }).qrCode?.name;
    const dims =
      parsed.source === 'consumption' ? normalizeDimensions((item as { dimensions?: unknown }).dimensions) : [];
    text = [
      'Müşteri yazılı yorum bırakmadı; yalnızca puan verdi.',
      `Genel puan: ${item.rating}/5.`,
      product ? `Ürün/nokta: ${product}.` : '',
      dims.length ? `Boyut puanları: ${dims.map((d) => `${d.label} ${d.value}/5`).join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const { suggestResponseWithGroq } = await import('@/lib/groq');
  const drafts = (await suggestResponseWithGroq(text, item.rating, { dealerId, actorKey: actorId }))
    .filter((d) => typeof d === 'string' && d.trim())
    .map((d) => d.trim().slice(0, 2000))
    .slice(0, 3);
  return drafts.length ? { drafts, source: 'ai', reason: null } : { drafts: [], source: 'unavailable', reason: 'no_result' };
}

/* ───────────────────────── Dışa aktarma ───────────────────────── */

export async function collectInboxExport(
  dealerId: string,
  actorId: string,
  filters: InboxFilters,
  now = new Date()
): Promise<{ items: InboxListItem[]; truncated: boolean }> {
  const caseIndex = await loadCaseIndex(dealerId);
  const items: InboxListItem[] = [];
  let cursor: string | null = null;
  do {
    const page: InboxListPage = await listInbox(dealerId, actorId, filters, { cursor, limit: 1000, now, caseIndex, fullText: true });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < INBOX_EXPORT_MAX);
  return { items: items.slice(0, INBOX_EXPORT_MAX), truncated: !!cursor || items.length > INBOX_EXPORT_MAX };
}
