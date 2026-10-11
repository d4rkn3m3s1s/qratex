/** POST /api/admin/integrations/keys/[id]/revoke — gerekçeli iptal (silme yok; iz kalır). 409 zaten iptal. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { RevokeKeyBody } from '@/lib/integrations/contract';
import { revokeKey } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.integrations.keys.revoke', roles: ['ADMIN'], params: Params, schema: RevokeKeyBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await revokeKey(ctxFrom(session, request), params.id, body.reason))
);
