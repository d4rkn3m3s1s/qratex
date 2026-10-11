/** PATCH /api/admin/dealers-health/csm-tasks/[taskId] — durum / sahiplenme (iyimser kilitli, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { TaskParams, UpdateCsmBody } from '@/components/admin/a-bayi-sagligi/server/schemas';
import { updateCsmTask } from '@/components/admin/a-bayi-sagligi/server/csm';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  { name: 'admin.dealers-health.csm.update', roles: ['ADMIN'], params: TaskParams, schema: UpdateCsmBody, rateLimit: 'mutation' },
  async ({ params, body, user, request }) =>
    ok({ task: await updateCsmTask(params.taskId, body, { id: user.id, role: user.role, ...getAuditRequestMeta(request) }) })
);
