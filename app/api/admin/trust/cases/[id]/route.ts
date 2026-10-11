/** GET/POST /api/admin/trust/cases/:id — vaka detayı + bağlam; çöz / yeniden aç (gerekçeli, denetimli). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { CaseActionBody } from '@/lib/admin-trust/contract';
import { caseAction, getCaseDetail } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.trust.cases.detail', roles: ['ADMIN'], params: Params, rateLimit: 'read' },
  async ({ params }) => ok(await getCaseDetail(params.id))
);

export const POST = defineRoute(
  { name: 'admin.trust.cases.action', roles: ['ADMIN'], params: Params, schema: CaseActionBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await caseAction(actionCtx(session, request), params.id, body))
);
