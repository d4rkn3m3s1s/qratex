/**
 * Dönemsel konsept çekirdeği. Bir tarih penceresinde aktif olan konsepti çözer ve
 * Settings['activeSeasonalConcept'] anahtarına yazar (saatlik cron + admin kaydında).
 * İstemci bu anahtarı okuyup arka plan efekti + palet + banner uygular.
 *
 * Çakışan konseptlerde: priority (büyük öncelikli) → daha geç başlayan kazanır.
 */
import { prisma } from '@/lib/prisma';

export const ACTIVE_SEASONAL_CONCEPT_KEY = 'activeSeasonalConcept';

export interface ActiveSeasonalConcept {
  id: string;
  name: string;
  backgroundEffect: string | null;
  themePresetId: string | null;
  bannerText: string | null;
  bannerEmoji: string | null;
  bonusMultiplier: number | null;
  endDate: string; // ISO
}

/** Verilen anda aktif (penceresi açık, isActive) en öncelikli konsepti döndürür. */
export async function getActiveSeasonalConcept(
  now: Date = new Date()
): Promise<ActiveSeasonalConcept | null> {
  try {
    const c = await prisma.seasonalConcept.findFirst({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: [{ priority: 'desc' }, { startDate: 'desc' }],
      select: {
        id: true,
        name: true,
        backgroundEffect: true,
        themePresetId: true,
        bannerText: true,
        bannerEmoji: true,
        bonusMultiplier: true,
        endDate: true,
      },
    });
    if (!c) return null;
    return {
      id: c.id,
      name: c.name,
      backgroundEffect: c.backgroundEffect,
      themePresetId: c.themePresetId,
      bannerText: c.bannerText,
      bannerEmoji: c.bannerEmoji,
      bonusMultiplier: c.bonusMultiplier,
      endDate: c.endDate.toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Aktif konsepti hesaplar ve Settings'e yazar (cache kaynağı). Cron + admin
 * kaydı sonrası çağrılır. Aktif konsept yoksa anahtarı null'a çeker.
 */
export async function syncActiveSeasonalConcept(
  now: Date = new Date()
): Promise<ActiveSeasonalConcept | null> {
  const active = await getActiveSeasonalConcept(now);
  await prisma.settings.upsert({
    where: { key: ACTIVE_SEASONAL_CONCEPT_KEY },
    create: {
      key: ACTIVE_SEASONAL_CONCEPT_KEY,
      category: 'seasonal',
      value: (active ?? null) as object,
    },
    update: { value: (active ?? null) as object },
  });
  return active;
}

/** Settings'ten okunmuş ham değeri tip-güvenli ActiveSeasonalConcept'e çevirir. */
export function parseActiveSeasonalConcept(raw: unknown): ActiveSeasonalConcept | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
  return {
    id: o.id,
    name: o.name,
    backgroundEffect: typeof o.backgroundEffect === 'string' ? o.backgroundEffect : null,
    themePresetId: typeof o.themePresetId === 'string' ? o.themePresetId : null,
    bannerText: typeof o.bannerText === 'string' ? o.bannerText : null,
    bannerEmoji: typeof o.bannerEmoji === 'string' ? o.bannerEmoji : null,
    bonusMultiplier: typeof o.bonusMultiplier === 'number' ? o.bonusMultiplier : null,
    endDate: typeof o.endDate === 'string' ? o.endDate : '',
  };
}
