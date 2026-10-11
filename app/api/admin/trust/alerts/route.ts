/** GET/POST /api/admin/trust/alerts — güvenlik uyarıları listesi; okundu / çözüldü / yeniden aç (toplu, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { AlertActionBody, AlertListQuery } from '@/lib/admin-trust/contract';
import { alertAction, listAlerts } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.trust.alerts.list', roles: ['ADMIN'], query: AlertListQuery, rateLimit: 'read' },
  async ({ query }) => ok(await listAlerts(query))
);

export const POST = defineRoute(
  { name: 'admin.trust.alerts.action', roles: ['ADMIN'], schema: AlertActionBody, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await alertAction(actionCtx(session, request), body))
);
