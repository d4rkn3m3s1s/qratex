import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getTaskDetail, updateTask } from '@/lib/dealer-queues/work-server';
import { TASK_PRIORITIES } from '@/lib/dealer-queues/work-core';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { AssigneeIdSchema, DueAtSchema, IdParams, actorOf } from '@/lib/dealer-queues/route-helpers';

export const dynamic = 'force-dynamic';

/** Görev detayı (kaynak yorum, zaman çizelgesi, izinli geçişler). Personel yalnız kendi görevini. */
export const GET = defineRoute(
  {
    name: 'dealer.queues.tasks.detail',
    roles: ['DEALER', 'ADMIN', 'STAFF'],
    tenant: 'dealer',
    module: 'action_items',
    rateLimit: 'read',
    params: IdParams,
  },
  async ({ tenant, params, session }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    return ok(await getTaskDetail(tenant.dealerId, actorOf(tenant, session), params.id, dir));
  }
);

const PatchBody = z
  .object({
    status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
    assignedToId: AssigneeIdSchema.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt: DueAtSchema.optional(),
    note: z.string().max(1000).optional().nullable(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Değiştirilecek alan yok.' });

/** Görev durumu (Başlat · Tamamla · İptal · Yeniden aç), sorumlu, öncelik, son tarih, not. */
export const PATCH = defineRoute(
  {
    name: 'dealer.queues.tasks.update',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    module: 'action_items',
    rateLimit: 'mutation',
    params: IdParams,
    schema: PatchBody,
  },
  async ({ tenant, params, body, session }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    return ok(
      await updateTask(
        tenant.dealerId,
        actorOf(tenant, session),
        params.id,
        { status: body.status, assignedToId: body.assignedToId, priority: body.priority, dueAt: body.dueAt, note: body.note ?? null },
        dir
      )
    );
  }
);
