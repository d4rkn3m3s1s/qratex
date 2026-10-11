/** GET /api/admin/trust/cases — vaka kuyruğu (filtreli, sayfalı). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { CaseListQuery } from '@/lib/admin-trust/contract';
import { listCases } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.trust.cases.list', roles: ['ADMIN'], query: CaseListQuery, rateLimit: 'read' },
  async ({ query }) => ok(await listCases(query))
);
