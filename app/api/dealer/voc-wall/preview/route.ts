/** Ekran önizlemesi (GET): oturumsuz ekranın göreceği akışın AYNISI (aynı yükleyici). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getWallConfig, loadWallFeed } from '@/lib/dealer/voc-wall/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.voc-wall.preview',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    module: 'voc_wall',
    rateLimit: 'read',
    query: z.object({ qrCodeId: z.string().min(1).max(64).optional(), dealerId: z.string().optional() }),
  },
  async ({ tenant, query }) => {
    const config = await getWallConfig(tenant.dealerId);
    return ok(await loadWallFeed(tenant.dealerId, config, query.qrCodeId ?? null));
  }
);
