/**
 * Admin → Kuponlar (Dalga 2) — sunucu çekirdeği.
 *
 *  - Durum türetilir ve SQL'de filtrelenir (alan referansı `usedCount >= maxUses`).
 *  - Oluşturma: transaction içinde kupon + denetim; P2002 → 409 (ön kontrol yalnız UX).
 *  - Düzenleme: iyimser eşzamanlılık (`updatedAt`), ilk kullanımdan sonra kod/tür/değer kilitli,
 *    limit mevcut kullanımın altına inemez, eski/yeni fark denetime yazılır, tekrar pasifleştirme
 *    denetim satırı üretmez.
 *  - Toplu üretim: tek kullanımlık N kod, kriptografik rastgele sonek, çakışmada yeniden dener.
 */
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import {
  COUPON_STATUSES,
  csvCell,
  deriveCouponStatus,
  formatCouponValue,
  STATUS_LABEL,
  type CouponBatchInput,
  type CouponCounts,
  type CouponCreateInput,
  type CouponDetail,
  type CouponListItem,
  type CouponListPage,
  type CouponListQuery,
  type CouponStats,
  type CouponStatus,
  type CouponType,
  type CouponUpdateInput,
} from './contract';

type Db = typeof prisma;
type ReqLike = { headers: { get(name: string): string | null } } | null;

const DAY = 86_400_000;
const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

function istanbulDayStart(now: Date, daysAgo = 0): Date {
  const local = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysAgo * DAY - ISTANBUL_OFFSET_MS);
}
const dayKey = (d: Date) => new Date(d.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);

const SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  maxUses: true,
  usedCount: true,
  expiresAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
type Row = Prisma.CouponGetPayload<{ select: typeof SELECT }>;

export function toItem(c: Row, now: Date = new Date()): CouponListItem {
  return {
    id: c.id,
    code: c.code,
    type: (c.type === 'fixed' ? 'fixed' : 'percentage') as CouponType,
    value: c.value,
    maxUses: c.maxUses === -1 ? null : c.maxUses,
    usedCount: c.usedCount,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    isActive: c.isActive,
    status: deriveCouponStatus(c, now),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Durum filtresi → Prisma koşulu. `fields` alan referansı (test edilebilirlik için parametre). */
export function statusWhere(status: CouponStatus, now: Date, db: Db = prisma): Prisma.CouponWhereInput {
  const notExpired: Prisma.CouponWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  switch (status) {
    case 'inactive':
      return { isActive: false };
    case 'expired':
      return { isActive: true, expiresAt: { lte: now } };
    case 'exhausted':
      return { AND: [{ isActive: true }, notExpired, { maxUses: { not: -1 } }, { usedCount: { gte: db.coupon.fields.maxUses } }] };
    case 'usable':
      return {
        AND: [{ isActive: true }, notExpired, { OR: [{ maxUses: -1 }, { usedCount: { lt: db.coupon.fields.maxUses } }] }],
      };
  }
}

async function countsFor(now: Date, db: Db, extra: Prisma.CouponWhereInput = {}): Promise<CouponCounts> {
  const entries = await Promise.all(
    COUPON_STATUSES.map(async (s) => [s, await db.coupon.count({ where: { AND: [extra, statusWhere(s, now, db)] } })] as const)
  );
  return Object.fromEntries(entries) as CouponCounts;
}

function orderFor(sort: CouponListQuery['sort']): Prisma.CouponOrderByWithRelationInput[] {
  if (sort === 'used') return [{ usedCount: 'desc' }, { createdAt: 'desc' }];
  if (sort === 'expiring') return [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}

export async function listCoupons(q: CouponListQuery, now: Date = new Date(), db: Db = prisma): Promise<CouponListPage> {
  const search: Prisma.CouponWhereInput = q.q ? { code: { contains: q.q, mode: 'insensitive' } } : {};
  const where: Prisma.CouponWhereInput = q.status === 'all' ? search : { AND: [search, statusWhere(q.status, now, db)] };
  const [rows, total, counts] = await Promise.all([
    db.coupon.findMany({ where, select: SELECT, orderBy: orderFor(q.sort), skip: (q.page - 1) * q.size, take: q.size }),
    db.coupon.count({ where }),
    countsFor(now, db, search),
  ]);
  return { items: rows.map((r) => toItem(r, now)), total, page: q.page, size: q.size, counts };
}

export async function exportCouponsCsv(q: CouponListQuery, now: Date = new Date(), db: Db = prisma): Promise<string> {
  const search: Prisma.CouponWhereInput = q.q ? { code: { contains: q.q, mode: 'insensitive' } } : {};
  const where: Prisma.CouponWhereInput = q.status === 'all' ? search : { AND: [search, statusWhere(q.status, now, db)] };
  const rows = await db.coupon.findMany({ where, select: SELECT, orderBy: orderFor(q.sort), take: 5_000 });
  const head = ['Kod', 'Tür', 'Değer', 'Durum', 'Kullanım', 'Limit', 'Son kullanım', 'Oluşturulma'];
  const lines = rows.map((r) => {
    const it = toItem(r, now);
    return [it.code, it.type === 'percentage' ? 'Yüzde' : 'Sabit (₺)', formatCouponValue(it.type, it.value), STATUS_LABEL[it.status], it.usedCount, it.maxUses ?? 'Sınırsız', it.expiresAt ?? '', it.createdAt]
      .map(csvCell)
      .join(';');
  });
  return '﻿' + [head.join(';'), ...lines].join('\r\n');
}

async function redemptionSeries(db: Db, now: Date, couponId?: string): Promise<number[]> {
  const from = istanbulDayStart(now, 13);
  const rows = await db.$queryRaw<Array<{ day: string; n: unknown }>>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "day", COUNT(*) AS "n"
    FROM "CouponRedemption"
    WHERE "createdAt" >= ${from} ${couponId ? Prisma.sql`AND "couponId" = ${couponId}` : Prisma.empty}
    GROUP BY 1`;
  const map = new Map(rows.map((r) => [r.day, Number(r.n)]));
  const out: number[] = [];
  for (let i = 13; i >= 0; i--) out.push(map.get(dayKey(istanbulDayStart(now, i))) ?? 0);
  return out;
}

export async function getCouponStats(now: Date = new Date(), db: Db = prisma): Promise<CouponStats> {
  const [counts, redemptions7d, redemptions14d, expiringSoon, boxes] = await Promise.all([
    countsFor(now, db),
    db.couponRedemption.count({ where: { createdAt: { gte: istanbulDayStart(now, 6) } } }),
    redemptionSeries(db, now),
    db.coupon.count({ where: { AND: [statusWhere('usable', now, db), { expiresAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } }] } }),
    db.$queryRaw<Array<{ pending: unknown; opened: unknown }>>`
      SELECT COUNT(*) FILTER (WHERE b."openedAt" IS NULL) AS "pending", COUNT(b."openedAt") AS "opened"
      FROM "UserSurpriseBox" b
      WHERE b."dayKey" IS NULL AND b."withdrawnAt" IS NULL AND b."couponCode" IS NOT NULL`,
  ]);
  return {
    counts,
    redemptions7d,
    redemptions14d,
    expiringSoon,
    boxesPending: Number(boxes[0]?.pending ?? 0),
    boxesOpened: Number(boxes[0]?.opened ?? 0),
  };
}

const AUDITED_FIELDS = ['code', 'type', 'value', 'maxUses', 'expiresAt', 'isActive'] as const;

function snapshot(c: Row) {
  return {
    code: c.code,
    type: c.type,
    value: c.value,
    maxUses: c.maxUses === -1 ? null : c.maxUses,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    isActive: c.isActive,
  };
}

const FIELD_LABEL: Record<string, string> = { code: 'kod', type: 'tür', value: 'değer', maxUses: 'limit', expiresAt: 'son kullanım', isActive: 'durum' };

export async function getCoupon(id: string, now: Date = new Date(), db: Db = prisma): Promise<CouponDetail> {
  const c = await db.coupon.findUnique({ where: { id }, select: SELECT });
  if (!c) throw new ApiError('NOT_FOUND', 'Kupon bulunamadı.');
  const [reds, series, boxes, audits] = await Promise.all([
    db.couponRedemption.findMany({ where: { couponId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { userId: true, createdAt: true } }),
    redemptionSeries(db, now, id),
    db.userSurpriseBox.groupBy({ by: ['dayKey'], where: { couponCode: c.code, dayKey: null, withdrawnAt: null }, _count: { _all: true, openedAt: true } }),
    db.auditLog.findMany({
      where: { entity: 'Coupon', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, createdAt: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const users = reds.length
    ? await db.user.findMany({ where: { id: { in: [...new Set(reds.map((r) => r.userId))] } }, select: { id: true, name: true, email: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const b = boxes[0]?._count;
  return {
    coupon: toItem(c, now),
    locked: c.usedCount > 0,
    redemptions: reds.map((r) => ({ userId: r.userId, name: byId.get(r.userId)?.name ?? null, email: byId.get(r.userId)?.email ?? null, at: r.createdAt.toISOString() })),
    redemptions14d: series,
    boxes: { total: b?._all ?? 0, opened: b?.openedAt ?? 0 },
    audit: audits.map((a) => {
      const oldD = (a.oldData ?? {}) as Record<string, unknown>;
      const newD = (a.newData ?? {}) as Record<string, unknown>;
      const changes = a.action === 'UPDATE_COUPON' ? Object.keys(newD).filter((k) => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k])).map((k) => FIELD_LABEL[k] ?? k) : [];
      const snap = (a.actorSnapshot ?? {}) as Record<string, unknown>;
      return {
        id: a.id,
        action: a.action,
        at: a.createdAt.toISOString(),
        actorName: a.user?.name || a.user?.email || (typeof snap.name === 'string' ? snap.name : null) || (typeof snap.email === 'string' ? snap.email : null),
        changes,
      };
    }),
  };
}

function isUnique(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError ? e.code === 'P2002' : (e as { code?: unknown })?.code === 'P2002';
}

export async function createCoupon(input: CouponCreateInput, actor: AuditActor, request: ReqLike, now: Date = new Date(), db: Db = prisma): Promise<CouponListItem> {
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now.getTime()) {
    throw new ApiError('VALIDATION', 'Son kullanım tarihi gelecekte olmalı.', { details: [{ path: 'expiresAt', message: 'Son kullanım tarihi gelecekte olmalı.' }] });
  }
  const exists = await db.coupon.findUnique({ where: { code: input.code }, select: { id: true } });
  if (exists) throw new ApiError('CONFLICT', `"${input.code}" kodu zaten kullanılıyor.`, { details: [{ path: 'code', message: 'Bu kod zaten var.' }] });
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.coupon.create({
        data: {
          code: input.code,
          type: input.type,
          value: input.value,
          maxUses: input.maxUses ?? -1,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          isActive: true,
        },
        select: SELECT,
      });
      await tx.auditLog.create({ data: auditEntry(actor, { action: 'CREATE_COUPON', entity: 'Coupon', entityId: c.id, newData: snapshot(c) }, request) });
      return toItem(c, now);
    });
  } catch (e) {
    if (isUnique(e)) throw new ApiError('CONFLICT', `"${input.code}" kodu zaten kullanılıyor.`, { details: [{ path: 'code', message: 'Bu kod zaten var.' }] });
    throw e;
  }
}

export async function updateCoupon(id: string, input: CouponUpdateInput, actor: AuditActor, request: ReqLike, now: Date = new Date(), db: Db = prisma): Promise<CouponListItem> {
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.coupon.findUnique({ where: { id }, select: SELECT });
      if (!c) throw new ApiError('NOT_FOUND', 'Kupon bulunamadı.');
      if (c.updatedAt.getTime() !== new Date(input.baseVersion).getTime()) {
        throw new ApiError('CONFLICT', 'Kupon siz düzenlerken başka biri tarafından değiştirildi. Güncel hâlini yükleyip tekrar deneyin.', { details: { stale: true } });
      }
      const data: Prisma.CouponUpdateInput = {};
      const locked = c.usedCount > 0;
      const coreChange =
        (input.code !== undefined && input.code !== c.code) ||
        (input.type !== undefined && input.type !== c.type) ||
        (input.value !== undefined && input.value !== c.value);
      if (coreChange && locked) {
        throw new ApiError('CONFLICT', 'Kupon kullanılmaya başladı; kod, tür ve değer artık değiştirilemez. Yeni bir kupon oluşturun.');
      }
      if (input.code !== undefined && input.code !== c.code) data.code = input.code;
      if (input.type !== undefined) data.type = input.type;
      if (input.value !== undefined) data.value = input.value;
      const nextType = input.type ?? c.type;
      const nextValue = input.value ?? c.value;
      if (nextType === 'percentage' && nextValue > 100) throw new ApiError('VALIDATION', 'Yüzde indirim 100’den büyük olamaz.');
      if (input.maxUses !== undefined) {
        if (input.maxUses !== null && input.maxUses < c.usedCount) {
          throw new ApiError('VALIDATION', `Limit mevcut kullanımın (${c.usedCount.toLocaleString('tr-TR')}) altına inemez.`, { details: [{ path: 'maxUses', message: 'Mevcut kullanımın altına inemez.' }] });
        }
        data.maxUses = input.maxUses ?? -1;
      }
      if (input.expiresAt !== undefined) {
        const changed = (input.expiresAt ? new Date(input.expiresAt).getTime() : null) !== (c.expiresAt?.getTime() ?? null);
        if (changed && input.expiresAt && new Date(input.expiresAt).getTime() <= now.getTime()) {
          throw new ApiError('VALIDATION', 'Son kullanım tarihi gelecekte olmalı.', { details: [{ path: 'expiresAt', message: 'Gelecekte bir tarih seçin.' }] });
        }
        data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      }
      if (input.isActive !== undefined) data.isActive = input.isActive;

      // Koşullu yazım: aynı sürüm üzerinde (yarışta ikinci yazan 409 alır).
      const res = await tx.coupon.updateMany({ where: { id, updatedAt: c.updatedAt }, data: data as Prisma.CouponUpdateManyMutationInput });
      if (res.count === 0) throw new ApiError('CONFLICT', 'Kupon aynı anda değiştirildi. Güncel hâlini yükleyip tekrar deneyin.', { details: { stale: true } });
      const next = await tx.coupon.findUniqueOrThrow({ where: { id }, select: SELECT });

      const before = snapshot(c);
      const after = snapshot(next);
      const changed = AUDITED_FIELDS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      if (changed.length > 0) {
        const onlyActive = changed.length === 1 && changed[0] === 'isActive';
        const action = onlyActive ? (next.isActive ? 'ACTIVATE_COUPON' : 'DEACTIVATE_COUPON') : 'UPDATE_COUPON';
        await tx.auditLog.create({
          data: auditEntry(
            actor,
            {
              action,
              entity: 'Coupon',
              entityId: id,
              oldData: Object.fromEntries(changed.map((k) => [k, before[k]])),
              newData: Object.fromEntries(changed.map((k) => [k, after[k]])),
            },
            request
          ),
        });
      }
      return toItem(next, now);
    });
  } catch (e) {
    if (isUnique(e)) throw new ApiError('CONFLICT', 'Bu kod başka bir kuponda kullanılıyor.', { details: [{ path: 'code', message: 'Bu kod zaten var.' }] });
    throw e;
  }
}

/** Eski `DELETE ?id=` sözleşmesi: idempotent pasifleştirme; zaten pasifse denetim yazmaz. */
export async function deactivateCoupon(id: string, actor: AuditActor, request: ReqLike, db: Db = prisma): Promise<{ changed: boolean }> {
  return db.$transaction(async (tx) => {
    const c = await tx.coupon.findUnique({ where: { id }, select: { id: true, code: true } });
    if (!c) throw new ApiError('NOT_FOUND', 'Kupon bulunamadı.');
    const res = await tx.coupon.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
    if (res.count === 0) return { changed: false };
    await tx.auditLog.create({
      data: auditEntry(actor, { action: 'DEACTIVATE_COUPON', entity: 'Coupon', entityId: id, oldData: { code: c.code, isActive: true }, newData: { isActive: false } }, request),
    });
    return { changed: true };
  });
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // karışan 0/O/1/I yok

export function randomSuffix(len = 6, rand: (max: number) => number = (m) => randomInt(m)): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[rand(ALPHABET.length)];
  return s;
}

export async function createCouponBatch(
  input: CouponBatchInput,
  actor: AuditActor,
  request: ReqLike,
  now: Date = new Date(),
  db: Db = prisma
): Promise<{ batchId: string; codes: string[] }> {
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now.getTime()) {
    throw new ApiError('VALIDATION', 'Son kullanım tarihi gelecekte olmalı.', { details: [{ path: 'expiresAt', message: 'Gelecekte bir tarih seçin.' }] });
  }
  const batchId = `cb_${now.getTime().toString(36)}${randomSuffix(4).toLowerCase()}`;
  const wanted = new Set<string>();
  const codes: string[] = [];
  for (let attempt = 0; attempt < 4 && codes.length < input.count; attempt++) {
    wanted.clear();
    while (wanted.size < input.count - codes.length) wanted.add(`${input.prefix}-${randomSuffix()}`);
    const candidates = [...wanted];
    const taken = await db.coupon.findMany({ where: { code: { in: candidates } }, select: { code: true } });
    const takenSet = new Set(taken.map((t) => t.code));
    const fresh = candidates.filter((c) => !takenSet.has(c));
    if (fresh.length === 0) continue;
    const created = await db.$transaction(async (tx) => {
      const res = await tx.coupon.createMany({
        data: fresh.map((code) => ({
          code,
          type: input.type,
          value: input.value,
          maxUses: 1,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          isActive: true,
        })),
        skipDuplicates: true,
      });
      const rows = await tx.coupon.findMany({ where: { code: { in: fresh } }, select: { id: true, code: true, createdAt: true } });
      const mine = rows.filter((r) => r.createdAt.getTime() >= now.getTime() - 60_000);
      await tx.auditLog.createMany({
        data: mine.map((r) =>
          auditEntry(actor, { action: 'CREATE_COUPON_BATCH', entity: 'Coupon', entityId: r.id, newData: { code: r.code, type: input.type, value: input.value, maxUses: 1, expiresAt: input.expiresAt, batchId } }, request)
        ) as Prisma.AuditLogCreateManyInput[],
      });
      return res.count === fresh.length ? fresh : mine.map((r) => r.code);
    });
    codes.push(...created);
  }
  if (codes.length === 0) throw new ApiError('CONFLICT', 'Kod üretilemedi; farklı bir önek deneyin.');
  return { batchId, codes };
}
