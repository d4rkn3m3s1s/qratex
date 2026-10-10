/**
 * GET /api/dealer/inbox/[key] — tek kaydın detayı (Gelen Kutusu çekmecesi).
 *
 *   key = qr-<feedbackId> | cr-<consumptionReviewId>
 *
 * Tam metin, medya, boyut puanları, AI sinyalleri (niyet, aciliyet, kayıp riski, güven bayrağı
 * ve gerekçesi), müşterinin bu işletmedeki geçmişi (e-postasız), telafi teklifleri + telafi
 * uygunluğu (sunucu otoriter), vaka/atama ve eşleşen otomatik yanıt kuralı uyarısı.
 * Başka işletmenin kaydı ile olmayan kayıt aynı 404'ü alır. GET yan etkisizdir ("görüldü"
 * işareti ayrı bir POST ile yazılır).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getInboxDetail, InboxError } from '@/lib/dealer-inbox/server';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ key: z.string().regex(/^(qr|cr)-[A-Za-z0-9_-]{1,64}$/, 'Geçersiz kayıt anahtarı.') });

export const GET = defineRoute(
  {
    name: 'dealer.inbox.detail',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    params: paramsSchema,
    query: z.object({ dealerId: z.string().max(191).optional() }),
  },
  async ({ params, tenant, user }) => {
    try {
      return ok(await getInboxDetail(tenant.dealerId, user.id, params.key));
    } catch (err) {
      if (err instanceof InboxError) throw new ApiError(err.code, err.message, { status: err.status, details: err.details });
      throw err;
    }
  }
);
