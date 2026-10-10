/**
 * Ekran bağlantıları: listele (GET) / oluştur (POST). Bağlantı oturumsuz, salt-okunur ve
 * iptal edilebilir; şubedeki TV'de bayi oturumunu açık bırakma zorunluluğunu kaldırır.
 * Ham token yalnız oluşturma yanıtında döner. Yalnız bayi sahibi.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { createDisplay, listDisplays } from '@/lib/dealer/voc-wall/server';
import { rethrowWallError } from '@/lib/dealer/voc-wall/http';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.voc-wall.displays.list', roles: ['DEALER'], tenant: 'dealer', module: 'voc_wall', rateLimit: 'read' },
  async ({ tenant }) => ok({ displays: await listDisplays(tenant.dealerId) })
);

export const POST = defineRoute(
  {
    name: 'dealer.voc-wall.displays.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'voc_wall',
    rateLimit: 'sensitive',
    schema: z.object({
      label: z.string().trim().min(1, 'Ekran adı gerekli').max(60),
      qrCodeId: z.string().min(1).max(64).nullable().default(null),
    }),
  },
  async ({ tenant, body }) => {
    try {
      return ok(await createDisplay(tenant.dealerId, body), { status: 201 });
    } catch (err) {
      rethrowWallError(err);
    }
  }
);
