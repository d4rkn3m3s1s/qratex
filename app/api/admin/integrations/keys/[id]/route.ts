/** GET/PATCH /api/admin/integrations/keys/[id] — anahtar detayı (kullanım + denetim) ve düzenleme. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ctxFrom } from '@/lib/integrations/route-ctx';
import { UpdateKeyBody } from '@/lib/integrations/contract';
import { getKeyDetail, updateKey } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';
const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.integrations.keys.detail', roles: ['ADMIN'], params: Params, rateLimit: 'read' },
  async ({ params }) => ok(await getKeyDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.integrations.keys.update', roles: ['ADMIN'], params: Params, schema: UpdateKeyBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updateKey(ctxFrom(session, request), params.id, body))
);
