/** GET/PATCH /api/admin/integrations/webhooks/[id] — detay ve düzenleme (URL, olaylar, aktif/duraklat, arşiv). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { UpdateWebhookBody } from '@/lib/integrations/contract';
import { getWebhookDetail, updateWebhook } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.integrations.webhooks.detail', roles: ['ADMIN'], params: Params, rateLimit: 'read' },
  async ({ params }) => ok(await getWebhookDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.integrations.webhooks.update', roles: ['ADMIN'], params: Params, schema: UpdateWebhookBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updateWebhook(ctxFrom(session, request), params.id, body))
);
