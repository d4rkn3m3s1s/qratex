/**
 * POST /api/admin/badges/[id]/actions — archive (dryRun etki önizlemesi; kazananı varsa 409
 * CONFIRM_REQUIRED) | restore | duplicate | grant (puan basmadan, gerekçeli).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { badgeActionSchema } from '@/lib/admin-badges/contract';
import { runBadgeAction } from '@/lib/admin-badges/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.badges.action',
    roles: ['ADMIN'],
    params: z.object({ id: z.string().trim().min(1).max(64) }),
    schema: badgeActionSchema,
    rateLimit: 'mutation',
  },
  async ({ params, body, session, request }) => ok(await runBadgeAction(params.id, body, actorFromSession(session), request))
);
