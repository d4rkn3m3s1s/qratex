/** GET/POST /api/admin/integrations/webhooks — abonelikler (sır istemciye gitmez; yalnız oluşturma yanıtında bir kez). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { CreateWebhookBody, WebhookListQuery } from '@/lib/integrations/contract';
import { createWebhook, listWebhooks } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.integrations.webhooks.list', roles: ['ADMIN'], query: WebhookListQuery, rateLimit: 'read' },
  async ({ query }) => ok({ items: await listWebhooks(query) })
);

export const POST = defineRoute(
  { name: 'admin.integrations.webhooks.create', roles: ['ADMIN'], schema: CreateWebhookBody, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createWebhook(ctxFrom(session, request), body), { status: 201 })
);
