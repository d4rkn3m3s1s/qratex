/**
 * Kasa + İşlem Defteri — sunucu tarafı (Prisma). Yalnız route'lar ve sunucu bileşenleri çağırır.
 *
 *  - Kiracı kapsamı çağırandan gelir (`dealerId` = resolveDealerScope sonucu); burada her
 *    sorgu `dealerId` ile daraltılır.
 *  - Kasaya müşteri e-postası/telefonu GİTMEZ; ad maskelenir ("Ayşe K."), ham müşteri kimliği
 *    yanıtlara yazılmaz.
 *  - Geri alma: yalnız 15 dk içinde ve değerlendirilmemiş kayıt; pasif puan `debitPoints`
 *    (lib/economy) ile ters kayıt, klan toplamı düşülür, kart denetim günlüğüne tam anlık
 *    görüntü (`CONSUMPTION_VOIDED`) yazılır; hepsi tek transaction.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { debitPoints, InsufficientPointsError } from '@/lib/economy';
import { resolveAvatarImage } from '@/lib/avatar-options';
import {
  EXPORT_MAX_ROWS,
  LEDGER_PAGE_SIZE,
  SCAN_AUDIT_DEDUPE_MS,
  VOID_WINDOW_MS,
  buildSummary,
  cardLast4,
  csvLine,
  initialsOf,
  istanbulDateTime,
  maskCustomerName,
  previousWindow,
  ratingBounds,
  resolveLedgerWindow,
  voidBlockReason,
  type DateWindow,
  type LedgerFilters,
  type LedgerSummaryNumbers,
} from './core';
import type { CardLookupDto, KasaBootstrap, KasaProduct, KasaQuickKey, LedgerPage, LedgerRow } from './types';

export class KasaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'KasaError';
  }
}

export function safeAvatar(src: string | null | undefined): string | null {
  if (!src) return null;
  if (!(src.startsWith('/') && !src.startsWith('//')) && !src.startsWith('https://')) return null;
  return resolveAvatarImage(src);
}

// ───────────────────────────── Kart sorgusu ─────────────────────────────

export async function lookupCard(params: {
  dealerId: string;
  actorId: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  now?: Date;
}): Promise<CardLookupDto> {
  const now = params.now ?? new Date();
  const card = await prisma.physicalCard.findUnique({
    where: { token: params.token },
    select: {
      id: true,
      token: true,
      status: true,
      archivedAt: true,
      customerId: true,
      customer: { select: { name: true, image: true, level: true } },
    },
  });
  if (!card) throw new KasaError('CARD_NOT_FOUND', 'Kart bulunamadı.', 404);
  if (card.status === 'BLOCKED') throw new KasaError('CARD_BLOCKED', 'Bu kart bloklanmış.', 403);
  if (card.archivedAt) throw new KasaError('CARD_ARCHIVED', 'Bu kart arşivlenmiş.', 403);
  if (card.status !== 'ACTIVATED' || !card.customerId || !card.customer) {
    throw new KasaError('CARD_NOT_ACTIVATED', 'Bu kart henüz aktive edilmemiş.', 400);
  }
  if (card.customerId === params.dealerId || card.customerId === params.actorId) {
    throw new KasaError('SELF_DEALING', 'Kendi kartınıza işlem kaydedemezsiniz.', 403);
  }

  const where = { cardId: card.id, dealerId: params.dealerId } satisfies Prisma.ConsumptionWhereInput;
  const [recent, agg, reviewedHere, lastScan] = await Promise.all([
    prisma.consumption.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        amount: true,
        createdAt: true,
        product: { select: { name: true } },
        review: { select: { rating: true, deletedAt: true } },
      },
    }),
    prisma.consumption.aggregate({ where, _count: { _all: true }, _sum: { amount: true } }),
    prisma.consumption.count({ where: { ...where, review: { is: { deletedAt: null } } } }),
    prisma.cardAuditLog.findFirst({
      where: {
        cardId: card.id,
        userId: params.actorId,
        action: 'SCANNED',
        createdAt: { gte: new Date(now.getTime() - SCAN_AUDIT_DEDUPE_MS) },
      },
      select: { id: true },
    }),
  ]);

  // Aynı kart + aktör için 60 sn içinde tek SCANNED kaydı (kadrajda kalan QR günlüğü şişirmesin).
  if (!lastScan) {
    await prisma.cardAuditLog.create({
      data: {
        cardId: card.id,
        userId: params.actorId,
        action: 'SCANNED',
        metadata: { dealerId: params.dealerId },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }

  return {
    token: card.token,
    last4: cardLast4(card.token),
    customer: {
      displayName: maskCustomerName(card.customer.name),
      initials: initialsOf(card.customer.name),
      avatar: safeAvatar(card.customer.image),
      level: card.customer.level,
    },
    visits: {
      countHere: agg._count._all,
      lastAt: recent[0]?.createdAt.toISOString() ?? null,
      totalSpentHere: Math.round((agg._sum.amount ?? 0) * 100) / 100,
      reviewedHere,
    },
    recent: recent.map((r) => ({
      id: r.id,
      productName: r.product?.name ?? null,
      amount: r.amount,
      createdAt: r.createdAt.toISOString(),
      rating: r.review && !r.review.deletedAt ? r.review.rating : null,
    })),
  };
}

// ───────────────────────────── Defter ─────────────────────────────

export function ledgerWhere(dealerId: string, f: LedgerFilters, w: DateWindow): Prisma.ConsumptionWhereInput {
  const and: Prisma.ConsumptionWhereInput[] = [
    { dealerId },
    { createdAt: { ...(w.from ? { gte: w.from } : {}), lt: w.to } },
  ];
  if (f.productId) and.push({ productId: f.productId });
  const rb = ratingBounds(f.rating);
  if (rb === 'none') {
    and.push({ OR: [{ review: { is: null } }, { review: { is: { deletedAt: { not: null } } } }] });
  } else if (rb) {
    and.push({ review: { is: { deletedAt: null, rating: { gte: rb.min, lte: rb.max } } } });
  }
  if (f.q) {
    and.push({
      OR: [
        { customer: { name: { contains: f.q, mode: 'insensitive' } } },
        { note: { contains: f.q, mode: 'insensitive' } },
        { product: { name: { contains: f.q, mode: 'insensitive' } } },
      ],
    });
  }
  return { AND: and };
}

function orderFor(sort: LedgerFilters['sort']): Prisma.ConsumptionOrderByWithRelationInput[] {
  switch (sort) {
    case 'old':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'amount_desc':
      return [{ amount: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'amount_asc':
      return [{ amount: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

const ROW_SELECT = {
  id: true,
  amount: true,
  note: true,
  createdAt: true,
  card: { select: { token: true } },
  customer: { select: { name: true, image: true } },
  product: { select: { id: true, name: true, category: { select: { name: true, icon: true } } } },
  review: { select: { id: true, rating: true, text: true, dimensions: true, dealerReply: true, createdAt: true, deletedAt: true } },
} satisfies Prisma.ConsumptionSelect;

type RowPayload = Prisma.ConsumptionGetPayload<{ select: typeof ROW_SELECT }>;

function toDimensions(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === 'number' && Number.isFinite(n) && /^[a-z_]{1,32}$/i.test(k)) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

function toRow(r: RowPayload, now: Date, points: Map<string, number>): LedgerRow {
  const review = r.review && !r.review.deletedAt ? r.review : null;
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    amount: r.amount,
    note: r.note,
    cardLast4: cardLast4(r.card?.token),
    customer: {
      displayName: r.customer?.name?.trim() || null,
      initials: initialsOf(r.customer?.name),
      avatar: safeAvatar(r.customer?.image),
    },
    product: r.product
      ? { id: r.product.id, name: r.product.name, categoryName: r.product.category?.name ?? null, categoryIcon: r.product.category?.icon ?? null }
      : null,
    review: review
      ? {
          id: review.id,
          rating: review.rating,
          text: review.text,
          dimensions: toDimensions(review.dimensions),
          dealerReply: review.dealerReply,
          createdAt: review.createdAt.toISOString(),
        }
      : null,
    // Silinmiş (moderasyon) yorum da satırı kilitler: geri alma onu da silerdi.
    voidable: voidBlockReason({ createdAt: r.createdAt, hasReview: !!r.review, now }) === null,
    passivePoints: points.has(r.id) ? points.get(r.id)! : null,
  };
}

async function passivePointsFor(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const rows = await prisma.pointsLedger.findMany({
    where: { idempotencyKey: { in: ids.map((id) => `consumption:${id}`) } },
    select: { idempotencyKey: true, delta: true, status: true },
  });
  for (const row of rows) {
    const id = row.idempotencyKey?.slice('consumption:'.length);
    if (id) map.set(id, row.status === 'posted' ? row.delta : 0);
  }
  return map;
}

async function summarize(dealerId: string, f: LedgerFilters, w: DateWindow): Promise<LedgerSummaryNumbers> {
  const where = ledgerWhere(dealerId, f, w);
  const [agg, amountCount, reviewed, perCustomer] = await Promise.all([
    prisma.consumption.aggregate({ where, _count: { _all: true }, _sum: { amount: true } }),
    prisma.consumption.count({ where: { AND: [where, { amount: { not: null } }] } }),
    prisma.consumption.count({ where: { AND: [where, { review: { is: { deletedAt: null } } }] } }),
    prisma.consumption.groupBy({ by: ['customerId'], where, _count: { _all: true } }),
  ]);
  return buildSummary({
    count: agg._count._all,
    revenue: agg._sum.amount,
    amountCount,
    reviewed,
    customerCounts: perCustomer.map((c) => c._count._all),
  });
}

export async function listLedger(
  dealerId: string,
  filters: LedgerFilters,
  opts: { now?: Date; pageSize?: number; withPrevious?: boolean } = {}
): Promise<LedgerPage> {
  const now = opts.now ?? new Date();
  const pageSize = opts.pageSize ?? LEDGER_PAGE_SIZE;
  const w = resolveLedgerWindow(filters, now);
  const where = ledgerWhere(dealerId, filters, w);
  const prevW = opts.withPrevious === false ? null : previousWindow(w);

  const [total, rows, current, previous] = await Promise.all([
    prisma.consumption.count({ where }),
    prisma.consumption.findMany({
      where,
      orderBy: orderFor(filters.sort),
      skip: (filters.page - 1) * pageSize,
      take: pageSize,
      select: ROW_SELECT,
    }),
    summarize(dealerId, filters, w),
    prevW ? summarize(dealerId, filters, prevW) : Promise.resolve(null),
  ]);
  const points = await passivePointsFor(rows.map((r) => r.id));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    filters,
    rows: rows.map((r) => toRow(r, now, points)),
    total,
    page: filters.page,
    pageSize,
    totalPages,
    summary: { current, previous },
    generatedAt: now.toISOString(),
  };
}

export async function exportLedgerCsv(dealerId: string, filters: LedgerFilters, now = new Date()): Promise<string> {
  const w = resolveLedgerWindow(filters, now);
  const rows = await prisma.consumption.findMany({
    where: ledgerWhere(dealerId, filters, w),
    orderBy: orderFor(filters.sort),
    take: EXPORT_MAX_ROWS,
    select: ROW_SELECT,
  });
  const lines = [csvLine(['Tarih (İstanbul)', 'Müşteri', 'Kart', 'Ürün', 'Kategori', 'Tutar (TL)', 'Not', 'Puan (1-5)', 'Yorum'])];
  for (const r of rows) {
    const review = r.review && !r.review.deletedAt ? r.review : null;
    lines.push(
      csvLine([
        istanbulDateTime(r.createdAt),
        r.customer?.name ?? '',
        cardLast4(r.card?.token) ? `****${cardLast4(r.card?.token)}` : '',
        r.product?.name ?? '',
        r.product?.category?.name ?? '',
        r.amount ?? '',
        r.note ?? '',
        review?.rating ?? '',
        review?.text ?? '',
      ])
    );
  }
  // Excel'in UTF-8'i tanıması için BOM.
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ───────────────────────────── Kasa açılışı ─────────────────────────────

export async function listKasaProducts(dealerId: string): Promise<KasaProduct[]> {
  const rows = await prisma.product.findMany({
    where: { isActive: true, OR: [{ dealerId }, { dealerId: null }] },
    orderBy: [{ dealerId: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
    take: 500,
    select: { id: true, name: true, price: true, category: { select: { name: true, icon: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    categoryName: p.category?.name ?? null,
    categoryIcon: p.category?.icon ?? null,
  }));
}

export async function listQuickKeys(dealerId: string): Promise<KasaQuickKey[]> {
  const rows = await prisma.quickScanPreset.findMany({
    where: { dealerId },
    orderBy: [{ isDefault: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
    take: 24,
    select: { id: true, name: true, productId: true, amount: true, note: true, product: { select: { name: true, isActive: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    productId: r.product?.isActive === false ? null : r.productId,
    productName: r.product?.isActive === false ? null : (r.product?.name ?? null),
    amount: r.amount,
    note: r.note,
  }));
}

export async function loadKasaBootstrap(dealerId: string, role: 'DEALER' | 'STAFF', now = new Date()): Promise<KasaBootstrap> {
  const [products, quickKeys, today] = await Promise.all([
    listKasaProducts(dealerId),
    listQuickKeys(dealerId),
    listLedger(dealerId, { range: 'today', from: null, to: null, rating: 'all', productId: null, q: '', sort: 'new', page: 1 }, { now, pageSize: 10 }),
  ]);
  return { products, quickKeys, today, role };
}

// ───────────────────────────── Hızlı tuşlar ─────────────────────────────

export const QUICK_KEY_MAX = 24;

export async function createQuickKey(
  dealerId: string,
  input: { name: string; productId: string | null; amount: number | null; note: string | null }
): Promise<KasaQuickKey> {
  if (input.productId) {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { dealerId: true, isActive: true },
    });
    if (!product || !product.isActive) throw new KasaError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı ya da pasif.', 404);
    if (product.dealerId && product.dealerId !== dealerId) throw new KasaError('PRODUCT_FORBIDDEN', 'Bu ürüne erişim yetkiniz yok.', 403);
  }
  const count = await prisma.quickScanPreset.count({ where: { dealerId } });
  if (count >= QUICK_KEY_MAX) throw new KasaError('QUICK_KEY_LIMIT', `En fazla ${QUICK_KEY_MAX} hızlı tuş tanımlanabilir.`, 409);
  const last = await prisma.quickScanPreset.findFirst({ where: { dealerId }, orderBy: { order: 'desc' }, select: { order: true } });
  const row = await prisma.quickScanPreset.create({
    data: { dealerId, name: input.name, productId: input.productId, amount: input.amount, note: input.note, order: (last?.order ?? 0) + 1 },
    select: { id: true, name: true, productId: true, amount: true, note: true, product: { select: { name: true } } },
  });
  return { id: row.id, name: row.name, productId: row.productId, productName: row.product?.name ?? null, amount: row.amount, note: row.note };
}

export async function deleteQuickKey(dealerId: string, id: string): Promise<void> {
  const res = await prisma.quickScanPreset.deleteMany({ where: { id, dealerId } });
  if (res.count === 0) throw new KasaError('NOT_FOUND', 'Hızlı tuş bulunamadı.', 404);
}

// ───────────────────────────── Geri alma ─────────────────────────────

export interface VoidResult {
  consumptionId: string;
  reversedPoints: number;
}

export async function voidConsumption(params: {
  dealerId: string;
  actorId: string;
  actorRole: string;
  consumptionId: string;
  reason: string;
  ipAddress: string | null;
  userAgent: string | null;
  now?: Date;
}): Promise<VoidResult> {
  const now = params.now ?? new Date();
  const c = await prisma.consumption.findFirst({
    where: { id: params.consumptionId, dealerId: params.dealerId },
    select: {
      id: true,
      cardId: true,
      customerId: true,
      productId: true,
      amount: true,
      note: true,
      clientOpId: true,
      createdAt: true,
      review: { select: { id: true } },
      product: { select: { name: true } },
    },
  });
  if (!c) throw new KasaError('NOT_FOUND', 'Kayıt bulunamadı.', 404);
  const block = voidBlockReason({ createdAt: c.createdAt, hasReview: !!c.review, now });
  if (block === 'reviewed') {
    throw new KasaError('VOID_REVIEWED', 'Müşteri bu işlemi değerlendirdi; kayıt artık geri alınamaz.', 409);
  }
  if (block === 'window') {
    throw new KasaError('VOID_WINDOW_CLOSED', `Kayıtlar yalnız ilk ${VOID_WINDOW_MS / 60_000} dakika içinde geri alınabilir.`, 409);
  }
  // Personel yalnız kendi girdiği kaydı geri alabilir.
  if (params.actorRole === 'STAFF') {
    const added = await prisma.cardAuditLog.findFirst({
      where: { cardId: c.cardId, action: 'CONSUMPTION_ADDED', metadata: { path: ['consumptionId'], equals: c.id } },
      select: { userId: true },
    });
    if (!added || added.userId !== params.actorId) {
      throw new KasaError('FORBIDDEN', 'Yalnız kendi girdiğiniz kaydı geri alabilirsiniz.', 403);
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const ledger = await tx.pointsLedger.findUnique({
        where: { idempotencyKey: `consumption:${c.id}` },
        select: { id: true, delta: true, status: true },
      });
      const credited = ledger && ledger.status === 'posted' && ledger.delta > 0 ? ledger.delta : 0;

      if (credited > 0) {
        await debitPoints(tx, {
          userId: c.customerId,
          points: credited,
          source: 'reversal',
          sourceId: c.id,
          idempotencyKey: `consumption_void:${c.id}`,
          actorId: params.actorId,
          reason: 'Tüketim kaydı geri alındı',
          meta: { reversesId: ledger!.id, consumptionId: c.id, dealerId: params.dealerId },
        });
        await tx.pointsLedger.update({ where: { id: ledger!.id }, data: { status: 'reversed' } });
        const membership = await tx.squadMember.findFirst({ where: { userId: c.customerId }, select: { squadId: true } });
        if (membership) {
          await tx.squad.updateMany({
            where: { id: membership.squadId, totalPoints: { gte: credited } },
            data: { totalPoints: { decrement: credited } },
          });
        }
      }

      await tx.cardAuditLog.create({
        data: {
          cardId: c.cardId,
          userId: params.actorId,
          action: 'CONSUMPTION_VOIDED',
          metadata: {
            consumptionId: c.id,
            dealerId: params.dealerId,
            reason: params.reason,
            reversedPoints: credited,
            snapshot: {
              productId: c.productId,
              productName: c.product?.name ?? null,
              amount: c.amount,
              note: c.note,
              clientOpId: c.clientOpId,
              createdAt: c.createdAt.toISOString(),
            },
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });

      await tx.notification.create({
        data: {
          userId: c.customerId,
          title: 'İşlem kaydı geri alındı',
          message:
            credited > 0
              ? `İşletme hatalı girilen bir işlemi geri aldı; ${credited} puan bakiyenizden düşüldü.`
              : 'İşletme hatalı girilen bir işlemi geri aldı.',
          type: 'info',
          data: { type: 'consumption_voided', consumptionId: c.id },
        },
      });

      // Değerlendirme yoksa kaydı kaldır (yorum hakkı da kalkar). Eşzamanlı gelen yorumla
      // yarışta koşul tutmaz → tx geri alınır.
      const removed = await tx.consumption.deleteMany({
        where: { id: c.id, dealerId: params.dealerId, review: { is: null } },
      });
      if (removed.count !== 1) {
        throw new KasaError('VOID_REVIEWED', 'Müşteri bu işlemi az önce değerlendirdi; kayıt geri alınamaz.', 409);
      }
      return { consumptionId: c.id, reversedPoints: credited };
    });
  } catch (e) {
    if (e instanceof InsufficientPointsError) {
      throw new KasaError(
        'VOID_POINTS_SPENT',
        'Müşteri bu işlemden kazandığı puanı harcamış; kayıt geri alınamıyor. Destek ekibiyle iletişime geçin.',
        409
      );
    }
    throw e;
  }
}
