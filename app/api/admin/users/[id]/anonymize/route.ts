/**
 * /api/admin/users/[id]/anonymize — KVKK anonimleştirmesi (kalıcı silme YOK).
 * GET: etki önizlemesi + engelleyiciler · POST: e-posta yazılarak onaylı yürütme.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { anonymizeSchema, idParamsSchema } from '@/lib/admin-users/contract';
import { actionCtx, confirmAnonymize, previewAnonymize } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.anonymize.preview', roles: ['ADMIN'], params: idParamsSchema, rateLimit: 'read' },
  async ({ params, session, request }) => ok(await previewAnonymize(actionCtx(session, request), params.id))
);

export const POST = defineRoute(
  { name: 'admin.users.anonymize', roles: ['ADMIN'], params: idParamsSchema, schema: anonymizeSchema, rateLimit: 'sensitive' },
  async ({ params, body, session, request }) =>
    ok(await confirmAnonymize(actionCtx(session, request), params.id, body.confirmPhrase))
);
