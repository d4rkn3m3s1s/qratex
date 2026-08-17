import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getTenantHealth } from '@/lib/tenant-health';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  // REDIS CACHE: bayi sağlık agregasyonu ağır (tüm bayiler × 7g/14g feedback+action taraması,
  // canlı logda ~15sn). Admin verisi — 60s tazelik fazlasıyla yeterli. Redis yoksa DB'ye düşer.
  const { redisGetJson, redisSetJson } = await import('@/lib/redis');
  const cacheKey = 'admin:tenant-health';
  const cached = await redisGetJson<object>(cacheKey);
  if (cached) return NextResponse.json(cached, { headers: PRIVATE_NO_STORE_HEADERS });

  const results = await getTenantHealth();
  const payload = { tenantHealth: results };
  await redisSetJson(cacheKey, payload, 60);
  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE_HEADERS });
}
