/** POST /api/admin/store/rewards/[id]/actions — yayınla/taslağa al/arşivle/geri al/çoğalt/stok hareketi/sınırsız. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { rewardActionSchema } from '@/lib/admin-store/contract';
import { rewardAction } from '@/lib/admin-store/rewards.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.store.rewards.action', roles: ['ADMIN'], params, schema: rewardActionSchema, rateLimit: 'mutation', idempotent: true },
  async ({ params, body, session, request }) => ok(await rewardAction(params.id, body, actorFromSession(session), request))
);
