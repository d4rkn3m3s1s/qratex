/** GET /api/admin/badges/lab/targets?q= — yalnız test hesapları (demo müşteri + allowlist). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { labTargetsQuerySchema } from '@/lib/admin-badges/contract';
import { listLabTargets } from '@/lib/admin-badges/lab.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.badges.lab.targets', roles: ['ADMIN'], query: labTargetsQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok({ items: await listLabTargets(query.q) })
);
