/**
 * `GET /api/admin/command-center/events?actor=all|admin|dealer|customer|system&cursor=…`
 * Komuta Merkezi "Son olaylar" akışı: denetim kayıtları insan diliyle, aktör filtreli,
 * imleçli sayfalama (15'er). Eski/yeni ayrıntı (oldData/newData) DÖNMEZ — tam kayıt
 * `/admin/audit`'te. Yalnız ADMIN (+ yönetici kapısı).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadCommandEvents } from '@/lib/admin-command/server';
import { EVENT_ACTORS } from '@/lib/admin-command/types';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.command-center.events',
    roles: ['ADMIN'],
    rateLimit: 'read',
    query: z.object({
      actor: z.enum(EVENT_ACTORS).default('all'),
      cursor: z.string().max(200).optional(),
    }),
  },
  async ({ query }) => ok(await loadCommandEvents(query.actor, query.cursor ?? null))
);
