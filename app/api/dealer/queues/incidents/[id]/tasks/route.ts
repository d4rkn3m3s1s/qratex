import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { createTaskFromIncident } from '@/lib/dealer-queues/incident-server';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { AssigneeIdSchema, DueAtSchema, IdParams, actorOf } from '@/lib/dealer-queues/route-helpers';
import { TASK_TEXT_MAX } from '@/lib/dealer-queues/work-core';

export const dynamic = 'force-dynamic';

const Body = z.object({
  text: z.string().max(TASK_TEXT_MAX).optional().nullable(),
  assignedToId: AssigneeIdSchema.optional(),
  dueAt: DueAtSchema.optional(),
});

/** Vakadan görev üret ("ne oldu" → "ne yapacağız"); görev Bana atananlar'da izlenir. */
export const POST = defineRoute(
  {
    name: 'dealer.queues.incidents.task',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'incidents',
    rateLimit: 'mutation',
    params: IdParams,
    schema: Body,
  },
  async ({ tenant, params, body, session }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    const detail = await createTaskFromIncident(
      tenant.dealerId,
      actorOf(tenant, session),
      params.id,
      { text: body.text ?? null, assignedToId: body.assignedToId, dueAt: body.dueAt ?? null },
      dir
    );
    return ok(detail, { status: 201 });
  }
);
