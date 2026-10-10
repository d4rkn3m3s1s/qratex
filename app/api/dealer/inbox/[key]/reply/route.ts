/**
 * POST /api/dealer/inbox/[key]/reply — yanıt yaz ya da düzenle.
 *
 *   { reply: string (1..2000), expectedReply: string | null }
 *
 * `expectedReply`, bayinin ekranda gördüğü mevcut yanıttır (yanıtsızsa null). Kayıt bu arada
 * değiştiyse (otomatik yanıt kuralı, başka sekme, ekip arkadaşı) 409 `REPLY_CONFLICT` + güncel
 * yanıt döner: kimsenin yanıtı ezilmez. Müşteri bildirimi + e-posta yalnız ilk yanıtta gider.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { InboxError, replyToInboxItem } from '@/lib/dealer-inbox/server';
import { REPLY_MAX } from '@/lib/dealer-inbox/core';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ key: z.string().regex(/^(qr|cr)-[A-Za-z0-9_-]{1,64}$/, 'Geçersiz kayıt anahtarı.') });

const bodySchema = z.object({
  reply: z
    .string({ required_error: 'Yanıt boş olamaz.', invalid_type_error: 'Yanıt metin olmalı.' })
    .trim()
    .min(1, 'Yanıt boş olamaz.')
    .max(REPLY_MAX, `Yanıt en fazla ${REPLY_MAX} karakter olabilir.`),
  expectedReply: z.string().max(REPLY_MAX * 2).nullable(),
});

export const POST = defineRoute(
  {
    name: 'dealer.inbox.reply',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    rateLimit: 'mutation',
    params: paramsSchema,
    schema: bodySchema,
  },
  async ({ params, body, tenant }) => {
    try {
      return ok(
        await replyToInboxItem({
          dealerId: tenant.dealerId,
          key: params.key,
          reply: body.reply,
          expectedReply: body.expectedReply,
        })
      );
    } catch (err) {
      if (err instanceof InboxError) throw new ApiError(err.code, err.message, { status: err.status, details: err.details });
      throw err;
    }
  }
);
