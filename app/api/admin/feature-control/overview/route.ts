/** GET /api/admin/feature-control/overview — modül kontrol düzlemi (zorlama, rol matrisi, 24 sa engelleme, son değişiklik). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getModulesOverview } from '@/lib/admin-flags/modules.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.featureControl.overview', roles: ['ADMIN'], rateLimit: 'read' }, async () =>
  ok(await getModulesOverview())
);
