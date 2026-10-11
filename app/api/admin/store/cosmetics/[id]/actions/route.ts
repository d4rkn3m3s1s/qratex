/** POST /api/admin/store/cosmetics/[id]/actions — satışa aç/kaldır, arşivle/geri al, çoğalt. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { cosmeticActionSchema } from '@/lib/admin-store/contract';
import { cosmeticAction } from '@/lib/admin-store/cosmetics.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.store.cosmetics.action', roles: ['ADMIN'], params, schema: cosmeticActionSchema, rateLimit: 'mutation', idempotent: true },
  async ({ params, body, session, request }) => ok(await cosmeticAction(params.id, body, actorFromSession(session), request))
);
