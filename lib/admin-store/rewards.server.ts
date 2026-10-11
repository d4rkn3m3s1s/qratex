/**
 * Mağaza ve Ödüller — ÖDÜL kataloğu sunucu mantığı (yetki BFF'te: defineRoute ADMIN + DB rolü).
 *
 * Kurallar (rapor admin_rewards):
 *  - Silme YOK: arşiv (`archivedAt`); alınmış ödüller ve kodlar korunur (B2).
 *  - Oluşturma varsayılanı TASLAK; `isActive` gerçekten uygulanır (B7).
 *  - Düzenleme yalnız değişen alanları yazar + `expectedUpdatedAt` iyimser kilidi → 409 (B6).
 *    Stok formdan mutlak yazılmaz; göreli "stok hareketi" ile değişir (talepleri ezmez).
 *  - Kod havuzu açıkken stok = havuz (elle stok değişmez).
 *  - Her yazma, değişiklikle AYNI transaction'da denetim kaydı yazar.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import {
  LOW_STOCK_THRESHOLD,
  POOL_CODE_RE,
  POOL_MAX,
  REWARD_TYPES,
  rewardUpsertSchema,
  type PoolActionInput,
  type PoolResult,
  type RewardActionInput,
  type RewardDetail,
  type RewardListItem,
  type RewardListQuery,
  type RewardPatchInput,
  type RewardStats,
  type RewardStatus,
  type RewardType,
  type RewardUpsertInput,
  type Paged,
} from './contract';
import { preservePool, readPool, writePool } from './code-pool';
import { DAY_MS, daySeries, diffFields, paginate, toAuditRow, trIncludes } from './shared.server';
import { listRedemptions } from './redemptions.server';

type ReqLike = { headers: { get(name: string): string | null } } | null;

export const REWARD_AUDIT_LABEL: Record<string, string> = {
  CREATE_REWARD: 'Oluşturuldu',
  UPDATE_REWARD: 'Düzenlendi',
  ARCHIVE_REWARD: 'Arşivlendi',
  RESTORE_REWARD: 'Arşivden geri alındı',
  PUBLISH_REWARD: 'Yayınlandı',
  UNPUBLISH_REWARD: 'Taslağa alındı',
  DUPLICATE_REWARD: 'Çoğaltıldı',
  ADJUST_REWARD_STOCK: 'Stok değişti',
  REWARD_CODE_POOL: 'Kod havuzu değişti',
  DELETE_REWARD: 'Silindi (eski)',
};

const EDITABLE = ['name', 'description', 'icon', 'cost', 'type', 'isActive', 'perUserLimit', 'validFrom', 'validUntil'] as const;

type RewardRow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  stock: number;
  type: string;
  metadata: Prisma.JsonValue | null;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const REWARD_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  cost: true,
  stock: true,
  type: true,
  metadata: true,
  isActive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function readRules(metadata: unknown) {
  const m = asRecord(metadata);
  const limit = typeof m.perUserLimit === 'number' && Number.isFinite(m.perUserLimit) ? Math.max(1, Math.floor(m.perUserLimit)) : null;
  const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  return { perUserLimit: limit, validFrom: iso(m.validFrom), validUntil: iso(m.validUntil) };
}

export function rewardStatus(r: Pick<RewardRow, 'archivedAt' | 'isActive' | 'metadata'>, now: Date): RewardStatus {
  if (r.archivedAt) return 'archived';
  if (!r.isActive) return 'draft';
  const rules = readRules(r.metadata);
  if (rules.validUntil && Date.parse(rules.validUntil) < now.getTime()) return 'expired';
  if (rules.validFrom && Date.parse(rules.validFrom) > now.getTime()) return 'scheduled';
  return 'published';
}

const rewardType = (t: string): RewardType => ((REWARD_TYPES as readonly string[]).includes(t) ? (t as RewardType) : 'digital');

function toItem(r: RewardRow, counts: { total: number; d30: number; pending: number }, now: Date): RewardListItem {
  const pool = readPool(r.metadata);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    cost: r.cost,
    stock: r.stock,
    type: rewardType(r.type),
    isActive: r.isActive,
    status: rewardStatus(r, now),
    rules: readRules(r.metadata),
    claimsTotal: counts.total,
    claims30d: counts.d30,
    pending: counts.pending,
    pool: { enabled: pool.enabled, remaining: pool.codes.length },
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

async function loadAll(now: Date): Promise<RewardListItem[]> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [rows, total, d30, pending] = await Promise.all([
    prisma.reward.findMany({ select: REWARD_SELECT, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.userReward.groupBy({ by: ['rewardId'], _count: { _all: true } }),
    prisma.userReward.groupBy({ by: ['rewardId'], where: { redeemedAt: { gte: since } }, _count: { _all: true } }),
    prisma.userReward.groupBy({ by: ['rewardId'], where: { claimedAt: null }, _count: { _all: true } }),
  ]);
  const map = (g: Array<{ rewardId: string; _count: { _all: number } }>) => new Map(g.map((x) => [x.rewardId, x._count._all]));
  const t = map(total);
  const m30 = map(d30);
  const p = map(pending);
  return rows.map((r) => toItem(r, { total: t.get(r.id) ?? 0, d30: m30.get(r.id) ?? 0, pending: p.get(r.id) ?? 0 }, now));
}

function matchesFilter(r: RewardListItem, status: RewardListQuery['status']): boolean {
  if (!status) return r.status !== 'archived';
  if (status === 'soldout') return r.status !== 'archived' && r.stock === 0;
  if (status === 'low') return r.status !== 'archived' && r.stock > 0 && r.stock < LOW_STOCK_THRESHOLD;
  return r.status === status;
}

function sortItems(rows: RewardListItem[], sort: RewardListQuery['sort']): RewardListItem[] {
  const s = sort ?? 'cost';
  const desc = s.startsWith('-');
  const key = desc ? s.slice(1) : s;
  const val = (r: RewardListItem): number | string => {
    switch (key) {
      case 'name':
        return r.name.toLocaleLowerCase('tr-TR');
      case 'claims30d':
        return r.claims30d;
      case 'created':
        return r.createdAt;
      case 'stock':
        return r.stock < 0 ? Number.MAX_SAFE_INTEGER : r.stock;
      default:
        return r.cost;
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === 'string' ? x.localeCompare(String(y), 'tr-TR') : x - (y as number);
    return desc ? -c : c;
  });
}

export async function listRewards(q: RewardListQuery, now = new Date()): Promise<Paged<RewardListItem>> {
  const all = await loadAll(now);
  const needle = q.q?.trim();
  const rows = all.filter(
    (r) =>
      matchesFilter(r, q.status) &&
      (!q.type || r.type === q.type) &&
      (!needle || trIncludes(r.name, needle) || trIncludes(r.description, needle))
  );
  return paginate(sortItems(rows, q.sort), q.page, q.size);
}

export async function getRewardStats(now = new Date()): Promise<RewardStats> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [all, spent, refunds, pendingPhysical] = await Promise.all([
    loadAll(now),
    prisma.pointsLedger.aggregate({ where: { source: 'reward', status: 'posted', createdAt: { gte: since }, delta: { lt: 0 } }, _sum: { delta: true } }),
    prisma.auditLog.count({ where: { action: 'CANCEL_USER_REWARD', createdAt: { gte: since } } }),
    prisma.userReward.count({ where: { claimedAt: null, reward: { type: 'physical' } } }),
  ]);
  const live = all.filter((r) => r.status !== 'archived');
  return {
    published: all.filter((r) => r.status === 'published').length,
    draft: all.filter((r) => r.status === 'draft').length,
    archived: all.filter((r) => r.status === 'archived').length,
    soldOut: live.filter((r) => r.stock === 0).length,
    low: live.filter((r) => r.stock > 0 && r.stock < LOW_STOCK_THRESHOLD).length,
    pendingFulfilment: pendingPhysical,
    claims30d: all.reduce((s, r) => s + r.claims30d, 0),
    spent30d: Math.abs(spent._sum.delta ?? 0),
    refunds30d: refunds,
    asOf: now.toISOString(),
  };
}

async function loadRow(id: string): Promise<RewardRow> {
  const row = await prisma.reward.findUnique({ where: { id }, select: REWARD_SELECT });
  if (!row) throw new ApiError('NOT_FOUND', 'Ödül bulunamadı.');
  return row;
}

async function itemFor(id: string, now = new Date()): Promise<RewardListItem> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [row, total, d30, pending] = await Promise.all([
    loadRow(id),
    prisma.userReward.count({ where: { rewardId: id } }),
    prisma.userReward.count({ where: { rewardId: id, redeemedAt: { gte: since } } }),
    prisma.userReward.count({ where: { rewardId: id, claimedAt: null } }),
  ]);
  return toItem(row, { total, d30, pending }, now);
}

export async function getRewardDetail(id: string, now = new Date()): Promise<RewardDetail> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [item, claims, recent, audit, row] = await Promise.all([
    itemFor(id, now),
    prisma.userReward.findMany({ where: { rewardId: id, redeemedAt: { gte: since } }, select: { redeemedAt: true }, take: 10_000 }),
    listRedemptions({ rewardId: id, page: 1, size: 10 }),
    prisma.auditLog.findMany({
      where: { entity: 'Reward', entityId: id, action: { not: 'CLAIM_REWARD' } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, createdAt: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
    loadRow(id),
  ]);
  return {
    item,
    series: daySeries(claims.map((c) => c.redeemedAt), now),
    recent: recent.items,
    history: audit.map((a) => toAuditRow(a, REWARD_AUDIT_LABEL)),
    poolCodes: readPool(row.metadata).codes.slice(0, 200),
  };
}

function rulesMetadata(v: { perUserLimit: number | null; validFrom: string | null; validUntil: string | null }, prev: unknown) {
  const base = { ...asRecord(prev) };
  delete base.perUserLimit;
  delete base.validFrom;
  delete base.validUntil;
  if (v.perUserLimit) base.perUserLimit = v.perUserLimit;
  if (v.validFrom) base.validFrom = new Date(v.validFrom).toISOString();
  if (v.validUntil) base.validUntil = new Date(v.validUntil).toISOString();
  return preservePool(base, prev);
}

function snapshot(r: RewardRow): Record<string, unknown> {
  const rules = readRules(r.metadata);
  return { name: r.name, description: r.description, icon: r.icon, cost: r.cost, type: r.type, isActive: r.isActive, stock: r.stock, ...rules };
}

export async function createReward(input: RewardUpsertInput, actor: AuditActor, request: ReqLike): Promise<RewardListItem> {
  const v = rewardUpsertSchema.parse(input);
  const created = await prisma.$transaction(async (tx) => {
    const r = await tx.reward.create({
      data: {
        name: v.name,
        description: v.description,
        icon: v.icon,
        cost: v.cost,
        stock: v.stock,
        type: v.type,
        isActive: v.isActive,
        metadata: rulesMetadata(v, null) as Prisma.InputJsonValue,
      },
      select: REWARD_SELECT,
    });
    await tx.auditLog.create({
      data: auditEntry(actor, { action: 'CREATE_REWARD', entity: 'Reward', entityId: r.id, newData: snapshot(r) }, request),
    });
    return r;
  });
  return toItem(created, { total: 0, d30: 0, pending: 0 }, new Date());
}

export async function updateReward(id: string, input: RewardPatchInput, actor: AuditActor, request: ReqLike): Promise<RewardListItem> {
  const current = await loadRow(id);
  if (current.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki ödül düzenlenemez. Önce arşivden geri alın.', { details: { code: 'ARCHIVED' } });
  if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    throw new ApiError('CONFLICT', 'Bu ödül siz düzenlerken değişti. Güncel hâlini yükleyip tekrar deneyin.', { details: { code: 'STALE' } });
  }
  const before = snapshot(current);
  const changes = Object.fromEntries(Object.entries(input.changes).filter(([k]) => (EDITABLE as readonly string[]).includes(k)));
  // Birleşik değer tam şemadan geçer: kısmi PATCH artık maliyeti 0 yapamaz, türü serbest yazamaz (B5).
  const merged = rewardUpsertSchema.parse({ ...before, stock: current.stock, ...changes });
  const after = { ...before, ...merged, stock: current.stock };
  const diff = diffFields(before, after, EDITABLE);
  if (diff.length === 0) return itemFor(id);

  const updated = await prisma.$transaction(async (tx) => {
    // Koşullu yazım: okuma ile yazma arasında başka biri değiştirdiyse 0 satır → 409.
    const n = await tx.reward.updateMany({
      where: { id, updatedAt: current.updatedAt, archivedAt: null },
      data: {
        name: merged.name,
        description: merged.description,
        icon: merged.icon,
        cost: merged.cost,
        type: merged.type,
        isActive: merged.isActive,
        metadata: rulesMetadata(merged, current.metadata) as Prisma.InputJsonValue,
      },
    });
    if (n.count === 0) throw new ApiError('CONFLICT', 'Bu ödül siz düzenlerken değişti. Güncel hâlini yükleyip tekrar deneyin.', { details: { code: 'STALE' } });
    await tx.auditLog.create({
      data: auditEntry(actor, { action: 'UPDATE_REWARD', entity: 'Reward', entityId: id, oldData: before, newData: { ...after, changes: diff } }, request),
    });
    return true;
  });
  void updated;
  return itemFor(id);
}

export async function rewardAction(id: string, input: RewardActionInput, actor: AuditActor, request: ReqLike): Promise<{ item: RewardListItem; createdId?: string }> {
  const r = await loadRow(id);
  const audit = (tx: Prisma.TransactionClient, action: string, oldData: unknown, newData: unknown) =>
    tx.auditLog.create({ data: auditEntry(actor, { action, entity: 'Reward', entityId: id, oldData, newData }, request) });
  const pool = readPool(r.metadata);

  switch (input.action) {
    case 'publish':
    case 'unpublish': {
      if (r.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki ödül yayınlanamaz. Önce arşivden geri alın.');
      const next = input.action === 'publish';
      if (r.isActive === next) return { item: await itemFor(id) };
      await prisma.$transaction(async (tx) => {
        await tx.reward.update({ where: { id }, data: { isActive: next } });
        await audit(tx, next ? 'PUBLISH_REWARD' : 'UNPUBLISH_REWARD', { isActive: r.isActive }, { isActive: next });
      });
      return { item: await itemFor(id) };
    }
    case 'archive': {
      if (r.archivedAt) return { item: await itemFor(id) };
      const [redeemed, unused] = await Promise.all([
        prisma.userReward.count({ where: { rewardId: id } }),
        prisma.userReward.count({ where: { rewardId: id, claimedAt: null } }),
      ]);
      await prisma.$transaction(async (tx) => {
        await tx.reward.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
        await audit(tx, 'ARCHIVE_REWARD', { isActive: r.isActive }, { archived: true, redeemedPreserved: redeemed, unusedCodesPreserved: unused });
      });
      return { item: await itemFor(id) };
    }
    case 'restore': {
      if (!r.archivedAt) return { item: await itemFor(id) };
      // Geri alınan ödül TASLAK döner: yanlışlıkla doğrudan yayına çıkmaz.
      await prisma.$transaction(async (tx) => {
        await tx.reward.update({ where: { id }, data: { archivedAt: null, isActive: false } });
        await audit(tx, 'RESTORE_REWARD', { archived: true }, { archived: false, isActive: false });
      });
      return { item: await itemFor(id) };
    }
    case 'duplicate': {
      const name = `${r.name} (kopya)`.slice(0, 50);
      const copy = await prisma.$transaction(async (tx) => {
        const c = await tx.reward.create({
          data: {
            name,
            description: r.description,
            icon: r.icon,
            cost: r.cost,
            type: r.type,
            // Havuz kodları kopyalanmaz (aynı kod iki ödülde dağıtılamaz).
            stock: pool.enabled ? 0 : r.stock,
            isActive: false,
            metadata: writePool(r.metadata, { enabled: false, codes: [] }) as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: auditEntry(actor, { action: 'DUPLICATE_REWARD', entity: 'Reward', entityId: c.id, newData: { sourceId: id, name } }, request),
        });
        return c;
      });
      return { item: await itemFor(copy.id), createdId: copy.id };
    }
    case 'stock': {
      if (pool.enabled) throw new ApiError('CONFLICT', 'Kod havuzu açıkken stok, havuzdaki kod sayısıdır. Kod ekleyin ya da çıkarın.');
      if (r.stock < 0) throw new ApiError('CONFLICT', 'Bu ödülün stoğu sınırsız. Önce sınırlı stoğa geçin.');
      const delta = input.delta;
      await prisma.$transaction(async (tx) => {
        // Göreli + koşullu: eşzamanlı talepleri ezmez, stok negatife düşmez.
        const n = await tx.reward.updateMany({
          where: { id, stock: { gte: delta < 0 ? -delta : 0 } },
          data: { stock: { increment: delta } },
        });
        if (n.count === 0) throw new ApiError('CONFLICT', 'Stok bu kadar azaltılamaz; mevcut stoktan fazla.');
        await audit(tx, 'ADJUST_REWARD_STOCK', { stock: r.stock }, { delta });
      });
      return { item: await itemFor(id) };
    }
    case 'unlimited': {
      if (pool.enabled) throw new ApiError('CONFLICT', 'Kod havuzu açıkken stok sınırsız yapılamaz.');
      const next = input.unlimited ? -1 : 0;
      if ((r.stock < 0) === input.unlimited) return { item: await itemFor(id) };
      await prisma.$transaction(async (tx) => {
        await tx.reward.update({ where: { id }, data: { stock: next } });
        await audit(tx, 'ADJUST_REWARD_STOCK', { stock: r.stock }, { stock: next });
      });
      return { item: await itemFor(id) };
    }
  }
}

/** Kod havuzu: ekle (doğrula + tekilleştir), çıkar, kapat. Stok havuza eşitlenir. */
export async function poolAction(id: string, input: PoolActionInput, actor: AuditActor, request: ReqLike): Promise<PoolResult> {
  return prisma.$transaction(async (tx) => {
    // Satırı kilitle (eşzamanlı talep havuzdan kod alırken çakışmasın).
    const locked = await tx.reward.updateMany({ where: { id }, data: { updatedAt: new Date() } });
    if (locked.count === 0) throw new ApiError('NOT_FOUND', 'Ödül bulunamadı.');
    const r = await tx.reward.findUniqueOrThrow({ where: { id }, select: { metadata: true, stock: true, archivedAt: true, type: true } });
    if (r.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki ödülün havuzu değiştirilemez.');
    const pool = readPool(r.metadata);
    const skipped: PoolResult['skipped'] = [];
    let codes = pool.codes;
    let added = 0;

    if (input.action === 'add') {
      const seen = new Set(codes);
      const candidates: string[] = [];
      for (const raw of input.codes) {
        const c = raw.trim();
        if (!POOL_CODE_RE.test(c)) {
          skipped.push({ code: c.slice(0, 64), reason: 'invalid' });
          continue;
        }
        if (seen.has(c)) {
          skipped.push({ code: c, reason: 'duplicate' });
          continue;
        }
        seen.add(c);
        candidates.push(c);
      }
      const issued = candidates.length
        ? await tx.userReward.findMany({ where: { code: { in: candidates } }, select: { code: true } })
        : [];
      const issuedSet = new Set(issued.map((x) => x.code));
      const fresh = candidates.filter((c) => {
        if (issuedSet.has(c)) {
          skipped.push({ code: c, reason: 'issued' });
          return false;
        }
        return true;
      });
      if (codes.length + fresh.length > POOL_MAX) throw new ApiError('VALIDATION', `Havuzda en fazla ${POOL_MAX} kod tutulabilir.`);
      codes = [...codes, ...fresh];
      added = fresh.length;
    } else if (input.action === 'remove') {
      if (!codes.includes(input.code)) throw new ApiError('NOT_FOUND', 'Bu kod havuzda değil (dağıtılmış olabilir).');
      codes = codes.filter((c) => c !== input.code);
    } else {
      if (!pool.enabled) return { added: 0, skipped: [], remaining: 0 };
      // Kapatınca dağıtılmamış kodlar silinir; stok 0 (elle stok ya da sınırsız seçilebilir).
      await tx.reward.update({ where: { id }, data: { stock: 0, metadata: writePool(r.metadata, { enabled: false, codes: [] }) as Prisma.InputJsonValue } });
      await tx.auditLog.create({
        data: auditEntry(actor, { action: 'REWARD_CODE_POOL', entity: 'Reward', entityId: id, oldData: { remaining: pool.codes.length }, newData: { disabled: true } }, request),
      });
      return { added: 0, skipped: [], remaining: 0 };
    }

    await tx.reward.update({
      where: { id },
      data: { stock: codes.length, metadata: writePool(r.metadata, { enabled: true, codes }) as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: auditEntry(
        actor,
        {
          action: 'REWARD_CODE_POOL',
          entity: 'Reward',
          entityId: id,
          oldData: { remaining: pool.codes.length, stock: r.stock },
          newData: { op: input.action, added, removed: input.action === 'remove' ? 1 : 0, remaining: codes.length, skipped: skipped.length },
        },
        request
      ),
    });
    return { added, skipped: skipped.slice(0, 50), remaining: codes.length };
  });
}
