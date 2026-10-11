/** GET /api/admin/integrations/deliveries — teslim günlüğü (imleçli; ?webhookId= &status=ok|failed). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { DeliveryListQuery } from '@/lib/integrations/contract';
import { listDeliveries } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';

const Query = DeliveryListQuery.extend({ webhookId: z.string().trim().max(64).optional() });

export const GET = defineRoute(
  { name: 'admin.integrations.deliveries.list', roles: ['ADMIN'], query: Query, rateLimit: 'read' },
  async ({ query }) => ok(await listDeliveries(query.webhookId ?? null, query))
);
