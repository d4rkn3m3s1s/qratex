/**
 * Mağaza ve Ödüller — KOZMETİK kataloğu sunucu mantığı (rapor admin_shop).
 *
 *  - Görünüm sözleşmesi türe göre doğrulanır (`cosmeticAssetError`): müşteride bozuk görünen
 *    URL'li çerçeve / URL ya da sınıf karışık arka plan artık kaydedilemez (Bulgu 3).
 *  - Nadirlik enum (Bulgu 6), slug çakışması alan hatalı 409 (Bulgu 7), tam alan farkı denetimi
 *    güncellemeyle aynı tx'te (Bulgu 8), sahibi olan ürünün türü kilitli (Bulgu 9).
 *  - Silme yok → arşiv; sahiplikler korunur. Demo seti YALNIZ EKSİKLERİ ekler, düzenlemeleri ezmez (Bulgu 4).
 *  - Satış/yakım sayıları gerçek defterden (PointsLedger `shop` + `gift`).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { DEMO_COSMETICS } from '@/lib/cosmetic-demos';
import {
  COSMETIC_RARITIES,
  COSMETIC_RARITY_RANK,
  COSMETIC_TYPES,
  cosmeticAssetError,
  cosmeticUpsertSchema,
  type CosmeticActionInput,
  type CosmeticDetail,
  type CosmeticListItem,
  type CosmeticListQuery,
  type CosmeticPatchInput,
  type CosmeticRarity,
  type CosmeticStats,
  type CosmeticType,
  type CosmeticUpsertInput,
  type Paged,
  type SeedResult,
} from './contract';
import { DAY_MS, daySeries, diffFields, paginate, toAuditRow, trIncludes } from './shared.server';

type ReqLike = { headers: { get(name: string): string | null } } | null;

export const COSMETIC_AUDIT_LABEL: Record<string, string> = {
  create_cosmetic_item: 'Oluşturuldu',
  update_cosmetic_item: 'Düzenlendi',
  ARCHIVE_COSMETIC: 'Arşivlendi',
  RESTORE_COSMETIC: 'Arşivden geri alındı',
  ACTIVATE_COSMETIC: 'Satışa açıldı',
  DEACTIVATE_COSMETIC: 'Satıştan kaldırıldı',
  DUPLICATE_COSMETIC: 'Çoğaltıldı',
  seed_demo_cosmetics: 'Demo seti eklendi',
};

const FIELDS = ['name', 'slug', 'description', 'type', 'price', 'asset', 'rarity', 'isActive'] as const;

type Row = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  type: string;
  price: number;
  imageUrl: string | null;
  rarity: string;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
};

const SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  type: true,
  price: true,
  imageUrl: true,
  rarity: true,
  isActive: true,
  archivedAt: true,
  createdAt: true,
} as const;

const normType = (t: string): CosmeticType | 'other' => ((COSMETIC_TYPES as readonly string[]).includes(t) ? (t as CosmeticType) : 'other');
export function normRarity(v: string): CosmeticRarity {
  const s = v.trim().toLowerCase();
  return (COSMETIC_RARITIES as readonly string[]).includes(s) ? (s as CosmeticRarity) : 'common';
}

function toItem(r: Row, c: { owners: number; equipped: number; sales30d: number; gifts30d: number }): CosmeticListItem {
  const type = normType(r.type);
  const rarity = normRarity(r.rarity);
  let assetWarning: string | null = null;
  if (type === 'other') assetWarning = 'Tanınmayan tür: müşteride gösterilmez.';
  else {
    const err = cosmeticAssetError(type, r.imageUrl);
    if (err) assetWarning = `Görünüm müşteride doğru çizilmeyebilir: ${err.toLocaleLowerCase('tr-TR')}.`;
  }
  if (!assetWarning && rarity !== r.rarity) assetWarning = `Nadirlik “${r.rarity}” standart değil; “${rarity}” olarak yorumlanıyor.`;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    type,
    price: r.price,
    asset: r.imageUrl,
    assetWarning,
    rarity,
    rarityRaw: r.rarity,
    status: r.archivedAt ? 'archived' : r.isActive ? 'active' : 'inactive',
    isActive: r.isActive,
    owners: c.owners,
    equipped: c.equipped,
    sales30d: c.sales30d,
    gifts30d: c.gifts30d,
    createdAt: r.createdAt.toISOString(),
  };
}

async function loadAll(now: Date): Promise<CosmeticListItem[]> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [rows, owners, equipped, sales, gifts] = await Promise.all([
    prisma.cosmeticItem.findMany({ select: SELECT, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.userCosmetic.groupBy({ by: ['cosmeticId'], _count: { _all: true } }),
    prisma.userCosmetic.groupBy({ by: ['cosmeticId'], where: { isEquipped: true }, _count: { _all: true } }),
    prisma.userCosmetic.groupBy({ by: ['cosmeticId'], where: { acquiredAt: { gte: since }, giftedByUserId: null }, _count: { _all: true } }),
    prisma.userCosmetic.groupBy({ by: ['cosmeticId'], where: { acquiredAt: { gte: since }, giftedByUserId: { not: null } }, _count: { _all: true } }),
  ]);
  const m = (g: Array<{ cosmeticId: string; _count: { _all: number } }>) => new Map(g.map((x) => [x.cosmeticId, x._count._all]));
  const [o, e, s, g] = [m(owners), m(equipped), m(sales), m(gifts)];
  return rows.map((r) => toItem(r, { owners: o.get(r.id) ?? 0, equipped: e.get(r.id) ?? 0, sales30d: s.get(r.id) ?? 0, gifts30d: g.get(r.id) ?? 0 }));
}

function sortItems(rows: CosmeticListItem[], sort: CosmeticListQuery['sort']): CosmeticListItem[] {
  const s = sort ?? '-created';
  const desc = s.startsWith('-');
  const key = desc ? s.slice(1) : s;
  const val = (r: CosmeticListItem): number | string => {
    switch (key) {
      case 'name':
        return r.name.toLocaleLowerCase('tr-TR');
      case 'price':
        return r.price;
      case 'owners':
        return r.owners;
      case 'sales30d':
        return r.sales30d + r.gifts30d;
      case 'rarity':
        return COSMETIC_RARITY_RANK[r.rarity];
      default:
        return r.createdAt;
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === 'string' ? x.localeCompare(String(y), 'tr-TR') : x - (y as number);
    return desc ? -c : c;
  });
}

export async function listCosmetics(q: CosmeticListQuery, now = new Date()): Promise<Paged<CosmeticListItem>> {
  const all = await loadAll(now);
  const needle = q.q?.trim();
  const rows = all.filter(
    (r) =>
      (q.status ? r.status === q.status : r.status !== 'archived') &&
      (!q.type || r.type === q.type) &&
      (!q.rarity || r.rarity === q.rarity) &&
      (!needle || trIncludes(r.name, needle) || trIncludes(r.slug, needle) || trIncludes(r.description, needle))
  );
  return paginate(sortItems(rows, q.sort), q.page, q.size);
}

export async function getCosmeticStats(now = new Date()): Promise<CosmeticStats> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [all, burned, slugs] = await Promise.all([
    loadAll(now),
    prisma.pointsLedger.aggregate({
      where: { source: { in: ['shop', 'gift'] }, status: 'posted', delta: { lt: 0 }, createdAt: { gte: since } },
      _sum: { delta: true },
    }),
    prisma.cosmeticItem.findMany({ where: { slug: { in: DEMO_COSMETICS.map((d) => d.slug) } }, select: { slug: true } }),
  ]);
  const top = [...all].sort((a, b) => b.sales30d + b.gifts30d - (a.sales30d + a.gifts30d))[0];
  return {
    active: all.filter((r) => r.status === 'active').length,
    inactive: all.filter((r) => r.status === 'inactive').length,
    archived: all.filter((r) => r.status === 'archived').length,
    sales30d: all.reduce((s, r) => s + r.sales30d + r.gifts30d, 0),
    burned30d: Math.abs(burned._sum.delta ?? 0),
    topSeller: top && top.sales30d + top.gifts30d > 0 ? { id: top.id, name: top.name, count: top.sales30d + top.gifts30d } : null,
    demoMissing: DEMO_COSMETICS.length - slugs.length,
    nonStandard: all.filter((r) => r.status !== 'archived' && r.assetWarning).length,
    asOf: now.toISOString(),
  };
}

async function loadRow(id: string): Promise<Row> {
  const r = await prisma.cosmeticItem.findUnique({ where: { id }, select: SELECT });
  if (!r) throw new ApiError('NOT_FOUND', 'Ürün bulunamadı.');
  return r;
}

async function itemFor(id: string, now = new Date()): Promise<CosmeticListItem> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [row, owners, equipped, sales30d, gifts30d] = await Promise.all([
    loadRow(id),
    prisma.userCosmetic.count({ where: { cosmeticId: id } }),
    prisma.userCosmetic.count({ where: { cosmeticId: id, isEquipped: true } }),
    prisma.userCosmetic.count({ where: { cosmeticId: id, acquiredAt: { gte: since }, giftedByUserId: null } }),
    prisma.userCosmetic.count({ where: { cosmeticId: id, acquiredAt: { gte: since }, giftedByUserId: { not: null } } }),
  ]);
  return toItem(row, { owners, equipped, sales30d, gifts30d });
}

export async function getCosmeticDetail(id: string, now = new Date()): Promise<CosmeticDetail> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [item, acquired, recent, audit] = await Promise.all([
    itemFor(id, now),
    prisma.userCosmetic.findMany({ where: { cosmeticId: id, acquiredAt: { gte: since } }, select: { acquiredAt: true }, take: 10_000 }),
    prisma.userCosmetic.findMany({
      where: { cosmeticId: id },
      orderBy: { acquiredAt: 'desc' },
      take: 10,
      select: { userId: true, acquiredAt: true, giftedByUserId: true, isEquipped: true, user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entity: 'CosmeticItem', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, createdAt: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  return {
    item,
    series: daySeries(acquired.map((a) => a.acquiredAt), now),
    recentOwners: recent.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      acquiredAt: r.acquiredAt.toISOString(),
      gifted: !!r.giftedByUserId,
      equipped: r.isEquipped,
    })),
    history: audit.map((a) => toAuditRow(a, COSMETIC_AUDIT_LABEL)),
  };
}

function snapshot(r: Row): Record<string, unknown> {
  return { name: r.name, slug: r.slug, description: r.description, type: r.type, price: r.price, asset: r.imageUrl, rarity: normRarity(r.rarity), isActive: r.isActive };
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2002';
}
const slugTaken = () =>
  new ApiError('CONFLICT', 'Bu kısa ad (slug) başka bir üründe kullanılıyor.', {
    details: [{ path: 'slug', message: 'Bu kısa ad başka bir üründe kullanılıyor', code: 'SLUG_TAKEN' }],
  });

export async function createCosmetic(input: CosmeticUpsertInput, actor: AuditActor, request: ReqLike): Promise<CosmeticListItem> {
  const v = cosmeticUpsertSchema.parse(input);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const r = await tx.cosmeticItem.create({
        data: {
          name: v.name,
          slug: v.slug || null,
          description: v.description || null,
          type: v.type,
          price: v.price,
          imageUrl: v.asset,
          rarity: v.rarity,
          isActive: v.isActive,
        },
        select: SELECT,
      });
      await tx.auditLog.create({
        data: auditEntry(actor, { action: 'create_cosmetic_item', entity: 'CosmeticItem', entityId: r.id, newData: snapshot(r) }, request),
      });
      return r;
    });
    return toItem(row, { owners: 0, equipped: 0, sales30d: 0, gifts30d: 0 });
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

export async function updateCosmetic(id: string, input: CosmeticPatchInput, actor: AuditActor, request: ReqLike): Promise<CosmeticListItem> {
  const current = await loadRow(id);
  if (current.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki ürün düzenlenemez. Önce arşivden geri alın.');
  const before = snapshot(current);
  const changes = Object.fromEntries(Object.entries(input.changes).filter(([k]) => (FIELDS as readonly string[]).includes(k)));
  // İyimser kilit: değiştirilen her alanın sunucudaki değeri, formun açıldığı andaki değerle aynı olmalı.
  const stale = Object.keys(changes).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(input.expected[k] ?? null));
  if (stale.length) {
    throw new ApiError('CONFLICT', 'Bu ürün siz düzenlerken değişti. Güncel hâlini yükleyip tekrar deneyin.', { details: { code: 'STALE', fields: stale } });
  }
  const merged = cosmeticUpsertSchema.parse({ ...before, ...changes });
  const after = { ...merged } as Record<string, unknown>;
  const diff = diffFields(before, after, FIELDS);
  if (diff.length === 0) return itemFor(id);

  if (diff.some((d) => d.field === 'type')) {
    const owners = await prisma.userCosmetic.count({ where: { cosmeticId: id } });
    if (owners > 0) {
      throw new ApiError('CONFLICT', `Bu ürünün ${owners.toLocaleString('tr-TR')} sahibi var; türü değiştirilemez. Farklı türde yeni ürün için çoğaltın.`, {
        details: [{ path: 'type', message: 'Sahibi olan ürünün türü kilitli', code: 'TYPE_LOCKED' }],
      });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cosmeticItem.update({
        where: { id },
        data: {
          name: merged.name,
          slug: merged.slug || null,
          description: merged.description || null,
          type: merged.type,
          price: merged.price,
          imageUrl: merged.asset,
          rarity: merged.rarity,
          isActive: merged.isActive,
        },
      });
      await tx.auditLog.create({
        data: auditEntry(actor, { action: 'update_cosmetic_item', entity: 'CosmeticItem', entityId: id, oldData: before, newData: { ...after, changes: diff } }, request),
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
  return itemFor(id);
}

export async function cosmeticAction(id: string, input: CosmeticActionInput, actor: AuditActor, request: ReqLike): Promise<{ item: CosmeticListItem; createdId?: string }> {
  const r = await loadRow(id);
  const audit = (tx: Prisma.TransactionClient, action: string, oldData: unknown, newData: unknown, entityId = id) =>
    tx.auditLog.create({ data: auditEntry(actor, { action, entity: 'CosmeticItem', entityId, oldData, newData }, request) });

  switch (input.action) {
    case 'activate':
    case 'deactivate': {
      if (r.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki ürün satışa açılamaz. Önce arşivden geri alın.');
      const next = input.action === 'activate';
      if (next) {
        const t = normType(r.type);
        const err = t === 'other' ? 'Tanınmayan tür' : cosmeticAssetError(t, r.imageUrl);
        if (err) throw new ApiError('CONFLICT', `Satışa açılmadan önce görünümü düzeltin: ${err}.`);
      }
      if (r.isActive !== next) {
        await prisma.$transaction(async (tx) => {
          await tx.cosmeticItem.update({ where: { id }, data: { isActive: next } });
          await audit(tx, next ? 'ACTIVATE_COSMETIC' : 'DEACTIVATE_COSMETIC', { isActive: r.isActive }, { isActive: next });
        });
      }
      return { item: await itemFor(id) };
    }
    case 'archive': {
      if (!r.archivedAt) {
        const owners = await prisma.userCosmetic.count({ where: { cosmeticId: id } });
        await prisma.$transaction(async (tx) => {
          await tx.cosmeticItem.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
          await audit(tx, 'ARCHIVE_COSMETIC', { isActive: r.isActive }, { archived: true, ownersPreserved: owners });
        });
      }
      return { item: await itemFor(id) };
    }
    case 'restore': {
      if (r.archivedAt) {
        await prisma.$transaction(async (tx) => {
          await tx.cosmeticItem.update({ where: { id }, data: { archivedAt: null, isActive: false } });
          await audit(tx, 'RESTORE_COSMETIC', { archived: true }, { archived: false, isActive: false });
        });
      }
      return { item: await itemFor(id) };
    }
    case 'duplicate': {
      const name = `${r.name} (kopya)`.slice(0, 200);
      const created = await prisma.$transaction(async (tx) => {
        const c = await tx.cosmeticItem.create({
          data: { name, slug: null, description: r.description, type: r.type, price: r.price, imageUrl: r.imageUrl, rarity: normRarity(r.rarity), isActive: false },
          select: { id: true },
        });
        await audit(tx, 'DUPLICATE_COSMETIC', null, { sourceId: id, name }, c.id);
        return c;
      });
      return { item: await itemFor(created.id), createdId: created.id };
    }
  }
}

/** Demo seti: YALNIZ eksik slug'ları ekler (satışta değil); mevcut ürünlere dokunmaz. */
export async function seedMissingDemos(actor: AuditActor, request: ReqLike): Promise<SeedResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cosmeticItem.findMany({ where: { slug: { in: DEMO_COSMETICS.map((d) => d.slug) } }, select: { slug: true } });
    const have = new Set(existing.map((e) => e.slug));
    const missing = DEMO_COSMETICS.filter((d) => !have.has(d.slug) && !cosmeticAssetError(d.type, d.imageUrl));
    if (missing.length) {
      await tx.cosmeticItem.createMany({
        data: missing.map((d) => ({
          slug: d.slug,
          name: d.name,
          description: d.description ?? null,
          type: d.type,
          price: d.price,
          imageUrl: d.imageUrl,
          rarity: d.rarity,
          isActive: false,
        })),
        skipDuplicates: true,
      });
    }
    await tx.auditLog.create({
      data: auditEntry(actor, { action: 'seed_demo_cosmetics', entity: 'CosmeticItem', entityId: 'batch', newData: { mode: 'insert_missing', added: missing.map((m) => m.slug) } }, request),
    });
    return { added: missing.map((m) => m.slug) };
  });
}
