/** GET /api/admin/feature-control/rollouts — kademeli açılış kuralları + yetim bayraklar + aday modüller. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getRolloutsState } from '@/lib/admin-flags/flags.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.featureControl.rollouts', roles: ['ADMIN'], rateLimit: 'read' }, async () =>
  ok(await getRolloutsState())
);
