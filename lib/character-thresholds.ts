/**
 * Karakter kategori eşiği/uzunluk override'ları — admin panelinden ayarlanabilir.
 * getPointsMatrix desenini birebir izler: Settings tablosunda tek JSON kaydı + 60sn cache.
 *
 * Override YOKSA kod-içi CHARACTER_CATEGORIES default'ları geçerli (gizemli=20, diğer=6).
 * Admin bir kategoriye override girerse (ör. gizemli eşik 30) o değer kullanılır.
 * character-categories.ts saf sabit modül kalır (prisma bağımlılığı yok) — override yalnız
 * argüman olarak geçer; DB okuma bu dosyada (prisma'ya bağlı).
 */
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { CATEGORY_BY_KEY } from '@/lib/character-categories';

export const CATEGORY_THRESHOLDS_SETTING_KEY = 'character_category_thresholds';
export const CATEGORY_THRESHOLDS_SETTING_CATEGORY = 'gamification';

/** key → { threshold?, minReviewLength? } (yalnız override edilen alanlar). */
export type CategoryThresholdOverrides = Record<string, { threshold?: number; minReviewLength?: number }>;

type SettingsReader = { settings: { findUnique: (args: unknown) => Promise<{ value: Prisma.JsonValue } | null> } };

function toPositiveInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function toNonNegativeInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * DB'den gelen ham JSON'ı güvenli override tablosuna çevirir. Yalnız BİLİNEN kategori
 * key'leri kabul edilir (whitelist); geçersiz değerler atılır → bozuk config kod-default'a düşer.
 */
export function normalizeCategoryThresholds(value: unknown): CategoryThresholdOverrides {
  const out: CategoryThresholdOverrides = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!CATEGORY_BY_KEY[key]) continue; // bilinmeyen kategori → at
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry: { threshold?: number; minReviewLength?: number } = {};
    const t = toPositiveInt((raw as Record<string, unknown>).threshold);
    const m = toNonNegativeInt((raw as Record<string, unknown>).minReviewLength);
    if (t !== undefined) entry.threshold = t;
    if (m !== undefined) entry.minReviewLength = m;
    if (Object.keys(entry).length > 0) out[key] = entry;
  }
  return out;
}

const CACHE_TTL_MS = 60_000; // 60s (getPointsMatrix ile aynı)
let cache: { value: CategoryThresholdOverrides; expiresAt: number } | null = null;

/** Admin PUT sonrası cache'i temizle (anında yansısın). */
export function clearCategoryThresholdsCache(): void {
  cache = null;
}

/** Override tablosunu döndürür (60sn cache). Yoksa boş {} (kod-default geçerli). */
export async function getCategoryThresholdOverrides(
  db: SettingsReader = prisma as unknown as SettingsReader
): Promise<CategoryThresholdOverrides> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  const setting = await db.settings
    .findUnique({ where: { key: CATEGORY_THRESHOLDS_SETTING_KEY }, select: { value: true } })
    .catch(() => null);
  const value = normalizeCategoryThresholds(setting?.value);
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
