/**
 * Moderasyon (PATCH): yorumu ekranda sabitle / gizle / otomatiğe döndür. Şubedeki personel de
 * uygunsuz yorumu anında gizleyebilsin diye STAFF dahil; ADMIN salt-okunur. Güvenlik süzgecini
 * aşmaz (sabitlenen toksik yorum yine yayınlanmaz).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { setWallStatus } from '@/lib/dealer/voc-wall/server';
import { rethrowWallError } from '@/lib/dealer/voc-wall/http';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    name: 'dealer.voc-wall.items.status',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    module: 'voc_wall',
    rateLimit: 'mutation',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: z.object({ status: z.enum(['auto', 'pinned', 'hidden']) }),
  },
  async ({ tenant, params, body }) => {
    try {
      return ok(await setWallStatus(tenant.dealerId, params.id, body.status));
    } catch (err) {
      rethrowWallError(err);
    }
  }
);
