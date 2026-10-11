/**
 * /api/admin/users/[id]/badges — kazanılan rozetler (GET), rozet ver (POST), geri al (DELETE).
 * Eski detay ekranı `data.userBadges` okuyordu ve uç bu alanı dönmüyordu → sekme hep boştu (B6).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { grantBadgeSchema, idParamsSchema, revokeBadgeSchema } from '@/lib/admin-users/contract';
import { getEarnedBadges } from '@/lib/admin-users/detail.server';
import { actionCtx, grantBadge, revokeBadge } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.badges', roles: ['ADMIN'], params: idParamsSchema, rateLimit: 'read' },
  async ({ params }) => ok({ items: await getEarnedBadges(params.id) })
);

export const POST = defineRoute(
  {
    name: 'admin.users.badges.grant',
    roles: ['ADMIN'],
    params: idParamsSchema,
    schema: grantBadgeSchema,
    rateLimit: 'mutation',
    idempotent: true,
  },
  async ({ params, body, session, request }) => ok(await grantBadge(actionCtx(session, request), params.id, body), { status: 201 })
);

export const DELETE = defineRoute(
  { name: 'admin.users.badges.revoke', roles: ['ADMIN'], params: idParamsSchema, schema: revokeBadgeSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await revokeBadge(actionCtx(session, request), params.id, body))
);
