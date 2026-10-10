import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { dismissTaskSuggestion, listTaskSuggestions } from '@/lib/dealer-queues/work-server';

export const dynamic = 'force-dynamic';

/**
 * Önerilen işler: son 30 günün olumsuz/nötr yorumlarındaki AI aksiyon önerileri, birleştirilmiş
 * ve kanıt sayılı. Salt okuma (LLM çağrısı yok, kayıt yazılmaz). Göreve çevirme `POST
 * /api/dealer/queues/tasks` ile yapılır.
 */
export const GET = defineRoute(
  {
    name: 'dealer.queues.work.suggestions',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'action_items',
    rateLimit: 'read',
  },
  async ({ tenant }) => ok({ items: await listTaskSuggestions(tenant.dealerId) })
);

const Body = z.object({ key: z.string().regex(/^[0-9a-f]{8}$/) });

/** Öneriyi gizle (bu işletme için kalıcı). */
export const POST = defineRoute(
  {
    name: 'dealer.queues.work.suggestions.dismiss',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'action_items',
    rateLimit: 'mutation',
    schema: Body,
  },
  async ({ tenant, body }) => {
    await dismissTaskSuggestion(tenant.dealerId, body.key);
    return ok({ dismissed: body.key });
  }
);
