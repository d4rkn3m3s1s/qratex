/**
 * Platform geneli gamification çarpanları (GamificationSettings tek satır).
 * Admin xpMultiplier/pointMultiplier ayarlıyordu ama hiçbir puan/XP yoluna
 * uygulanmıyordu (write-only). Bu helper döngüyü kapatır.
 *
 * unstable_cache ile 60sn cache (her feedback'te DB sorgusu olmasın); ayar
 * değişince admin route revalidateTag ile bayatlatabilir.
 */
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';

export const GAMIFICATION_SETTINGS_TAG = 'gamification-settings';

export interface GamificationMultipliers {
  xpMultiplier: number;
  pointMultiplier: number;
}

/**
 * `GamificationSettings.dailyXpCap` bilerek OKUNMAZ: hiçbir yolda uygulanmıyordu (write-only
 * ayar) ve Ekonomi Stüdyosu'ndan da kaldırıldı. XP üst sınırı puan tavanlarından gelir —
 * tekrarlanabilir kaynaklarda (geri bildirim, oyun, bayi pasif, telafi) XP puanla AYNI oranda
 * kısılır (lib/economy/mint.ts adım 3); tavansız kaynaklar tek seferliktir (rozet, görev, davet).
 */
const DEFAULTS: GamificationMultipliers = { xpMultiplier: 1, pointMultiplier: 1 };

export const getGamificationMultipliers = unstable_cache(
  async (): Promise<GamificationMultipliers> => {
    try {
      const row = await prisma.gamificationSettings.findFirst({
        select: { xpMultiplier: true, pointMultiplier: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (!row) return DEFAULTS;
      return {
        xpMultiplier: row.xpMultiplier > 0 ? row.xpMultiplier : 1,
        pointMultiplier: row.pointMultiplier > 0 ? row.pointMultiplier : 1,
      };
    } catch {
      return DEFAULTS;
    }
  },
  ['gamification-settings'],
  { revalidate: 60, tags: [GAMIFICATION_SETTINGS_TAG] }
);
