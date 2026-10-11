/** GET /api/admin/badges/lab?user=<e-posta|id> — test hedefinin kategori ilerlemesi (üretim hesabıyla). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { labTargetQuerySchema } from '@/lib/admin-badges/contract';
import { getLabStatus } from '@/lib/admin-badges/lab.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.badges.lab.status', roles: ['ADMIN'], query: labTargetQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getLabStatus(query.user))
);
