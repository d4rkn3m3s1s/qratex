/**
 * Keşif ve sponsorlu yerleşimler — admin sunucu çekirdeği.
 *
 * Tek doğruluk kaynağı bayi profilidir (rapor Bulgu 3): konum, adres, çalışma saati ve tatil
 * modu `User` satırından okunur; keşif ayarındaki "yedek konum" satırları YALNIZ profili eksik
 * bayiler için kullanılır. Kapsama tablosu bu iki kaynağı yan yana gösterir.
 *
 * Yazma: C2 iyimser kilit (`writeVersionedSetting`, `baseVersion` zorunlu, uyuşmazlık 409) +
 * denetim kaydı AYNI transaction'da. İşletme kimlikleri gerçekten `DEALER` olmalı.
 */
import { Prisma } from '@prisma/client';
import type { prisma as prismaClient } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { DISCOVERY_CONFIG_CATEGORY, DISCOVERY_CONFIG_SETTING_KEY, normalizeDiscoveryConfig } from '@/lib/discovery-config';
import { getModuleControls } from '@/lib/module-gate';
import { parseBusinessHours } from '@/lib/places/business-hours';
import { isVersionConflictError, versionFromDate, writeVersionedSetting } from '@/lib/settings-version';
import { scheduleFromFallback } from '@/lib/discovery/compute.server';
import {
  discoveryConfigSchema,
  summarize,
  type CoveragePage,
  type CoverageQuery,
  type CoverageRow,
  type DealerRef,
  type DiscoveryConfigValue,
  type DiscoveryState,
  type HistoryEntry,
  type HistoryPage,
} from './contract';

type Db = typeof prismaClient;

export const DISCOVERY_AUDIT_ACTION = 'UPDATE_DISCOVERY_CONFIG';
const COVERAGE_DEALER_CAP = 5_000;

function dealerLabel(d: { businessName: string | null; name: string | null; email: string | null }): string {
  return d.businessName?.trim() || d.name?.trim() || d.email || 'Adsız işletme';
}

function rawLength(value: unknown, key: string): number {
  if (!value || typeof value !== 'object') return 0;
  const arr = (value as Record<string, unknown>)[key];
  return Array.isArray(arr) ? arr.length : 0;
}

/** Kayıttaki değeri düzenlemeye uygun biçime getirir (eksik kimlik/başlıklı satırlar düşer, sayılır). */
export function toEditable(raw: unknown): { config: DiscoveryConfigValue; droppedRows: number } {
  const n = normalizeDiscoveryConfig(raw);
  const droppedRows = rawLength(raw, 'locations') - n.locations.length + (rawLength(raw, 'sponsored') - n.sponsored.length);
  const config: DiscoveryConfigValue = {
    locations: n.locations.map((l) => ({
      dealerId: l.dealerId,
      latitude: l.latitude,
      longitude: l.longitude,
      address: l.address || undefined,
      categories: l.categories,
      opensAt: l.opensAt || undefined,
      closesAt: l.closesAt || undefined,
      daysOfWeek: l.daysOfWeek ?? [],
    })),
    sponsored: n.sponsored.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description || undefined,
      discountRate: s.discountRate ? s.discountRate : undefined,
      linkUrl: s.linkUrl || undefined,
      dealerId: s.dealerId || undefined,
      imageUrl: s.imageUrl || undefined,
      priority: s.priority,
      isActive: s.isActive,
      startsAt: s.startsAt || undefined,
      endsAt: s.endsAt || undefined,
    })),
    weeklyHighlights: n.weeklyHighlights,
  };
  return { config, droppedRows: Math.max(0, droppedRows) };
}

export async function resolveDealers(db: Db, ids: string[]): Promise<Record<string, DealerRef>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const rows = await db.user.findMany({
    where: { id: { in: unique }, role: 'DEALER' },
    select: { id: true, businessName: true, name: true, email: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, name: dealerLabel(r), email: r.email }]));
}

function configDealerIds(c: DiscoveryConfigValue): string[] {
  return [...c.locations.map((l) => l.dealerId), ...c.sponsored.map((s) => s.dealerId).filter((x): x is string => !!x)];
}

export async function isDiscoveryModuleEnabled(): Promise<boolean> {
  try {
    const controls = await getModuleControls();
    return (controls as Record<string, boolean | undefined>).discovery !== false;
  } catch {
    return true;
  }
}

export async function getDiscoveryState(db: Db): Promise<DiscoveryState> {
  const row = await db.settings.findUnique({ where: { key: DISCOVERY_CONFIG_SETTING_KEY }, select: { value: true, updatedAt: true } });
  const { config, droppedRows } = toEditable(row?.value);
  const [dealers, moduleEnabled] = await Promise.all([resolveDealers(db, configDealerIds(config)), isDiscoveryModuleEnabled()]);
  return { config, version: versionFromDate(row?.updatedAt), isDefault: !row, dealers, droppedRows, moduleEnabled };
}

/** Ayarda geçen işletme kimliklerinin gerçekten DEALER olduğunu doğrular; olmayanlar 400. */
export async function assertDealersExist(db: Db, config: DiscoveryConfigValue): Promise<void> {
  const ids = [...new Set(configDealerIds(config))];
  if (ids.length === 0) return;
  const found = await db.user.findMany({ where: { id: { in: ids }, role: 'DEALER' }, select: { id: true } });
  const ok = new Set(found.map((f) => f.id));
  const details: Array<{ path: string; message: string }> = [];
  config.locations.forEach((l, i) => {
    if (!ok.has(l.dealerId)) details.push({ path: `locations.${i}.dealerId`, message: `${i + 1}. yedek konumdaki işletme bulunamadı ya da bayi değil.` });
  });
  config.sponsored.forEach((s, i) => {
    if (s.dealerId && !ok.has(s.dealerId)) details.push({ path: `sponsored.${i}.dealerId`, message: `${i + 1}. sponsorlu duyurudaki işletme bulunamadı ya da bayi değil.` });
  });
  if (details.length > 0) throw new ApiError('VALIDATION', details[0].message, { details });
}

export async function saveDiscovery(
  db: Db,
  input: { config: DiscoveryConfigValue; baseVersion: string; restoredFrom?: string },
  actor: AuditActor,
  request?: { headers: { get(name: string): string | null } } | null
): Promise<{ config: DiscoveryConfigValue; version: string }> {
  const config = discoveryConfigSchema.parse(input.config);
  await assertDealersExist(db, config);
  try {
    const saved = await db.$transaction(async (tx) => {
      const written = await writeVersionedSetting(tx, {
        key: DISCOVERY_CONFIG_SETTING_KEY,
        value: config as unknown as Prisma.InputJsonValue,
        category: DISCOVERY_CONFIG_CATEGORY,
        baseVersion: input.baseVersion,
      });
      await tx.auditLog.create({
        data: auditEntry(
          actor,
          {
            action: DISCOVERY_AUDIT_ACTION,
            entity: 'Settings',
            entityId: written.id,
            oldData: written.previous ?? undefined,
            newData: input.restoredFrom ? { ...config, _restoredFrom: input.restoredFrom } : config,
          },
          request
        ),
      });
      return written;
    });
    return { config, version: saved.version };
  } catch (e) {
    if (isVersionConflictError(e)) {
      throw new ApiError('VERSION_CONFLICT', 'Keşif ayarları siz düzenlerken başka bir yönetici tarafından değiştirildi. Güncel hali yükleyip tekrar deneyin.', {
        status: 409,
        details: { currentVersion: e.currentVersion },
      });
    }
    throw e;
  }
}

// ───────────────────────────── Kapsama ─────────────────────────────

export async function getCoverage(db: Db, q: CoverageQuery): Promise<CoveragePage> {
  const [row, dealers] = await Promise.all([
    db.settings.findUnique({ where: { key: DISCOVERY_CONFIG_SETTING_KEY }, select: { value: true } }),
    db.user.findMany({
      where: { role: 'DEALER', anonymizedAt: null },
      select: { id: true, businessName: true, name: true, email: true, address: true, latitude: true, longitude: true, businessHours: true, holidayMode: true },
      orderBy: { createdAt: 'desc' },
      take: COVERAGE_DEALER_CAP,
    }),
  ]);
  const { config } = toEditable(row?.value);
  const fallback = new Map(config.locations.map((l) => [l.dealerId, l]));
  const ids = dealers.map((d) => d.id);
  const cats = ids.length
    ? await db.productCategory.groupBy({ by: ['dealerId'], where: { dealerId: { in: ids }, isActive: true }, _count: { _all: true } })
    : [];
  const catCount = new Map(cats.map((c) => [c.dealerId as string, c._count._all]));

  const rows: CoverageRow[] = dealers.map((d) => {
    const fb = fallback.get(d.id);
    const hasProfileLoc = d.latitude != null && d.longitude != null;
    const profileHours = parseBusinessHours(d.businessHours) != null;
    const fbHours = scheduleFromFallback(fb) != null;
    const categories = [...new Set([...(fb?.categories ?? []), ...(catCount.get(d.id) ? [`${catCount.get(d.id)} menü kategorisi`] : [])])];
    return {
      id: d.id,
      name: dealerLabel(d),
      email: d.email,
      address: d.address?.trim() || fb?.address || null,
      location: hasProfileLoc ? 'profile' : fb ? 'fallback' : 'none',
      hours: profileHours ? 'profile' : fbHours ? 'fallback' : 'none',
      holiday: d.holidayMode,
      categories,
      hasFallbackRow: !!fb,
    };
  });

  const summary = {
    dealers: rows.length,
    withProfileLocation: rows.filter((r) => r.location === 'profile').length,
    withFallbackOnly: rows.filter((r) => r.location === 'fallback').length,
    withoutLocation: rows.filter((r) => r.location === 'none').length,
    withHours: rows.filter((r) => r.hours !== 'none').length,
    withCategories: rows.filter((r) => r.categories.length > 0).length,
    complete: rows.filter((r) => r.location !== 'none' && r.hours !== 'none' && r.categories.length > 0).length,
    holiday: rows.filter((r) => r.holiday).length,
    shadowedFallbacks: rows.filter((r) => r.hasFallbackRow && r.location === 'profile').length,
    asOf: new Date().toISOString(),
  };

  const needle = q.q?.toLocaleLowerCase('tr-TR');
  const filtered = rows.filter((r) => {
    if (needle && !`${r.name} ${r.email ?? ''} ${r.address ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)) return false;
    switch (q.filter) {
      case 'missing-location':
        return r.location === 'none';
      case 'fallback':
        return r.location === 'fallback';
      case 'missing-hours':
        return r.hours === 'none';
      case 'missing-category':
        return r.categories.length === 0;
      case 'complete':
        return r.location !== 'none' && r.hours !== 'none' && r.categories.length > 0;
      default:
        return true;
    }
  });
  const start = (q.page - 1) * q.size;
  return { summary, items: filtered.slice(start, start + q.size), total: filtered.length, page: q.page, size: q.size };
}

export async function searchDealers(db: Db, q: string, ids: string[]): Promise<DealerRef[]> {
  if (ids.length > 0) return Object.values(await resolveDealers(db, ids));
  const term = q.trim();
  const rows = await db.user.findMany({
    where: {
      role: 'DEALER',
      anonymizedAt: null,
      ...(term.length >= 2
        ? {
            OR: [
              { businessName: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, businessName: true, name: true, email: true },
    orderBy: { businessName: 'asc' },
    take: 20,
  });
  return rows.map((r) => ({ id: r.id, name: dealerLabel(r), email: r.email }));
}

// ───────────────────────────── Geçmiş ─────────────────────────────

const HISTORY_SIZE = 15;

function readActor(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Record<string, unknown>;
  return (typeof s.name === 'string' && s.name) || (typeof s.email === 'string' && s.email) || null;
}

export async function getHistory(db: Db, page: number): Promise<HistoryPage> {
  const where = { action: DISCOVERY_AUDIT_ACTION };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * HISTORY_SIZE,
      take: HISTORY_SIZE,
      select: { id: true, createdAt: true, action: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const items: HistoryEntry[] = rows.map((r) => {
    const raw = r.newData as Record<string, unknown> | null;
    const parsed = raw ? discoveryConfigSchema.safeParse(toEditable(raw).config) : null;
    const config = parsed?.success ? parsed.data : raw ? toEditable(raw).config : null;
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      actor: readActor(r.actorSnapshot) ?? r.user?.name ?? r.user?.email ?? null,
      action: r.action,
      summary: summarize(config),
      config,
      restoredFrom: raw && typeof raw._restoredFrom === 'string' ? raw._restoredFrom : null,
    };
  });
  return { items, total, page, size: HISTORY_SIZE };
}
