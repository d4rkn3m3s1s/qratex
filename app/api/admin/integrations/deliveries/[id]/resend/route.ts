/** POST /api/admin/integrations/deliveries/[id]/resend — saklanan gövdeyi aynı uca yeniden gönderir (denetimli). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { resendDelivery } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.integrations.deliveries.resend', roles: ['ADMIN'], params: Params, rateLimit: { max: 20, windowMs: 60_000, by: 'user' } },
  async ({ params, session, request }) => ok(await resendDelivery(ctxFrom(session, request), params.id))
);
