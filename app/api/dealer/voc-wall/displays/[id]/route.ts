/** Ekran bağlantısını iptal et (DELETE = arşiv; kayıt silinmez, bağlantı anında çalışmaz olur). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { revokeDisplay } from '@/lib/dealer/voc-wall/server';
import { rethrowWallError } from '@/lib/dealer/voc-wall/http';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute(
  {
    name: 'dealer.voc-wall.displays.revoke',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'voc_wall',
    rateLimit: 'mutation',
    params: z.object({ id: z.string().uuid() }),
  },
  async ({ tenant, params }) => {
    try {
      return ok({ display: await revokeDisplay(tenant.dealerId, params.id) });
    } catch (err) {
      rethrowWallError(err);
    }
  }
);
