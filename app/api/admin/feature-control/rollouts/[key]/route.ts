/** PUT /api/admin/feature-control/rollouts/:key — modülün kademeli açılış kuralını oluştur / güncelle / durdur (gerekçeli, 409, denetimli). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { UpsertRolloutBody } from '@/lib/admin-flags/contract';
import { upsertRollout } from '@/lib/admin-flags/flags.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ key: z.string().regex(/^[a-z0-9_]{2,64}$/) });

export const PUT = defineRoute(
  { name: 'admin.featureControl.rollout.upsert', roles: ['ADMIN'], params: Params, schema: UpsertRolloutBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok({ id: await upsertRollout(actionCtx(session, request), params.key, body) })
);
