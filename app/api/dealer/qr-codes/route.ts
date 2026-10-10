/**
 * GET  /api/dealer/qr-codes — sunucu tarafı arama/filtre/sıralama/sayfalama (rapor #14-16, #41).
 * POST /api/dealer/qr-codes — tek kod ya da "Masa 1–N" serisi; kota kilidi altında (D5).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadQrList } from '@/lib/dealer/qr-codes/load.server';
import { createQrCodes } from '@/lib/dealer/qr-codes/actions.server';
import { normalizeQrFilters, qrCreateSchema, qrListQuerySchema } from '@/lib/dealer/qr-codes/rules';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.qr-codes.list', roles: ['DEALER'], tenant: 'dealer', query: qrListQuerySchema, rateLimit: 'read' },
  async ({ tenant, query }) => ok(await loadQrList(tenant.dealerId, normalizeQrFilters(query)))
);

export const POST = defineRoute(
  {
    name: 'dealer.qr-codes.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: qrCreateSchema,
    rateLimit: 'mutation',
    idempotent: true,
    maxBodyBytes: 16 * 1024,
  },
  async ({ tenant, body }) =>
    ok(await createQrCodes({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body), { status: 201 })
);
