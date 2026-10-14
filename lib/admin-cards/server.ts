import { envAppUrl } from '@/lib/env-url';
/**
 * Admin → Fiziksel Kartlar (Dalga 2) sunucu mantığı. Yalnız `requireAuth(['ADMIN'])` arkasındaki
 * BFF uçlarından ve sunucu sayfasından çağrılır.
 *
 *  - Liste: sunucu sayfalama/filtre/sıralama, kart URL'si SUNUCUDA üretilir (sabit demo domain yok).
 *  - Partiler: tek `groupBy(batchId,status)` (N+1 yok) + son dışa aktarım (AuditLog).
 *  - Üretim: `Set` ile benzersiz token, `createMany` dönüş sayısı toplanır, eksik kalan yeniden
 *    üretilir; parti + kartlar + denetim TEK transaction.
 *  - Toplu işlem: her kart durum makinesinden geçer (lib/cards/lifecycle.ts), koşullu `updateMany`
 *    ile yazılır (arada değişen kart atlanır), kart denetim izi + genel denetim aynı tx'te.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { buildCardUrl, resolveCardOrigin } from '@/lib/wallet-card/snapshot';
import { generateCardToken } from '@/lib/utils';
import { checkStatusChange, statusChangeData, CARD_ARCHIVE_BLOCK_REASON, type CardStatus } from '@/lib/cards/lifecycle';
import {
  CARD_DEFAULT_SORT,
  CARD_EXPORT_MAX,
  IDLE_DAYS,
  composeBlockReason,
  normalizeCardSearch,
  type BatchPage,
  type BatchRow,
  type BulkBody,
  type BulkResult,
  type CardDetail,
  type CardFilters,
  type CardListItem,
  type CardListPage,
  type CardListQuery,
  type CardStats,
  type CardTimelineEvent,
  type CustomerOption,
  type GenerateBody,
  type GenerateResult,
} from './contract';

export type Actor = { id: string; email?: string | null; role?: string | null; name?: string | null };
export type ReqMeta = { ipAddress: string | null; userAgent: string | null };

const DAY = 86_400_000;
const ISTANBUL_OFFSET_MS = 3 * 3_600_000; // Türkiye 2016'dan beri sabit UTC+3

/** İstanbul takvim gününün başlangıcı (UTC Date), `daysAgo` gün öncesi. */
export function istanbulDayStart(now: Date, daysAgo = 0): Date {
  const local = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysAgo * DAY;
  return new Date(startLocal - ISTANBUL_OFFSET_MS);
}

export function cardOrigin(): string {
  return resolveCardOrigin(process.env.NEXT_PUBLIC_CARD_BASE_URL?.trim() || envAppUrl(), getPublicAppOrigin());
}

// ───────────────────────────── Liste ─────────────────────────────

export function buildCardWhere(f: CardFilters, now = new Date()): Prisma.PhysicalCardWhereInput {
  const and: Prisma.PhysicalCardWhereInput[] = [];
  if (f.status === 'ARCHIVED') and.push({ archivedAt: { not: null } });
  else {
    and.push({ archivedAt: null });
    if (f.status) and.push({ status: f.status });
  }
  if (f.batch) and.push({ batchId: f.batch });
  if (f.usage === 'none') and.push({ consumptions: { none: {} } });
  if (f.usage === 'any') and.push({ consumptions: { some: {} } });
  if (f.usage === 'idle') {
    and.push({ status: 'ACTIVATED', consumptions: { none: { createdAt: { gte: new Date(now.getTime() - IDLE_DAYS * DAY) } } } });
  }
  const q = normalizeCardSearch(f.q);
  if (q) {
    and.push({
      OR: [
        { token: { contains: q, mode: 'insensitive' } },
        { id: q },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  return { AND: and };
}

export function buildCardOrderBy(sort: string | undefined): Prisma.PhysicalCardOrderByWithRelationInput[] {
  const [field, dir] = (sort ?? CARD_DEFAULT_SORT).split('.') as [string, 'asc' | 'desc'];
  if (field === 'consumptions') return [{ consumptions: { _count: dir } }, { createdAt: 'desc' }, { id: 'asc' }];
  if (field === 'activatedAt') return [{ activatedAt: { sort: dir, nulls: 'last' } }, { id: 'asc' }];
  return [{ createdAt: dir }, { id: 'asc' }];
}

const listSelect = {
  id: true,
  token: true,
  status: true,
  archivedAt: true,
  batchId: true,
  activatedAt: true,
  blockedAt: true,
  blockReason: true,
  createdAt: true,
  customer: { select: { id: true, name: true, email: true, image: true } },
  _count: { select: { consumptions: true } },
  consumptions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.PhysicalCardSelect;

type ListRow = Prisma.PhysicalCardGetPayload<{ select: typeof listSelect }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function toItem(row: ListRow, batchNames: Map<string, string>, origin: string): CardListItem {
  return {
    id: row.id,
    token: row.token,
    url: buildCardUrl(row.token, origin),
    status: row.status,
    archived: !!row.archivedAt,
    batchId: row.batchId,
    batchName: row.batchId ? batchNames.get(row.batchId) ?? null : null,
    customer: row.customer ? { id: row.customer.id, name: row.customer.name, email: row.customer.email, image: row.customer.image } : null,
    consumptions: row._count.consumptions,
    lastConsumptionAt: iso(row.consumptions[0]?.createdAt),
    activatedAt: iso(row.activatedAt),
    blockedAt: iso(row.blockedAt),
    blockReason: row.blockReason,
    createdAt: row.createdAt.toISOString(),
  };
}

async function batchNameMap(ids: Array<string | null>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const rows = await prisma.cardBatch.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function listCards(query: CardListQuery): Promise<CardListPage> {
  const where = buildCardWhere(query);
  const skip = (query.page - 1) * query.size;
  const [rows, total] = await Promise.all([
    prisma.physicalCard.findMany({ where, orderBy: buildCardOrderBy(query.sort), skip, take: query.size, select: listSelect }),
    prisma.physicalCard.count({ where }),
  ]);
  const names = await batchNameMap(rows.map((r) => r.batchId));
  const origin = cardOrigin();
  return {
    items: rows.map((r) => toItem(r, names, origin)),
    total,
    page: query.page,
    size: query.size,
    pageCount: Math.max(1, Math.ceil(total / query.size)),
  };
}

export async function getCardStats(now = new Date()): Promise<CardStats> {
  const [groups, archived, activatedLast7d, idleActive] = await Promise.all([
    prisma.physicalCard.groupBy({ by: ['status'], where: { archivedAt: null }, _count: { _all: true } }),
    prisma.physicalCard.count({ where: { archivedAt: { not: null } } }),
    prisma.physicalCard.count({ where: { archivedAt: null, activatedAt: { gte: istanbulDayStart(now, 6) } } }),
    prisma.physicalCard.count({ where: buildCardWhere({ usage: 'idle' }, now) }),
  ]);
  const s: CardStats = { total: 0, UNUSED: 0, ACTIVATED: 0, BLOCKED: 0, archived, activatedLast7d, idleActive };
  for (const g of groups) {
    s[g.status] = g._count._all;
    s.total += g._count._all;
  }
  return s;
}

// ───────────────────────────── Partiler ─────────────────────────────

export const EXPORT_ACTIONS = ['CARDS_EXPORTED', 'CARDS_PRINTED'] as const;

export async function listBatches(opts: { page: number; size: number; q?: string }): Promise<BatchPage> {
  const where: Prisma.CardBatchWhereInput = opts.q
    ? { OR: [{ name: { contains: opts.q, mode: 'insensitive' } }, { id: { contains: opts.q, mode: 'insensitive' } }] }
    : {};
  const [rows, total] = await Promise.all([
    prisma.cardBatch.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (opts.page - 1) * opts.size,
      take: opts.size,
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.cardBatch.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const [groups, archivedGroups, exports] = ids.length
    ? await Promise.all([
        prisma.physicalCard.groupBy({ by: ['batchId', 'status'], where: { batchId: { in: ids }, archivedAt: null }, _count: { _all: true } }),
        prisma.physicalCard.groupBy({ by: ['batchId'], where: { batchId: { in: ids }, archivedAt: { not: null } }, _count: { _all: true } }),
        prisma.auditLog.groupBy({
          by: ['entityId'],
          where: { entity: 'CardBatch', entityId: { in: ids }, action: { in: [...EXPORT_ACTIONS] } },
          _count: { _all: true },
          _max: { createdAt: true },
        }),
      ])
    : [[], [], []];

  const items: BatchRow[] = rows.map((b) => {
    const counts = { UNUSED: 0, ACTIVATED: 0, BLOCKED: 0, archived: 0, total: 0 };
    for (const g of groups) if (g.batchId === b.id) counts[g.status] += g._count._all;
    for (const g of archivedGroups) if (g.batchId === b.id) counts.archived += g._count._all;
    counts.total = counts.UNUSED + counts.ACTIVATED + counts.BLOCKED + counts.archived;
    const ex = exports.find((e) => e.entityId === b.id);
    return {
      id: b.id,
      name: b.name,
      prefix: b.prefix,
      quantity: b.quantity,
      createdAt: b.createdAt.toISOString(),
      createdBy: b.createdBy ? { id: b.createdBy.id, name: b.createdBy.name, email: b.createdBy.email } : null,
      counts,
      lastExportedAt: iso(ex?._max.createdAt ?? null),
      exportCount: ex?._count._all ?? 0,
    };
  });
  return { items, total, page: opts.page, size: opts.size, pageCount: Math.max(1, Math.ceil(total / opts.size)) };
}

/** Filtre seçicisi için en yeni 200 parti (ad + kimlik). */
export async function batchOptions(): Promise<Array<{ id: string; name: string }>> {
  return prisma.cardBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true } });
}

// ───────────────────────────── Detay ─────────────────────────────

const AUDIT_TITLES: Record<string, { title: string; tone: CardTimelineEvent['tone'] }> = {
  CREATED: { title: 'Kart üretildi', tone: 'neutral' },
  ACTIVATED: { title: 'Müşteri kartı aktive etti', tone: 'success' },
  ADMIN_ASSIGNED: { title: 'Yönetici müşteriye atadı', tone: 'success' },
  ADMIN_UNASSIGNED: { title: 'Yönetici müşteriden kaldırdı', tone: 'warning' },
  BLOCKED: { title: 'Kart bloklandı', tone: 'danger' },
  UNBLOCKED: { title: 'Blok kaldırıldı', tone: 'info' },
  ARCHIVED: { title: 'Kart arşivlendi', tone: 'danger' },
  SCANNED: { title: 'Kart tarandı', tone: 'neutral' },
  CONSUMPTION_ADDED: { title: 'Tüketim eklendi', tone: 'brand' },
  RELEASED_ORPHAN: { title: 'Sahipsiz kart serbest bırakıldı', tone: 'info' },
  FROZEN: { title: 'Sahibi kartı dondurdu', tone: 'warning' },
  UNFROZEN: { title: 'Sahibi dondurmayı kaldırdı', tone: 'info' },
};

function auditDescription(action: string, meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  if ((action === 'BLOCKED' || action === 'UNBLOCKED') && typeof m.reason === 'string' && m.reason) return m.reason;
  if (action === 'ADMIN_UNASSIGNED' && typeof m.consumptionCount === 'number') return `${m.consumptionCount} tüketim kaydı korundu`;
  if (typeof m.bulk === 'boolean' && m.bulk) return 'Toplu işlemle';
  return null;
}

export function allowedActions(card: { status: CardStatus; customerId: string | null; archivedAt: Date | null }) {
  const archived = !!card.archivedAt;
  const unblockTo: CardStatus | null = card.status === 'BLOCKED' && !archived ? (card.customerId ? 'ACTIVATED' : 'UNUSED') : null;
  return {
    allowed: {
      assign: !archived && card.status === 'UNUSED' && !card.customerId,
      unassign: !archived && card.status === 'ACTIVATED' && !!card.customerId,
      block: !archived && card.status !== 'BLOCKED',
      unblock: unblockTo != null,
      archive: !archived,
    },
    unblockTo,
  };
}

export async function getCardDetail(id: string): Promise<CardDetail> {
  const card = await prisma.physicalCard.findUnique({
    where: { id },
    select: {
      ...listSelect,
      customerId: true,
      updatedAt: true,
      auditLogs: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!card) throw new ApiError('NOT_FOUND', 'Kart bulunamadı.');
  const [consumptions, batch] = await Promise.all([
    prisma.consumption.findMany({
      where: { cardId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        dealer: { select: { name: true, businessName: true } },
        product: { select: { name: true } },
        review: { select: { rating: true } },
      },
    }),
    card.batchId ? prisma.cardBatch.findUnique({ where: { id: card.batchId }, select: { name: true, createdAt: true } }) : Promise.resolve(null),
  ]);
  const names = new Map<string, string>(card.batchId && batch ? [[card.batchId, batch.name]] : []);
  const base = toItem(card, names, cardOrigin());
  const { allowed, unblockTo } = allowedActions({ status: card.status, customerId: card.customerId, archivedAt: card.archivedAt });

  const timeline: CardTimelineEvent[] = [
    ...card.auditLogs.map((a) => {
      const t = AUDIT_TITLES[a.action] ?? { title: a.action, tone: 'neutral' as const };
      return {
        id: `a-${a.id}`,
        kind: 'audit' as const,
        action: a.action,
        title: t.title,
        description: auditDescription(a.action, a.metadata),
        at: a.createdAt.toISOString(),
        actor: a.user ? a.user.name || a.user.email : null,
        tone: t.tone,
      };
    }),
    ...consumptions.map((c) => ({
      id: `c-${c.id}`,
      kind: 'consumption' as const,
      action: 'CONSUMPTION',
      title: `Tüketim · ${c.dealer.businessName || c.dealer.name || 'Bayi'}`,
      description: [c.product?.name, c.review ? `Yorum ${c.review.rating}/5` : null].filter(Boolean).join(' · ') || null,
      at: c.createdAt.toISOString(),
      actor: null,
      tone: 'brand' as const,
    })),
  ];
  // Kart oluşturma olayı CardAuditLog'a yazılmıyordu: oluşturma zamanı kaydın kendisinden gelir.
  if (!card.auditLogs.some((a) => a.action === 'CREATED')) {
    timeline.push({
      id: `created-${card.id}`,
      kind: 'audit',
      action: 'CREATED',
      title: batch ? `Kart üretildi · ${batch.name}` : 'Kart üretildi',
      description: null,
      at: card.createdAt.toISOString(),
      actor: null,
      tone: 'neutral',
    });
  }
  timeline.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return {
    ...base,
    batchCreatedAt: iso(batch?.createdAt ?? null),
    updatedAt: card.updatedAt.toISOString(),
    allowed,
    unblockTo,
    consumptionsRecent: consumptions.map((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      dealerName: c.dealer.businessName || c.dealer.name,
      productName: c.product?.name ?? null,
      amount: c.amount,
      rating: c.review?.rating ?? null,
    })),
    timeline,
  };
}

// ───────────────────────────── Müşteri arama ─────────────────────────────

export async function lookupCustomers(q: string | undefined): Promise<CustomerOption[]> {
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    anonymizedAt: null,
    suspendedAt: null,
    ...(q
      ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { id: q }] }
      : {}),
  };
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, name: true, email: true, _count: { select: { physicalCards: { where: { status: 'ACTIVATED', archivedAt: null } } } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, activeCards: r._count.physicalCards }));
}

// ───────────────────────────── Üretim ─────────────────────────────

const CHUNK = 500;
const MAX_ROUNDS = 5;

export async function generateBatch(body: GenerateBody, actor: Actor, meta: ReqMeta, makeToken = generateCardToken): Promise<GenerateResult> {
  const batchId = `BATCH_${istanbulStamp(new Date())}_${makeToken().replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.cardBatch.create({
        data: { id: batchId, name: body.batchName, quantity: body.quantity, prefix: body.prefix ?? null, createdById: actor.id },
      });
      const seen = new Set<string>();
      let created = 0;
      for (let round = 0; round < MAX_ROUNDS && created < body.quantity; round++) {
        let remaining = body.quantity - created;
        while (remaining > 0) {
          const n = Math.min(CHUNK, remaining);
          const data: Prisma.PhysicalCardCreateManyInput[] = [];
          while (data.length < n) {
            const t = makeToken(body.prefix);
            if (seen.has(t)) continue;
            seen.add(t);
            data.push({ token: t, batchId: batch.id, status: 'UNUSED' });
          }
          const r = await tx.physicalCard.createMany({ data, skipDuplicates: true });
          created += r.count;
          remaining -= n;
        }
      }
      if (created < body.quantity) {
        throw new ApiError('CONFLICT', `Benzersiz kart kodu üretilemedi (${created}/${body.quantity}). Lütfen tekrar deneyin.`, { retryable: true });
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          actorType: 'user',
          action: 'CARDS_GENERATED',
          entity: 'CardBatch',
          entityId: batch.id,
          newData: { batchId: batch.id, batchName: body.batchName, quantity: created, prefix: body.prefix ?? null },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });
      return {
        batch: { id: batch.id, name: batch.name, quantity: created, prefix: batch.prefix, createdAt: batch.createdAt.toISOString() },
        created,
      };
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
}

function istanbulStamp(d: Date): string {
  const l = new Date(d.getTime() + ISTANBUL_OFFSET_MS);
  return `${l.getUTCFullYear()}${String(l.getUTCMonth() + 1).padStart(2, '0')}${String(l.getUTCDate()).padStart(2, '0')}`;
}

// ───────────────────────────── Toplu işlem ─────────────────────────────

const BULK_MAX = 5_000;

type BulkCard = { id: string; token: string; status: CardStatus; customerId: string | null; archivedAt: Date | null; blockedAt: Date | null; blockReason: string | null };

function planFor(action: BulkBody['action'], c: BulkCard): { ok: true; to: CardStatus } | { ok: false; reason: string } {
  if (action === 'archive') return c.archivedAt ? { ok: false, reason: 'Zaten arşivde' } : { ok: true, to: 'BLOCKED' };
  if (action === 'block') {
    if (c.archivedAt) return { ok: false, reason: 'Arşivlenmiş kart' };
    if (c.status === 'BLOCKED') return { ok: false, reason: 'Zaten bloklu' };
    return { ok: true, to: 'BLOCKED' };
  }
  if (c.status !== 'BLOCKED' || c.archivedAt) return { ok: false, reason: c.archivedAt ? 'Arşivlenmiş kart' : 'Bloklu değil' };
  const to: CardStatus = c.customerId ? 'ACTIVATED' : 'UNUSED';
  const check = checkStatusChange(c, to);
  return check.ok ? { ok: true, to } : { ok: false, reason: check.message };
}

export async function bulkCards(body: BulkBody, actor: Actor, meta: ReqMeta): Promise<BulkResult> {
  const where: Prisma.PhysicalCardWhereInput = body.ids ? { id: { in: body.ids } } : { batchId: body.batchId };
  const cards: BulkCard[] = await prisma.physicalCard.findMany({
    where,
    take: BULK_MAX + 1,
    select: { id: true, token: true, status: true, customerId: true, archivedAt: true, blockedAt: true, blockReason: true },
  });
  if (cards.length === 0) throw new ApiError('NOT_FOUND', body.batchId ? 'Partide kart bulunamadı.' : 'Seçili kartlar bulunamadı.');
  if (cards.length > BULK_MAX) throw new ApiError('BAD_REQUEST', `Tek seferde en fazla ${BULK_MAX.toLocaleString('tr-TR')} kart işlenebilir.`);

  const skipped: BulkResult['skipped'] = [];
  const todo: Array<{ card: BulkCard; to: CardStatus }> = [];
  for (const c of cards) {
    const p = planFor(body.action, c);
    if (p.ok) todo.push({ card: c, to: p.to });
    else skipped.push({ id: c.id, token: c.token, reason: p.reason });
  }
  if (body.dryRun) return { action: body.action, matched: cards.length, done: todo.length, skipped, dryRun: true };

  const reason = body.action === 'block' && body.reasonCode ? composeBlockReason(body.reasonCode, body.note) : null;
  const now = new Date();
  const notifyIds = new Set<string>();

  const done = await prisma.$transaction(
    async (tx) => {
      let n = 0;
      for (const { card, to } of todo) {
        const data =
          body.action === 'archive'
            ? { archivedAt: now, status: 'BLOCKED' as const, blockedAt: card.blockedAt ?? now, blockReason: card.blockReason ?? CARD_ARCHIVE_BLOCK_REASON }
            : statusChangeData(card.status, to, reason);
        const w = await tx.physicalCard.updateMany({
          where: { id: card.id, status: card.status, customerId: card.customerId, archivedAt: null },
          data,
        });
        if (w.count === 0) {
          skipped.push({ id: card.id, token: card.token, reason: 'Bu sırada başka bir işlemle değişti' });
          continue;
        }
        n++;
        await tx.cardAuditLog.create({
          data: {
            cardId: card.id,
            userId: actor.id,
            action: body.action === 'archive' ? 'ARCHIVED' : body.action === 'block' ? 'BLOCKED' : 'UNBLOCKED',
            metadata: { previousStatus: card.status, newStatus: to, reason, reasonCode: body.reasonCode ?? null, bulk: todo.length > 1, batchId: body.batchId ?? null },
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          },
        });
        if (body.notify && card.customerId) notifyIds.add(card.customerId);
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          actorType: 'user',
          action: body.action === 'archive' ? 'CARDS_ARCHIVED' : body.action === 'block' ? 'CARDS_BLOCKED' : 'CARDS_UNBLOCKED',
          entity: body.batchId ? 'CardBatch' : 'PhysicalCard',
          entityId: body.batchId ?? (todo.length === 1 ? todo[0].card.id : `${todo.length} kart`),
          newData: { count: n, reasonCode: body.reasonCode ?? null, reason, skipped: skipped.length, ids: todo.slice(0, 100).map((t) => t.card.id) },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });
      if (notifyIds.size) {
        const title = body.action === 'unblock' ? 'Kartınız yeniden kullanıma açıldı' : 'Kartınız kullanıma kapatıldı';
        const message =
          body.action === 'unblock'
            ? 'QRateX kartınızdaki engel kaldırıldı; kartınızı bayilerde yeniden kullanabilirsiniz.'
            : `QRateX kartınız güvenliğiniz için kullanıma kapatıldı${reason ? ` (${reason})` : ''}. Sorularınız için destekle iletişime geçebilirsiniz.`;
        await tx.notification.createMany({
          data: [...notifyIds].map((userId) => ({
            userId,
            title,
            message,
            type: body.action === 'unblock' ? 'success' : 'warning',
            data: { actionUrl: '/customer/wallet/card' },
          })),
        });
      }
      return n;
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
  return { action: body.action, matched: cards.length, done, skipped, dryRun: false };
}

// ───────────────────────────── Dışa aktarım ─────────────────────────────

export const EXPORT_HEADER = ['Sıra', 'Token', 'Kart URL', 'Parti', 'Parti kimliği', 'Durum', 'Arşiv', 'Müşteri e-postası', 'Tüketim', 'Üretim', 'Aktivasyon'];

const STATUS_TR: Record<CardStatus, string> = { UNUSED: 'Kullanılmamış', ACTIVATED: 'Aktif', BLOCKED: 'Bloklu' };

export async function exportCards(filters: CardFilters, sort: string | undefined): Promise<{ rows: unknown[][]; count: number; truncated: boolean }> {
  const where = buildCardWhere(filters);
  // Partiye özel baskı listesinde sıra numarası üretim sırasıdır.
  const orderBy: Prisma.PhysicalCardOrderByWithRelationInput[] = filters.batch && !sort ? [{ createdAt: 'asc' }, { id: 'asc' }] : buildCardOrderBy(sort);
  const rows: unknown[][] = [];
  const origin = cardOrigin();
  let cursor: string | undefined;
  const names = new Map<string, string>();
  while (rows.length < CARD_EXPORT_MAX) {
    const page = await prisma.physicalCard.findMany({
      where,
      orderBy,
      take: Math.min(1000, CARD_EXPORT_MAX - rows.length),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...listSelect, consumptions: false },
    });
    if (!page.length) break;
    const missing = page.map((r) => r.batchId).filter((b): b is string => !!b && !names.has(b));
    if (missing.length) for (const [k, v] of await batchNameMap(missing)) names.set(k, v);
    for (const r of page) {
      rows.push([
        rows.length + 1,
        r.token,
        buildCardUrl(r.token, origin),
        r.batchId ? names.get(r.batchId) ?? '' : '',
        r.batchId ?? '',
        STATUS_TR[r.status],
        r.archivedAt ? 'Evet' : 'Hayır',
        r.customer?.email ?? '',
        r._count.consumptions,
        r.createdAt.toISOString(),
        r.activatedAt ? r.activatedAt.toISOString() : '',
      ]);
    }
    cursor = page[page.length - 1].id;
    if (page.length < 1000) break;
  }
  const total = await prisma.physicalCard.count({ where });
  return { rows, count: rows.length, truncated: total > rows.length };
}

/** Baskı sayfası: partinin kartları üretim sırasıyla, sayfa sayfa. */
export async function printBatchPage(batchId: string, page: number, size: number) {
  const batch = await prisma.cardBatch.findUnique({ where: { id: batchId }, select: { id: true, name: true, createdAt: true } });
  if (!batch) return null;
  const where: Prisma.PhysicalCardWhereInput = { batchId, archivedAt: null };
  const [cards, total] = await Promise.all([
    prisma.physicalCard.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * size, take: size, select: { id: true, token: true } }),
    prisma.physicalCard.count({ where }),
  ]);
  const origin = cardOrigin();
  return {
    batch: { id: batch.id, name: batch.name, createdAt: batch.createdAt.toISOString() },
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / size)),
    cards: cards.map((c, i) => ({ seq: (page - 1) * size + i + 1, id: c.id, token: c.token, url: buildCardUrl(c.token, origin) })),
  };
}

/** Route bağlamından denetim aktörü. */
export function routeActor(session: { user: { id: string; email?: string | null; role?: string | null; name?: string | null } }): Actor {
  return { id: session.user.id, email: session.user.email ?? null, role: session.user.role ?? null, name: session.user.name ?? null };
}

export async function recordBatchExport(action: (typeof EXPORT_ACTIONS)[number], batchId: string | null, count: number, filters: unknown, actor: Actor, meta: ReqMeta) {
  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      actorType: 'user',
      action,
      entity: batchId ? 'CardBatch' : 'PhysicalCard',
      entityId: batchId ?? `${count} kart`,
      newData: { rows: count, filters } as Prisma.InputJsonValue,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
}
