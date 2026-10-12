/**
 * Bayi telafi GÜNLÜK PUAN BÜTÇESİ — ürün kararı (2026-10-12):
 *  - Varsayılan: `REMEDY_DEALER_DAILY_CAP` (5.000 puan / UTC gün, tüm müşteriler).
 *  - Admin bayi bazında override edebilir (yukarı ya da aşağı) → "tavan".
 *  - Bayi kendisi tavanın ALTINDA bir limit koyabilir (üstüne çıkamaz).
 *  - Etkin bütçe = min(admin tavanı ?? varsayılan, bayi limiti ?? ∞).
 *
 * Depolama: yeni migration yok — `Settings` (key/value Json) satırı, anahtar
 * `remedy_budget:<dealerId>`, değer `{ adminCap: number|null, dealerCap: number|null }`.
 * Okuma hatası (bozuk Json) varsayılana düşer; ama DB hatası YUTULMAZ (puan basan yol
 * fail-closed kalsın — çağıran tx geri alınır).
 */
import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';
import { REMEDY_DEALER_DAILY_CAP } from '@/lib/economy/caps';
import { startOfDayUTC } from '@/lib/timezone';

type Db = Prisma.TransactionClient | typeof prisma;

export const REMEDY_BUDGET_SETTINGS_CATEGORY = 'remedy_budget';
/** Admin tavanının üst sınırı (yanlış yazım koruması). */
export const REMEDY_BUDGET_ADMIN_MAX = 100_000;

export interface RemedyBudgetConfig {
  adminCap: number | null;
  dealerCap: number | null;
}

export interface RemedyBudgetView extends RemedyBudgetConfig {
  defaultCap: number;
  /** Bayinin çıkabileceği en yüksek değer (admin tavanı ya da varsayılan). */
  ceiling: number;
  /** Uygulanan günlük bütçe. */
  effective: number;
  usedToday: number;
  remainingToday: number;
}

export function remedyBudgetKey(dealerId: string): string {
  return `remedy_budget:${dealerId}`;
}

function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

export function parseRemedyBudgetConfig(raw: unknown): RemedyBudgetConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { adminCap: null, dealerCap: null };
  const o = raw as Record<string, unknown>;
  return { adminCap: intOrNull(o.adminCap), dealerCap: intOrNull(o.dealerCap) };
}

export function remedyBudgetCeiling(cfg: RemedyBudgetConfig): number {
  return cfg.adminCap ?? REMEDY_DEALER_DAILY_CAP;
}

export function effectiveRemedyBudget(cfg: RemedyBudgetConfig): number {
  const ceiling = remedyBudgetCeiling(cfg);
  return cfg.dealerCap == null ? ceiling : Math.min(ceiling, cfg.dealerCap);
}

export async function loadRemedyBudgetConfig(db: Db, dealerId: string): Promise<RemedyBudgetConfig> {
  const row = await db.settings.findUnique({ where: { key: remedyBudgetKey(dealerId) }, select: { value: true } });
  return parseRemedyBudgetConfig(row?.value);
}

export async function saveRemedyBudgetConfig(db: Db, dealerId: string, cfg: RemedyBudgetConfig): Promise<void> {
  const value = { adminCap: cfg.adminCap, dealerCap: cfg.dealerCap } as Prisma.InputJsonValue;
  await db.settings.upsert({
    where: { key: remedyBudgetKey(dealerId) },
    create: { key: remedyBudgetKey(dealerId), value, category: REMEDY_BUDGET_SETTINGS_CATEGORY },
    update: { value },
  });
}

/** Bugün (UTC) bu bayinin telafi kabulleriyle basılan toplam puan (defterden). */
export async function remedyPointsUsedToday(db: Db, dealerId: string, now: Date = new Date()): Promise<number> {
  const used = await db.pointsLedger.aggregate({
    where: { actorId: dealerId, source: 'remedy', status: 'posted', createdAt: { gte: startOfDayUTC(now) } },
    _sum: { delta: true },
  });
  return Math.max(0, used._sum.delta ?? 0);
}

export async function getRemedyBudgetView(db: Db, dealerId: string, now: Date = new Date()): Promise<RemedyBudgetView> {
  const [cfg, usedToday] = await Promise.all([loadRemedyBudgetConfig(db, dealerId), remedyPointsUsedToday(db, dealerId, now)]);
  const effective = effectiveRemedyBudget(cfg);
  return {
    ...cfg,
    defaultCap: REMEDY_DEALER_DAILY_CAP,
    ceiling: remedyBudgetCeiling(cfg),
    effective,
    usedToday,
    remainingToday: Math.max(0, effective - usedToday),
  };
}

/** Bayinin kendi limiti: null (kaldır) ya da 0..tavan. Tavan üstü → hata metni. */
export function validateDealerCap(cfg: RemedyBudgetConfig, dealerCap: number | null): string | null {
  if (dealerCap == null) return null;
  if (!Number.isInteger(dealerCap) || dealerCap < 0) return 'Limit 0 ya da pozitif bir tam sayı olmalı.';
  const ceiling = remedyBudgetCeiling(cfg);
  if (dealerCap > ceiling) return `Limitiniz en fazla ${ceiling.toLocaleString('tr-TR')} puan olabilir.`;
  return null;
}

export function remedyBudgetExhaustedMessage(remaining: number): string {
  return remaining > 0
    ? `İşletmenin bugünkü puan telafisi bütçesinde yalnız ${remaining.toLocaleString('tr-TR')} puan kaldı. Daha düşük bir miktar ya da başka bir telafi türü seçebilir, ya da yarın tekrar deneyebilirsiniz.`
    : 'İşletmenin bugünkü puan telafisi bütçesi doldu. Başka bir telafi türü seçebilir ya da yarın tekrar deneyebilirsiniz.';
}
