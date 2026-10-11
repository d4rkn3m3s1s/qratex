/**
 * POST /api/admin/store/redemptions/[id] — Talep aksiyonu:
 *   fulfil → teslim edildi (claimedAt, bildirim)
 *   cancel → iptal + ödenen puanın iadesi (lib/economy mintPoints, tek-kez anahtarlı) + stok iadesi
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { redemptionActionSchema } from '@/lib/admin-store/contract';
import { redemptionAction } from '@/lib/admin-store/redemptions.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.store.redemptions.action', roles: ['ADMIN'], params, schema: redemptionActionSchema, rateLimit: 'mutation', idempotent: true },
  async ({ params, body, session, request }) => ok(await redemptionAction(params.id, body, actorFromSession(session), request))
);
