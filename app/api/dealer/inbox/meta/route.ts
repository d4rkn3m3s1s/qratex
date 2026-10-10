/**
 * GET /api/dealer/inbox/meta — Gelen Kutusu yardımcı verisi: atanabilir kişiler (işletme sahibi
 * + aktif personel, e-postasız), QR kodları (filtre), yanıt şablonları (varsayılan şablon +
 * etkin otomatik yanıt kurallarının metinleri), SLA hedefleri, telafi modülü ve AI durumu.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getInboxMeta } from '@/lib/dealer-inbox/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.inbox.meta',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: z.object({ dealerId: z.string().max(191).optional() }),
  },
  async ({ tenant, user }) => ok(await getInboxMeta(tenant.dealerId, user.id))
);
