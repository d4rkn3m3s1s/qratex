import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getInstallToValue, getInstallToValueStats } from '@/lib/install-to-value';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  // REDIS CACHE: kurulum→değer süresi tüm bayiler için ilk-AI-analizi taraması yapar
  // (canlı logda ~11sn). Tarihsel metrik — 5 dk tazelik yeterli. Redis yoksa DB'ye düşer.
  const { redisGetJson, redisSetJson } = await import('@/lib/redis');
  const cacheKey = 'admin:install-to-value';
  const cached = await redisGetJson<object>(cacheKey);
  if (cached) return NextResponse.json(cached, { headers: PRIVATE_NO_STORE_HEADERS });

  const results = await getInstallToValue();
  const stats = await getInstallToValueStats(results); // çift hesaplamayı önle

  const payload = {
    installToValue: results,
    averageMinutes: stats.averageMinutes,
    medianMinutes: stats.medianMinutes,
    p95Minutes: stats.p95Minutes,
    sampleSize: stats.sampleSize,
    cappedOutliers: stats.cappedOutliers,
  };
  await redisSetJson(cacheKey, payload, 300);
  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE_HEADERS });
}
