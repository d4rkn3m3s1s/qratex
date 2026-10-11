/** POST /api/admin/dealers-health/[dealerId]/csm-tasks — bayi için CSM görevi aç (denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { CreateCsmBody, DealerParams } from '@/components/admin/a-bayi-sagligi/server/schemas';
import { createCsmTask } from '@/components/admin/a-bayi-sagligi/server/csm';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.dealers-health.csm.create',
    roles: ['ADMIN'],
    params: DealerParams,
    schema: CreateCsmBody,
    rateLimit: 'mutation',
    idempotent: true,
  },
  async ({ params, body, user, request }) => {
    const task = await createCsmTask(
      params.dealerId,
      { priority: body.priority, note: body.note, dueAt: body.dueAt ?? null, assignToMe: body.assignToMe, window: body.window },
      { id: user.id, role: user.role, ...getAuditRequestMeta(request) }
    );
    return ok({ task }, { status: 201 });
  }
);
