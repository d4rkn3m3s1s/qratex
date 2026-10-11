/** POST /api/admin/trust/cases/bulk — seçili açık vakaları gerekçeyle toplu çözer (denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { BulkResolveBody } from '@/lib/admin-trust/contract';
import { bulkResolve } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.trust.cases.bulk', roles: ['ADMIN'], schema: BulkResolveBody, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await bulkResolve(actionCtx(session, request), body))
);
