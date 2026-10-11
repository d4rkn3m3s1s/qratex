/** GET/PUT /api/admin/trust/rules — tespit kuralları (sunucu varsayılanı, iyimser kilit 409, gerekçeli, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { UpdateRulesBody } from '@/lib/admin-trust/contract';
import { getRulesState, updateRules } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.trust.rules.get', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getRulesState()));

export const PUT = defineRoute(
  { name: 'admin.trust.rules.update', roles: ['ADMIN'], schema: UpdateRulesBody, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await updateRules(actionCtx(session, request), body))
);
