/**
 * GET   /api/admin/store/rewards/[id] — Ayrıntı: 30 günlük talep serisi (İstanbul günü), son talepler, geçmiş, kod havuzu.
 * PATCH /api/admin/store/rewards/[id] — Yalnız değişen alanlar + expectedUpdatedAt (409 çakışma).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { rewardPatchSchema } from '@/lib/admin-store/contract';
import { getRewardDetail, updateReward } from '@/lib/admin-store/rewards.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.store.rewards.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params }) => ok(await getRewardDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.store.rewards.update', roles: ['ADMIN'], params, schema: rewardPatchSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updateReward(params.id, body, actorFromSession(session), request))
);
