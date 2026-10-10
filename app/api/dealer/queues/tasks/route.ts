import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { createTask } from '@/lib/dealer-queues/work-server';
import { TASK_PRIORITIES, TASK_TEXT_MAX } from '@/lib/dealer-queues/work-core';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { AssigneeIdSchema, DueAtSchema, actorOf } from '@/lib/dealer-queues/route-helpers';

export const dynamic = 'force-dynamic';

const Body = z.object({
  text: z.string().trim().min(3, 'Görev metni en az 3 karakter olmalı.').max(TASK_TEXT_MAX, `Görev en fazla ${TASK_TEXT_MAX} karakter olabilir.`),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedToId: AssigneeIdSchema.optional(),
  dueAt: DueAtSchema.optional(),
  feedbackId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional().nullable(),
});

/** Görev oluştur (elle ya da öneriden). Açık aynı görev varsa 409. */
export const POST = defineRoute(
  {
    name: 'dealer.queues.tasks.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'action_items',
    rateLimit: { max: 30, windowMs: 10 * 60_000, by: 'user' },
    schema: Body,
  },
  async ({ tenant, body, session }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    const detail = await createTask(
      tenant.dealerId,
      actorOf(tenant, session),
      {
        text: body.text,
        priority: body.priority,
        assignedToId: body.assignedToId,
        dueAt: body.dueAt ?? null,
        feedbackId: body.feedbackId ?? null,
      },
      dir
    );
    return ok(detail, { status: 201 });
  }
);
