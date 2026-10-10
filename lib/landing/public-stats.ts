/**
 * Vitrin istatistikleri — sunucu katmanı (Redis sıcak katman + Next veri önbelleği).
 *
 * Tek kaynak: ana sayfa, /neden-qratex ve `/api/public/stats` aynı fonksiyonu kullanır.
 * Build-time fail-safe: DB/Redis erişilemezse `null` döner (sayfa istatistik bandını
 * gizler, deploy patlamaz). Hata sonucu önbelleğe GİRMEZ (unstable_cache içinde fırlatılır).
 */
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { computePublicStats, isPublicStats, type PublicStats } from './public-stats-core';

/** Sürümlü anahtar: eski (tüm rolleri sayan) `stats:public` değeri sızmasın. */
export const PUBLIC_STATS_REDIS_KEY = 'stats:public:v2';
export const PUBLIC_STATS_TTL_SECONDS = 600;
export const PUBLIC_STATS_CACHE_TAG = 'public-stats';

async function loadFresh(): Promise<PublicStats> {
  const cached = await redisGetJson<unknown>(PUBLIC_STATS_REDIS_KEY);
  if (isPublicStats(cached)) return cached;
  const fresh = await computePublicStats(prisma);
  await redisSetJson(PUBLIC_STATS_REDIS_KEY, fresh, PUBLIC_STATS_TTL_SECONDS);
  return fresh;
}

const loadCached = unstable_cache(loadFresh, ['public-stats-v2'], {
  revalidate: PUBLIC_STATS_TTL_SECONDS,
  tags: [PUBLIC_STATS_CACHE_TAG],
});

async function getPublicStatsImpl(): Promise<PublicStats | null> {
  try {
    return await loadCached();
  } catch (error) {
    console.error('[public-stats]', error instanceof Error ? error.message : error);
    return null;
  }
}

/** İstek başına tek hesap; hata → null. */
export const getPublicStats = cache(getPublicStatsImpl);
