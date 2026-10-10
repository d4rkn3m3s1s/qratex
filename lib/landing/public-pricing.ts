/**
 * Herkese açık fiyatlandırma — sunucu katmanı. Build-time fail-safe: DB erişilemezse `null`
 * (sayfa "fiyat için bize yazın" dürüst durumuna düşer; uydurma fiyat basılmaz).
 * Admin plan değişikliği en geç `revalidate` süresinde vitrine yansır.
 */
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { loadPublicPlans, type PublicPlan } from './public-pricing-core';

export const PUBLIC_PRICING_CACHE_TAG = 'public-pricing';

const loadCached = unstable_cache(() => loadPublicPlans(prisma), ['public-pricing-v1'], {
  revalidate: 300,
  tags: [PUBLIC_PRICING_CACHE_TAG],
});

async function getPublicPricingPlansImpl(): Promise<PublicPlan[] | null> {
  try {
    return await loadCached();
  } catch (error) {
    console.error('[public-pricing]', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Satıştaki planlar; hata → null (boş liste "plan tanımlı değil" anlamına gelir). */
export const getPublicPricingPlans = cache(getPublicPricingPlansImpl);
