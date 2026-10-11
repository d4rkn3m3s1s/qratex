/**
 * POST /api/admin/discovery/preview — müşteri keşif hesabını (aynı fonksiyon) TASLAK ya da CANLI
 * ayarla çalıştırır. Müşteri menü/modül kapılarına takılmaz ve admin adına analitik olayı
 * yazmaz (rapor Bulgu 10). Ağır sinyal taraması 120 sn önbellekte.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getDiscoveryConfig } from '@/lib/discovery-config';
import { computeDiscovery } from '@/lib/discovery/compute.server';
import { previewSchema, type PreviewResult } from '@/lib/admin-discovery/contract';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.discovery.preview', roles: ['ADMIN'], schema: previewSchema, rateLimit: { max: 30, windowMs: 60_000, by: 'user' } },
  async ({ body }) => {
    const config = body.mode === 'draft' && body.config ? body.config : await getDiscoveryConfig();
    const data = await computeDiscovery(prisma, config, { lat: body.lat, lng: body.lng, radiusKm: body.radiusKm, category: body.category });
    const result: PreviewResult = { ...data, mode: body.mode === 'draft' && body.config ? 'draft' : 'live', computedAt: new Date().toISOString() };
    return ok(result);
  }
);
