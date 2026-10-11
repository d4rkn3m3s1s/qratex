/** POST /api/admin/integrations/webhooks/[id]/test — örnek olayı yalnız bu uca gönderir, sonucu satır içi döndürür. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { TestWebhookBody } from '@/lib/integrations/contract';
import { testWebhook } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.integrations.webhooks.test', roles: ['ADMIN'], params: Params, schema: TestWebhookBody, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ params, body, session, request }) => ok(await testWebhook(ctxFrom(session, request), params.id, body?.event))
);
