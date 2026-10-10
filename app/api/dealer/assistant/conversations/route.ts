import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { listConversations } from '@/lib/dealer-assistant/server';

export const dynamic = 'force-dynamic';

/** GET /api/dealer/assistant/conversations — sohbet listesi (imleçli sayfalama, başlık araması). */
export const GET = defineRoute(
  {
    name: 'dealer.assistant.conversations',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: 'read',
    query: z.object({
      cursor: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional().catch(undefined),
      q: z.string().trim().max(100).optional().catch(undefined),
    }),
  },
  async ({ tenant, query }) => ok(await listConversations(tenant.dealerId, { cursor: query.cursor ?? null, q: query.q ?? null })),
);
