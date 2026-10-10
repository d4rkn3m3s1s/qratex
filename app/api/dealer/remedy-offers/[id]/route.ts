import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { publishRemedyDraft, rejectRemedyDraft } from '@/lib/dealer-queues/remedy-server';
import { REMEDY_REJECT_REASONS } from '@/lib/dealer-queues/remedy-core';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish') }),
  z.object({
    action: z.literal('reject'),
    reason: z.enum(REMEDY_REJECT_REASONS).default('other'),
    note: z.string().max(300).optional().nullable(),
  }),
]);

/**
 * Eski karar ucu — geriye uyumlu. Yeni ve tam uç: `/api/dealer/queues/remedy/[id]`.
 * publish: awaiting_dealer_approval → pending + müşteri bildirimi (tek transaction, kaynak kilidi,
 *          çifte telafi 409, `notificationSent` gerçek sonuç).
 * reject:  awaiting_dealer_approval → rejected (+ neden, zaman çizelgesine yazılır).
 */
export const POST = defineRoute(
  {
    name: 'dealer.remedy-offers.decide',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'remedy_offers',
    rateLimit: 'mutation',
    params: Params,
    schema: Body,
  },
  async ({ tenant, params, body, session }) => {
    const actor = { id: tenant.actorId, name: session.user?.name ?? null, role: tenant.actorRole };
    const result =
      body.action === 'publish'
        ? await publishRemedyDraft(tenant.dealerId, params.id, actor)
        : await rejectRemedyDraft(tenant.dealerId, params.id, actor, { reason: body.reason, note: body.note ?? null });
    return ok(result, { legacySpread: true });
  }
);
