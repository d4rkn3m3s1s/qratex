/**
 * Personel işlem defteri kapsamı — sunucu tarafı (bayi ayarı + Prisma filtresi).
 *
 * Ayar `Settings` anahtar/değer tablosunda tutulur (yeni migration yok):
 *   key = `dealer:<dealerId>:staffLedgerScope`, value = { scope }, category = 'dealer-staff'.
 * Okuma hatasında VARSAYILAN (`today_own`) döner; personel kapsamı hiçbir durumda "tümü"ne
 * kendiliğinden genişlemez.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_STAFF_LEDGER_SCOPE,
  istanbulDayKey,
  istanbulDayStart,
  parseStaffLedgerScope,
  type StaffLedgerScope,
} from './core';

/** "Kendi geçmişi" için taranan en fazla kendi kaydı (en yeniden). */
export const OWN_HISTORY_MAX = 2000;

export function staffLedgerScopeKey(dealerId: string): string {
  return `dealer:${dealerId}:staffLedgerScope`;
}

export async function getStaffLedgerScope(dealerId: string): Promise<StaffLedgerScope> {
  try {
    const row = await prisma.settings.findUnique({ where: { key: staffLedgerScopeKey(dealerId) }, select: { value: true } });
    const v = row?.value as { scope?: unknown } | null | undefined;
    return parseStaffLedgerScope(v?.scope) ?? DEFAULT_STAFF_LEDGER_SCOPE;
  } catch {
    return DEFAULT_STAFF_LEDGER_SCOPE;
  }
}

export async function setStaffLedgerScope(dealerId: string, scope: StaffLedgerScope): Promise<void> {
  const key = staffLedgerScopeKey(dealerId);
  await prisma.settings.upsert({
    where: { key },
    create: { key, value: { scope }, category: 'dealer-staff' },
    update: { value: { scope } },
  });
}

/** Personelin kendi girdiği tüketim kimlikleri (kart denetimi `CONSUMPTION_ADDED`, aktör = personel). */
async function ownConsumptionIds(actorId: string): Promise<string[]> {
  const rows = await prisma.cardAuditLog.findMany({
    where: { userId: actorId, action: 'CONSUMPTION_ADDED' },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
    take: OWN_HISTORY_MAX,
  });
  const ids: string[] = [];
  for (const r of rows) {
    const id = (r.metadata as { consumptionId?: unknown } | null)?.consumptionId;
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

/**
 * Politika → ek Prisma filtresi. `null` = ek kısıt yok (`all`, ya da `today` — o durumda aralık
 * zaten `scopeLedgerFilters` ile bugüne kilitlidir; yine de savunma için bugün filtresi döner).
 */
export async function staffLedgerScopeWhere(
  scope: StaffLedgerScope,
  actorId: string,
  now: Date = new Date()
): Promise<Prisma.ConsumptionWhereInput | null> {
  const todayStart = istanbulDayStart(istanbulDayKey(now));
  if (scope === 'all') return null;
  if (scope === 'today') return { createdAt: { gte: todayStart } };
  const own = await ownConsumptionIds(actorId);
  return own.length > 0 ? { OR: [{ createdAt: { gte: todayStart } }, { id: { in: own } }] } : { createdAt: { gte: todayStart } };
}

/** Tek çağrı: istek bağlamından personel kapsamını çözer (personel değilse kısıt yok). */
export async function resolveStaffLedgerAccess(
  tenant: { dealerId: string; actorId: string; via: string },
  now: Date = new Date()
): Promise<{ policy: StaffLedgerScope | null; scopeWhere: Prisma.ConsumptionWhereInput | null }> {
  if (tenant.via !== 'staff') return { policy: null, scopeWhere: null };
  const policy = await getStaffLedgerScope(tenant.dealerId);
  return { policy, scopeWhere: await staffLedgerScopeWhere(policy, tenant.actorId, now) };
}
