/** GET /api/admin/users/[id]/activity — son analitik olayları + şüpheli etkinlikler. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema } from '@/lib/admin-users/contract';
import { getUserActivity } from '@/lib/admin-users/detail.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.activity', roles: ['ADMIN'], params: idParamsSchema, rateLimit: 'read' },
  async ({ params }) => ok({ items: await getUserActivity(params.id) })
);
