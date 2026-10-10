/**
 * Telafi onayı kuyruğu — sunucu katmanı (okuma + bayi kararları).
 *
 * Kapanan denetim bulguları (dealer_remedy-queue.md):
 *  - B1: onaylanan seçenekler (indirim/puan/ürün) DTO'da normalize edilmiş olarak döner ve
 *    taslak güncel şablondan saptıysa `templateDrift` bildirilir.
 *  - B3: müşteri adı sunucuda üretilir (ad yoksa maskeli e-posta); ham kullanıcı kimliği dönmez.
 *  - B4/B5: yayın tek transaction'da kaynak kilidiyle yapılır (durum + zaman çizelgesi +
 *    müşteri bildirimi); aynı kaynakta kabul edilmiş telafi varsa 409; analitik `after()`'da;
 *    `notificationSent` gerçek sonuçtur.
 *  - B6: yayın öncesi mesaj + seçenek düzenleme (şablon izin listesinin alt kümesi), red nedeni,
 *    10 dk içinde reddi geri alma; reddetme zaman çizelgesine yazılır.
 *  - B8: dört görünüm (onay bekleyen · müşteride · kabul · kapalı) + sayaçlar + bu ayın kabul
 *    oranı (payda yalnız müşteriye ulaşmış teklifler).
 *  - B9: modül kapısı route katmanında (`defineRoute({ module: 'remedy_offers' })`).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { maskEmail } from '@/lib/http/dto';
import { isUniqueViolation } from '@/lib/economy/errors';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';
import { describeRemedyOffer } from '@/lib/remedy-offer-service';
import {
  getRemedyOptions,
  normalizeRemedyOptions,
  restrictRemedyOptionsToAllowlist,
  type RemedyOption,
} from '@/lib/remedy-options';
import {
  REMEDY_PAGE_SIZE,
  REMEDY_RESTORE_WINDOW_MS,
  REMEDY_VIEW_STATUSES,
  REMEDY_AWAITING_WARN_MS,
  excerpt,
  initialsOf,
  isRejectReason,
  readMetaNumber,
  readMetaString,
  triggerFromMeta,
  viewOfStatus,
  type RemedyRejectReason,
  type RemedySourceFilter,
  type RemedyView,
} from './remedy-core';
import { istanbulMonthStart } from './time';
import { runAfter } from './after';
import type { QueueActor } from './audit';
import type {
  RemedyActionResult,
  RemedyBulkResult,
  RemedyCounts,
  RemedyDetail,
  RemedyListPage,
  RemedyQueueItem,
  TimelineEntryDto,
} from './types';

const REMEDY_SELECT = {
  id: true,
  status: true,
  message: true,
  options: true,
  selectedType: true,
  selectedValue: true,
  createdAt: true,
  acceptedAt: true,
  feedbackId: true,
  consumptionReviewId: true,
  userId: true,
  user: { select: { name: true, email: true } },
  feedback: {
    select: {
      id: true,
      rating: true,
      text: true,
      createdAt: true,
      qrCode: { select: { name: true, locationId: true, location: { select: { name: true } } } },
    },
  },
  consumptionReview: {
    select: {
      id: true,
      rating: true,
      text: true,
      createdAt: true,
      consumption: { select: { product: { select: { name: true } } } },
    },
  },
  timelineEvents: {
    select: { id: true, kind: true, label: true, meta: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
    take: 40,
  },
} satisfies Prisma.RemedyOfferSelect;

type RemedyRow = Prisma.RemedyOfferGetPayload<{ select: typeof REMEDY_SELECT }>;

const CURSOR_RE = /^[A-Za-z0-9_-]{8,64}$/;

function lastEvent(row: RemedyRow, kinds: readonly string[]) {
  for (let i = row.timelineEvents.length - 1; i >= 0; i--) {
    const e = row.timelineEvents[i];
    if (kinds.includes(e.kind)) return e;
  }
  return null;
}

function firstEvent(row: RemedyRow, kinds: readonly string[]) {
  return row.timelineEvents.find((e) => kinds.includes(e.kind)) ?? null;
}

export function customerDisplayName(user: { name: string | null; email: string | null } | null): string {
  const name = user?.name?.replace(/\s+/g, ' ').trim();
  if (name) return name.slice(0, 80);
  return user?.email ? maskEmail(user.email) : 'İsimsiz müşteri';
}

function toItem(row: RemedyRow): RemedyQueueItem {
  const created = firstEvent(row, ['created']);
  const published = firstEvent(row, ['published', 'notified']);
  const closed = lastEvent(row, ['rejected', 'expired']);
  const rejected = row.status === 'rejected' ? lastEvent(row, ['rejected']) : null;
  const completed = lastEvent(row, ['completed']);
  const described = describeRemedyOffer(row);
  const name = customerDisplayName(row.user);
  const trigger = triggerFromMeta(created?.meta);

  const fb = row.feedback;
  const cr = row.consumptionReview;
  const kind = fb ? 'qr' : cr ? 'consumption' : 'personal';
  const rejectReason = readMetaString(rejected?.meta, 'reason');

  return {
    id: row.id,
    status: row.status,
    view: viewOfStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    publishedAt: published ? published.createdAt.toISOString() : null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    closedAt: closed && (row.status === 'rejected' || row.status === 'expired') ? closed.createdAt.toISOString() : null,
    customer: { name, initials: initialsOf(name) },
    source: {
      kind,
      id: fb?.id ?? cr?.id ?? null,
      rating: fb?.rating ?? cr?.rating ?? null,
      excerpt: excerpt(fb?.text ?? cr?.text ?? null, 180),
      createdAt: (fb?.createdAt ?? cr?.createdAt)?.toISOString() ?? null,
      placeLabel: fb
        ? fb.qrCode?.location?.name?.trim() || fb.qrCode?.name?.trim() || null
        : cr?.consumption?.product?.name?.trim() || null,
      inboxHref: fb ? `/dealer/inbox?id=qr-${fb.id}` : cr ? `/dealer/inbox?id=cr-${cr.id}` : null,
    },
    message: row.message,
    options: described.options,
    origin: { auto: trigger !== null, trigger },
    selection: described.selection
      ? { label: described.selectionLabel ?? '', type: described.selection.type, value: described.selection.value }
      : null,
    creditedPoints: readMetaNumber(completed?.meta, 'creditedPoints'),
    reject: rejected
      ? { reason: isRejectReason(rejectReason) ? rejectReason : null, note: readMetaString(rejected.meta, 'note') }
      : null,
  };
}

export interface RemedyListParams {
  view: RemedyView;
  source: RemedySourceFilter;
  q: string;
  cursor: string | null;
  limit?: number;
}

function listWhere(dealerId: string, p: Pick<RemedyListParams, 'view' | 'source' | 'q'>): Prisma.RemedyOfferWhereInput {
  const where: Prisma.RemedyOfferWhereInput = {
    dealerId,
    status: { in: [...REMEDY_VIEW_STATUSES[p.view]] },
  };
  if (p.source === 'qr') where.feedbackId = { not: null };
  if (p.source === 'consumption') where.consumptionReviewId = { not: null };
  if (p.q) {
    const contains = { contains: p.q, mode: 'insensitive' as const };
    where.OR = [
      { user: { name: contains } },
      { message: contains },
      { feedback: { text: contains } },
      { consumptionReview: { text: contains } },
    ];
  }
  return where;
}

function listOrder(view: RemedyView): Prisma.RemedyOfferOrderByWithRelationInput[] {
  // Onay kuyruğu FIFO: en uzun bekleyen en üstte (SLA). Diğerleri en yeni önce.
  if (view === 'awaiting') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (view === 'accepted') return [{ acceptedAt: 'desc' }, { id: 'desc' }];
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}

export async function listRemedyOffers(dealerId: string, params: RemedyListParams): Promise<RemedyListPage> {
  const limit = Math.min(Math.max(params.limit ?? REMEDY_PAGE_SIZE, 1), 50);
  const cursor = params.cursor && CURSOR_RE.test(params.cursor) ? params.cursor : null;
  const rows = await prisma.remedyOffer.findMany({
    where: listWhere(dealerId, params),
    orderBy: listOrder(params.view),
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: REMEDY_SELECT,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { items: page.map(toItem), nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getRemedyCounts(dealerId: string, now: Date = new Date()): Promise<RemedyCounts> {
  const monthStart = istanbulMonthStart(now);
  const [grouped, oldest, stale, monthGrouped] = await Promise.all([
    prisma.remedyOffer.groupBy({ by: ['status'], where: { dealerId }, _count: { _all: true } }),
    prisma.remedyOffer.findFirst({
      where: { dealerId, status: 'awaiting_dealer_approval' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.remedyOffer.count({
      where: {
        dealerId,
        status: 'awaiting_dealer_approval',
        createdAt: { lt: new Date(now.getTime() - REMEDY_AWAITING_WARN_MS) },
      },
    }),
    prisma.remedyOffer.groupBy({
      by: ['status'],
      where: { dealerId, createdAt: { gte: monthStart }, status: { in: ['pending', 'accepted', 'expired'] } },
      _count: { _all: true },
    }),
  ]);
  const c = (status: string) => grouped.find((g) => g.status === status)?._count._all ?? 0;
  const mc = (status: string) => monthGrouped.find((g) => g.status === status)?._count._all ?? 0;
  const reached = mc('pending') + mc('accepted') + mc('expired');
  const acceptedThisMonth = await prisma.remedyOffer.count({
    where: { dealerId, status: 'accepted', acceptedAt: { gte: monthStart } },
  });
  return {
    awaiting: c('awaiting_dealer_approval'),
    sent: c('pending'),
    accepted: c('accepted'),
    closed: c('rejected') + c('expired'),
    oldestAwaitingAt: oldest?.createdAt.toISOString() ?? null,
    oldestAwaitingSeconds: oldest ? Math.max(0, Math.round((now.getTime() - oldest.createdAt.getTime()) / 1000)) : null,
    staleAwaiting: stale,
    acceptedThisMonth,
    acceptRateThisMonth: reached > 0 ? Math.round((mc('accepted') / reached) * 1000) / 10 : null,
  };
}

const TIMELINE_LABELS: Record<string, string> = {
  created: 'Taslak oluşturuldu',
  queued: 'Onay kuyruğuna alındı',
  edited: 'Taslak düzenlendi',
  published: 'Müşteriye yayınlandı',
  notified: 'Müşteriye bildirim gönderildi',
  rejected: 'Reddedildi',
  restored: 'Ret geri alındı',
  accepted: 'Müşteri seçimini yaptı',
  completed: 'Teslim edildi',
  expired: 'Süresi doldu',
  reminded: 'Hatırlatma gönderildi',
};

function timelineOf(row: RemedyRow): TimelineEntryDto[] {
  return row.timelineEvents.map((e) => ({
    id: e.id,
    at: e.createdAt.toISOString(),
    kind: e.kind,
    label: e.kind === 'created' || e.kind === 'accepted' || e.kind === 'completed' ? e.label : (TIMELINE_LABELS[e.kind] ?? e.label),
    actorName: readMetaString(e.meta, 'byName'),
    note: readMetaString(e.meta, 'note'),
    ...(e.kind === 'rejected' ? { params: { reason: readMetaString(e.meta, 'reason') } } : {}),
  }));
}

function sameOptions(a: RemedyOption[], b: RemedyOption[]): boolean {
  const key = (list: RemedyOption[]) =>
    list
      .map((o) => `${o.type}:${[...o.values].sort((x, y) => x - y).join(',')}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

async function loadOwnedOffer(dealerId: string, offerId: string): Promise<RemedyRow> {
  const row = await prisma.remedyOffer.findFirst({ where: { id: offerId, dealerId }, select: REMEDY_SELECT });
  if (!row) throw new ApiError('NOT_FOUND', 'Telafi teklifi bulunamadı.');
  return row;
}

export async function getRemedyDetail(dealerId: string, offerId: string, now: Date = new Date()): Promise<RemedyDetail> {
  const row = await loadOwnedOffer(dealerId, offerId);
  const item = toItem(row);
  const locationId = row.feedback?.qrCode?.locationId ?? null;
  const [allowedOptions, visits, feedbacks, remedies, acceptedRemedies] = await Promise.all([
    getRemedyOptions(dealerId, locationId),
    prisma.consumption.count({ where: { dealerId, customerId: row.userId } }),
    prisma.feedback.count({ where: { userId: row.userId, deletedAt: null, qrCode: { dealerId } } }),
    prisma.remedyOffer.count({ where: { dealerId, userId: row.userId } }),
    prisma.remedyOffer.count({ where: { dealerId, userId: row.userId, status: 'accepted' } }),
  ]);
  const rejectedAt = row.status === 'rejected' ? lastEvent(row, ['rejected'])?.createdAt ?? null : null;
  const restorableUntil =
    rejectedAt && now.getTime() - rejectedAt.getTime() < REMEDY_RESTORE_WINDOW_MS
      ? new Date(rejectedAt.getTime() + REMEDY_RESTORE_WINDOW_MS).toISOString()
      : null;
  return {
    ...item,
    sourceText: row.feedback?.text ?? row.consumptionReview?.text ?? null,
    customerContext: { visits, feedbacks, remedies, acceptedRemedies },
    allowedOptions,
    templateDrift: row.status === 'awaiting_dealer_approval' && !sameOptions(normalizeRemedyOptions(row.options), allowedOptions),
    timeline: timelineOf(row),
    restorableUntil,
  };
}

/* ───────────────────────── Kararlar ───────────────────────── */

function sourceLockKey(row: { feedbackId: string | null; consumptionReviewId: string | null; userId: string }, dealerId: string): string {
  // lib/remedy-offer-service.ts ile AYNI anahtar biçimi: oluşturma ve yayın aynı kilitte serileşir.
  if (row.feedbackId) return `remedy:fb:${row.feedbackId}`;
  if (row.consumptionReviewId) return `remedy:cr:${row.consumptionReviewId}`;
  return `remedy:personal:${dealerId}:${row.userId}`;
}

function sourceWhere(row: { feedbackId: string | null; consumptionReviewId: string | null; userId: string }, dealerId: string): Prisma.RemedyOfferWhereInput {
  if (row.feedbackId) return { feedbackId: row.feedbackId };
  if (row.consumptionReviewId) return { consumptionReviewId: row.consumptionReviewId };
  return { dealerId, userId: row.userId, feedbackId: null, consumptionReviewId: null };
}

const notAwaiting = (status: string) =>
  new ApiError('CONFLICT', status === 'pending' ? 'Bu teklif zaten müşteriye gönderildi.' : 'Bu taslak artık onay kuyruğunda değil.', {
    details: { currentStatus: status },
  });

/** Onay bekleyen taslağı müşteriye yayınlar (tek transaction). */
export async function publishRemedyDraft(dealerId: string, offerId: string, actor: QueueActor): Promise<RemedyActionResult> {
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.remedyOffer.findFirst({
      where: { id: offerId, dealerId },
      select: { id: true, status: true, userId: true, options: true, feedbackId: true, consumptionReviewId: true },
    });
    if (!offer) throw new ApiError('NOT_FOUND', 'Telafi teklifi bulunamadı.');
    if (offer.status !== 'awaiting_dealer_approval') throw notAwaiting(offer.status);
    if (normalizeRemedyOptions(offer.options).length === 0) {
      throw new ApiError('NO_OPTIONS', 'Taslakta geçerli bir telafi seçeneği yok. Önce seçenekleri düzenleyin.', { status: 422 });
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sourceLockKey(offer, dealerId)}))`;
    const remedied = await tx.remedyOffer.findFirst({
      where: { ...sourceWhere(offer, dealerId), status: 'accepted', id: { not: offer.id } },
      select: { id: true },
    });
    if (remedied) {
      throw new ApiError('ALREADY_REMEDIED', 'Bu yorum için müşteri başka bir telafiyi zaten kabul etti. Taslağı reddedin.', { status: 409 });
    }

    const n = await tx.remedyOffer.updateMany({
      where: { id: offer.id, dealerId, status: 'awaiting_dealer_approval' },
      data: { status: 'pending' },
    });
    if (n.count === 0) throw notAwaiting('changed');

    await appendRemedyTimelineEvent(tx, offer.id, 'published', 'Teklif müşteriye yayınlandı', {
      by: actor.id,
      byName: actor.name,
    });
    await tx.notification.create({
      data: {
        userId: offer.userId,
        title: 'Telafi Fırsatı',
        message: 'Size özel bir telafi hazır. Tür ve miktar seçmek için tıklayın.',
        type: 'info',
        data: {
          type: 'remedy_campaign',
          remedyOfferId: offer.id,
          ...(offer.feedbackId ? { feedbackId: offer.feedbackId } : {}),
          ...(offer.consumptionReviewId ? { consumptionReviewId: offer.consumptionReviewId } : {}),
        },
      },
    });
    await appendRemedyTimelineEvent(tx, offer.id, 'notified', 'Müşteriye bildirim gönderildi');
    return { userId: offer.userId };
  });

  runAfter('remedy_offer_published analitiği', () =>
    prisma.analyticsEvent.create({
      data: {
        userId: actor.id,
        event: 'remedy_offer_published',
        category: 'campaign',
        data: { offerId, dealerId, customerId: result.userId },
      },
    })
  );
  return { id: offerId, status: 'pending', notificationSent: true };
}

/** Onay bekleyen taslağı nedeniyle reddeder (10 dk içinde geri alınabilir). */
export async function rejectRemedyDraft(
  dealerId: string,
  offerId: string,
  actor: QueueActor,
  input: { reason: RemedyRejectReason; note?: string | null },
  now: Date = new Date()
): Promise<RemedyActionResult> {
  const note = input.note?.replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  await prisma.$transaction(async (tx) => {
    const offer = await tx.remedyOffer.findFirst({ where: { id: offerId, dealerId }, select: { id: true, status: true } });
    if (!offer) throw new ApiError('NOT_FOUND', 'Telafi teklifi bulunamadı.');
    if (offer.status !== 'awaiting_dealer_approval') throw notAwaiting(offer.status);
    const n = await tx.remedyOffer.updateMany({
      where: { id: offerId, dealerId, status: 'awaiting_dealer_approval' },
      data: { status: 'rejected' },
    });
    if (n.count === 0) throw notAwaiting('changed');
    await appendRemedyTimelineEvent(tx, offerId, 'rejected', 'Taslak reddedildi', {
      reason: input.reason,
      note,
      by: actor.id,
      byName: actor.name,
    });
  });
  runAfter('remedy_offer_rejected analitiği', () =>
    prisma.analyticsEvent.create({
      data: {
        userId: actor.id,
        event: 'remedy_offer_rejected_by_dealer',
        category: 'campaign',
        data: { offerId, dealerId, reason: input.reason },
      },
    })
  );
  return {
    id: offerId,
    status: 'rejected',
    restorableUntil: new Date(now.getTime() + REMEDY_RESTORE_WINDOW_MS).toISOString(),
  };
}

/** Az önce reddedilen taslağı onay kuyruğuna geri alır. */
export async function restoreRemedyDraft(
  dealerId: string,
  offerId: string,
  actor: QueueActor,
  now: Date = new Date()
): Promise<RemedyActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const offer = await tx.remedyOffer.findFirst({
        where: { id: offerId, dealerId },
        select: {
          id: true,
          status: true,
          timelineEvents: { where: { kind: 'rejected' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      });
      if (!offer) throw new ApiError('NOT_FOUND', 'Telafi teklifi bulunamadı.');
      if (offer.status !== 'rejected') throw new ApiError('CONFLICT', 'Bu taslak reddedilmiş durumda değil.');
      const rejectedAt = offer.timelineEvents[0]?.createdAt;
      if (!rejectedAt || now.getTime() - rejectedAt.getTime() > REMEDY_RESTORE_WINDOW_MS) {
        throw new ApiError('RESTORE_EXPIRED', 'Geri alma süresi doldu.', { status: 409 });
      }
      const n = await tx.remedyOffer.updateMany({
        where: { id: offerId, dealerId, status: 'rejected' },
        data: { status: 'awaiting_dealer_approval' },
      });
      if (n.count === 0) throw new ApiError('CONFLICT', 'Taslak durumu değişti.');
      await appendRemedyTimelineEvent(tx, offerId, 'restored', 'Ret geri alındı', { by: actor.id, byName: actor.name });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError('OPEN_OFFER_EXISTS', 'Bu yorum için açık başka bir telafi var; taslak geri alınamadı.', { status: 409 });
    }
    throw err;
  }
  return { id: offerId, status: 'awaiting_dealer_approval' };
}

export const REMEDY_EDIT_MESSAGE_MAX = 500;

/** Yayın öncesi düzenleme: mesaj ve/veya seçenekler (şablon izin listesinin alt kümesi). */
export async function editRemedyDraft(
  dealerId: string,
  offerId: string,
  actor: QueueActor,
  input: { message?: string; options?: unknown[] }
): Promise<RemedyDetail> {
  const row = await loadOwnedOffer(dealerId, offerId);
  if (row.status !== 'awaiting_dealer_approval') throw notAwaiting(row.status);

  const data: Prisma.RemedyOfferUpdateManyMutationInput = {};
  const changed: string[] = [];
  if (input.message !== undefined) {
    const message = input.message.replace(/[ \t]+/g, ' ').trim();
    if (message.length < 1) throw new ApiError('VALIDATION', 'Mesaj boş olamaz.');
    if (message.length > REMEDY_EDIT_MESSAGE_MAX) {
      throw new ApiError('VALIDATION', `Mesaj en fazla ${REMEDY_EDIT_MESSAGE_MAX} karakter olabilir.`);
    }
    if (message !== row.message) {
      data.message = message;
      changed.push('message');
    }
  }
  if (input.options !== undefined) {
    const allowed = await getRemedyOptions(dealerId, row.feedback?.qrCode?.locationId ?? null);
    const restricted = restrictRemedyOptionsToAllowlist(input.options, allowed);
    if (!restricted.ok) throw new ApiError('VALIDATION', restricted.reason);
    if (!sameOptions(restricted.options, normalizeRemedyOptions(row.options))) {
      data.options = restricted.options as unknown as Prisma.InputJsonValue;
      changed.push('options');
    }
  }
  if (changed.length > 0) {
    await prisma.$transaction(async (tx) => {
      const n = await tx.remedyOffer.updateMany({
        where: { id: offerId, dealerId, status: 'awaiting_dealer_approval' },
        data,
      });
      if (n.count === 0) throw notAwaiting('changed');
      await appendRemedyTimelineEvent(tx, offerId, 'edited', 'Taslak düzenlendi', {
        fields: changed,
        by: actor.id,
        byName: actor.name,
      });
    });
  }
  return getRemedyDetail(dealerId, offerId);
}

export type RemedyBulkAction = { action: 'publish' } | { action: 'reject'; reason: RemedyRejectReason; note?: string | null };

/** Toplu karar: her taslak kendi transaction'ında; biri düşse diğerleri işlenir. */
export async function bulkRemedyAction(
  dealerId: string,
  ids: string[],
  actor: QueueActor,
  op: RemedyBulkAction
): Promise<RemedyBulkResult> {
  const unique = [...new Set(ids)];
  const out: RemedyBulkResult = { done: [], failed: [] };
  for (const id of unique) {
    try {
      if (op.action === 'publish') await publishRemedyDraft(dealerId, id, actor);
      else await rejectRemedyDraft(dealerId, id, actor, { reason: op.reason, note: op.note });
      out.done.push(id);
    } catch (err) {
      if (err instanceof ApiError) out.failed.push({ id, code: String(err.code), message: err.message });
      else throw err;
    }
  }
  return out;
}

/** Kaynak yorum için yayınlanabilir/onay bekleyen taslak sayısı (Gelen Kutusu rozetleri için). */
export async function countAwaitingRemedies(dealerId: string): Promise<number> {
  return prisma.remedyOffer.count({ where: { dealerId, status: 'awaiting_dealer_approval' } });
}
