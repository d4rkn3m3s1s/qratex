/**
 * POST /api/admin/surprise-box/campaigns/[id]/revoke — açılmamış kutuları geri çeker.
 * Gerekçe zorunlu; koşullu silme açılışla yarışta güvenli; anlık görüntü AuditLog'da.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { campaignKeySchema, revokeSchema } from '@/lib/admin-surprise-boxes/contract';
import { revokeCampaign } from '@/lib/admin-surprise-boxes/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.surpriseBox.revoke',
    roles: ['ADMIN'],
    params: campaignKeySchema,
    schema: revokeSchema,
    rateLimit: 'mutation',
    idempotent: true,
  },
  async ({ params, body, session, request }) => ok(await revokeCampaign(params.id, body.reason, actorFromSession(session), request))
);
