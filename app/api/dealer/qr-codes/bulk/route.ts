/** POST /api/dealer/qr-codes/bulk — toplu etkinleştir / duraklat (iptal/arşiv dışı kodlar). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { bulkQr } from '@/lib/dealer/qr-codes/actions.server';
import { qrBulkSchema } from '@/lib/dealer/qr-codes/rules';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.qr-codes.bulk',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: qrBulkSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 32 * 1024,
  },
  async ({ tenant, body }) =>
    ok(await bulkQr({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body.action, body.ids))
);
