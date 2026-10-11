/** POST /api/admin/integrations/webhooks/[id]/rotate-secret — yeni imza sırrı (yanıtta bir kez). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { rotateWebhookSecret } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.integrations.webhooks.rotate', roles: ['ADMIN'], params: Params, rateLimit: 'sensitive', idempotent: true },
  async ({ params, session, request }) => ok(await rotateWebhookSecret(ctxFrom(session, request), params.id))
);
