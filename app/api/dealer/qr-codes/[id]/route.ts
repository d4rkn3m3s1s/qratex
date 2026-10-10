/**
 * GET   /api/dealer/qr-codes/[id] — detay (30 gün tarama/yorum, bağlantı kırılımı, rotate geçmişi).
 * PATCH /api/dealer/qr-codes/[id] — ad, açıklama, şube, son kullanma, aktiflik, karşılama bağlantıları.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { loadQrDetail } from '@/lib/dealer/qr-codes/load.server';
import { updateQrCode } from '@/lib/dealer/qr-codes/actions.server';
import { qrUpdateSchema } from '@/lib/dealer/qr-codes/rules';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'dealer.qr-codes.detail', roles: ['DEALER'], tenant: 'dealer', params, rateLimit: 'read' },
  async ({ tenant, params: p }) => {
    const detail = await loadQrDetail(tenant.dealerId, p.id);
    if (!detail) throw new ApiError('NOT_FOUND', 'QR kod bulunamadı.');
    return ok(detail);
  }
);

export const PATCH = defineRoute(
  {
    name: 'dealer.qr-codes.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    params,
    schema: qrUpdateSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 32 * 1024,
  },
  async ({ tenant, params: p, body }) =>
    ok(await updateQrCode({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id, body))
);
