/** POST /api/admin/store/rewards/[id]/pool — Partner kupon kod havuzu: ekle / çıkar / kapat (stok havuza eşitlenir). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { poolActionSchema } from '@/lib/admin-store/contract';
import { poolAction } from '@/lib/admin-store/rewards.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.store.rewards.pool', roles: ['ADMIN'], params, schema: poolActionSchema, rateLimit: 'mutation', idempotent: true, maxBodyBytes: 256_000 },
  async ({ params, body, session, request }) => ok(await poolAction(params.id, body, actorFromSession(session), request))
);
