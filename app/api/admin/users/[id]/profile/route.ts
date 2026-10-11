/** PATCH /api/admin/users/[id]/profile — ad/telefon ve (bayi ise) işletme/konum bilgisi. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema, profilePatchSchema } from '@/lib/admin-users/contract';
import { actionCtx, updateProfile } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  { name: 'admin.users.profile', roles: ['ADMIN'], params: idParamsSchema, schema: profilePatchSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await updateProfile(actionCtx(session, request), params.id, body))
);
