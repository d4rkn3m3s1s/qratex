/** PUT /api/admin/pricing/reorder — vitrin sırası (arşivlenmemiş planların tamamı, denetimli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { ReorderBody } from '@/lib/admin-pricing/contract';
import { reorderPlans } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

export const PUT = defineRoute(
  { name: 'admin.pricing.reorder', roles: ['ADMIN'], schema: ReorderBody, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await reorderPlans(actionCtx(session, request), body.ids))
);
