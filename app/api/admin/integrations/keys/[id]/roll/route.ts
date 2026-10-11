/** POST /api/admin/integrations/keys/[id]/roll — yeni anahtar üret, eskisi ek süre sonunda geçersiz. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { RollKeyBody } from '@/lib/integrations/contract';
import { rollKey } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.integrations.keys.roll', roles: ['ADMIN'], params: Params, schema: RollKeyBody, rateLimit: 'sensitive', idempotent: true },
  async ({ params, body, session, request }) => ok(await rollKey(ctxFrom(session, request), params.id, body.graceHours), { status: 201 })
);
