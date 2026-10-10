import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import {
  REMEDY_EDIT_MESSAGE_MAX,
  editRemedyDraft,
  getRemedyDetail,
  publishRemedyDraft,
  rejectRemedyDraft,
  restoreRemedyDraft,
} from '@/lib/dealer-queues/remedy-server';
import { REMEDY_REJECT_REASONS } from '@/lib/dealer-queues/remedy-core';
import { IdParams, actorOf } from '@/lib/dealer-queues/route-helpers';

export const dynamic = 'force-dynamic';

/** Telafi taslağı detayı: kaynak yorumun tamamı, müşteri bağlamı, güncel şablon, zaman çizelgesi. */
export const GET = defineRoute(
  {
    name: 'dealer.queues.remedy.detail',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'remedy_offers',
    rateLimit: 'read',
    params: IdParams,
  },
  async ({ tenant, params }) => ok(await getRemedyDetail(tenant.dealerId, params.id))
);

const EditBody = z
  .object({
    message: z.string().max(REMEDY_EDIT_MESSAGE_MAX + 50).optional(),
    options: z.array(z.unknown()).min(1).max(10).optional(),
  })
  .refine((b) => b.message !== undefined || b.options !== undefined, { message: 'Değiştirilecek alan yok.' });

/** Yayın öncesi düzenleme (yalnız onay bekleyen taslak; seçenekler şablon izin listesinin alt kümesi). */
export const PATCH = defineRoute(
  {
    name: 'dealer.queues.remedy.edit',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'remedy_offers',
    rateLimit: 'mutation',
    params: IdParams,
    schema: EditBody,
  },
  async ({ tenant, params, body, session }) =>
    ok(await editRemedyDraft(tenant.dealerId, params.id, actorOf(tenant, session), body))
);

const ActionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish') }),
  z.object({
    action: z.literal('reject'),
    reason: z.enum(REMEDY_REJECT_REASONS),
    note: z.string().max(300).optional().nullable(),
  }),
  z.object({ action: z.literal('restore') }),
]);

/** Karar: yayınla (müşteriye bildirim) · reddet (neden) · reddi geri al (10 dk). */
export const POST = defineRoute(
  {
    name: 'dealer.queues.remedy.decide',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'remedy_offers',
    rateLimit: 'mutation',
    params: IdParams,
    schema: ActionBody,
  },
  async ({ tenant, params, body, session }) => {
    const actor = actorOf(tenant, session);
    if (body.action === 'publish') return ok(await publishRemedyDraft(tenant.dealerId, params.id, actor));
    if (body.action === 'reject') {
      return ok(await rejectRemedyDraft(tenant.dealerId, params.id, actor, { reason: body.reason, note: body.note ?? null }));
    }
    return ok(await restoreRemedyDraft(tenant.dealerId, params.id, actor));
  }
);
