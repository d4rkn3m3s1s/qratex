/** POST /api/admin/users/[id]/access-link — şifre sıfırlama (doğrulanmamışsa doğrulama) bağlantısı gönder. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema } from '@/lib/admin-users/contract';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { sendAccessLink } from '@/lib/admin-users/account.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.users.access-link', roles: ['ADMIN'], params: idParamsSchema, rateLimit: 'sensitive' },
  async ({ params, session, request }) => ok(await sendAccessLink(actionCtx(session, request), params.id))
);
