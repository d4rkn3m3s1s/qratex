/** POST /api/admin/trust/subjects/:userId — sahtekârlık durumu (iyimser kilit) / askıya al / askıyı kaldır. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { SubjectActionBody } from '@/lib/admin-trust/contract';
import { subjectAction } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.trust.subjects.action',
    roles: ['ADMIN'],
    params: z.object({ userId: z.string().min(1).max(64) }),
    schema: SubjectActionBody,
    rateLimit: 'mutation',
  },
  async ({ params, body, session, request }) => ok(await subjectAction(actionCtx(session, request), params.userId, body))
);
