import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { bulkRemedyAction } from '@/lib/dealer-queues/remedy-server';
import { REMEDY_BULK_MAX, REMEDY_REJECT_REASONS } from '@/lib/dealer-queues/remedy-core';
import { actorOf } from '@/lib/dealer-queues/route-helpers';

export const dynamic = 'force-dynamic';

const Id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), ids: z.array(Id).min(1).max(REMEDY_BULK_MAX) }),
  z.object({
    action: z.literal('reject'),
    ids: z.array(Id).min(1).max(REMEDY_BULK_MAX),
    reason: z.enum(REMEDY_REJECT_REASONS),
    note: z.string().max(300).optional().nullable(),
  }),
]);

/** Toplu yayın / red — her taslak ayrı transaction; sonuç özeti (işlenen + başarısız) döner. */
export const POST = defineRoute(
  {
    name: 'dealer.queues.remedy.bulk',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'remedy_offers',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    schema: Body,
  },
  async ({ tenant, body, session }) => {
    const actor = actorOf(tenant, session);
    const result =
      body.action === 'publish'
        ? await bulkRemedyAction(tenant.dealerId, body.ids, actor, { action: 'publish' })
        : await bulkRemedyAction(tenant.dealerId, body.ids, actor, { action: 'reject', reason: body.reason, note: body.note ?? null });
    return ok(result);
  }
);
