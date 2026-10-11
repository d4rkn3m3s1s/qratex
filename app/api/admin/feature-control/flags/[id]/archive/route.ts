/** POST /api/admin/feature-control/flags/:id/archive — kodda okunmayan (yetim) bayrağı arşivler; kalıcı silme yok. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { ArchiveFlagBody } from '@/lib/admin-flags/contract';
import { archiveOrphan } from '@/lib/admin-flags/flags.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.featureControl.flag.archive', roles: ['ADMIN'], params: Params, schema: ArchiveFlagBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => {
    await archiveOrphan(actionCtx(session, request), params.id, body.reason);
    return ok({ archived: true });
  }
);
