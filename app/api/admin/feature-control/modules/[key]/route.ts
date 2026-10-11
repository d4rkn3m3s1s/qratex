/** PATCH /api/admin/feature-control/modules/:key — tek modülü aç/kapa (gerekçeli, iyimser kilit 409, denetimli, kapı önbelleği anında tazelenir). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { PatchModuleBody } from '@/lib/admin-flags/contract';
import { patchModule } from '@/lib/admin-flags/modules.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ key: z.string().regex(/^[a-z0-9_]{2,64}$/) });

export const PATCH = defineRoute(
  { name: 'admin.featureControl.module.patch', roles: ['ADMIN'], params: Params, schema: PatchModuleBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await patchModule(actionCtx(session, request), params.key, body))
);
