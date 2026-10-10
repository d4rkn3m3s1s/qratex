/**
 * Müşteri sesi duvarı — yönetim özeti (GET). Mini KPI (dönem + önceki dönem), temalar,
 * yayın kuralları, QR listesi. Kiracı kapsamı defineRoute ile (DEALER kendi, STAFF aktif bağı,
 * ADMIN ?dealerId= salt-okunur); modül kapısı voc_wall. Yayın güvenliği: ./wall-policy.ts
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadWallOverview } from '@/lib/dealer/voc-wall/server';

export const dynamic = 'force-dynamic';

const Query = z.object({
  range: z
    .enum(['7', '30', '90'])
    .default('30')
    .transform((v) => Number(v) as 7 | 30 | 90),
  qrCodeId: z.string().min(1).max(64).optional(),
  dealerId: z.string().optional(),
});

export const GET = defineRoute(
  {
    name: 'dealer.voc-wall.overview',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    module: 'voc_wall',
    rateLimit: 'read',
    query: Query,
  },
  async ({ tenant, query }) =>
    ok(await loadWallOverview(tenant.dealerId, { range: query.range, qrCodeId: query.qrCodeId ?? null }))
);
