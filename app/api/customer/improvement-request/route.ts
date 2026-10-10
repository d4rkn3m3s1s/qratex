import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { createImprovementRequest } from '@/lib/venue-detail/improvement';
import { loadResponseTime } from '@/lib/venue-detail/detail';
import {
  IMPROVEMENT_MESSAGE_MAX,
  IMPROVEMENT_MESSAGE_MIN,
  IMPROVEMENT_TEMPLATE_KEYS,
} from '@/lib/venue-detail/types';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().trim().min(8).max(64),
  templateKey: z.enum(IMPROVEMENT_TEMPLATE_KEYS, {
    errorMap: () => ({ message: 'Bir konu seçin.' }),
  }),
  message: z
    .string({ required_error: 'Mesaj gerekli.' })
    .trim()
    .min(IMPROVEMENT_MESSAGE_MIN, `En az ${IMPROVEMENT_MESSAGE_MIN} karakter yazın.`)
    .max(IMPROVEMENT_MESSAGE_MAX, `En fazla ${IMPROVEMENT_MESSAGE_MAX} karakter yazabilirsiniz.`),
  // Eski istemci alanı: müşteri işletmenin yanıt süresini SEÇEMEZ (B7). Gelirse yok sayılır.
  expectedHours: z.unknown().optional(),
});

/**
 * "Daha iyi olabilirdi" — mekâna iyileştirme isteği (mekân detayı, `/customer/places/[dealerId]`).
 * Uygunluk, tavanlar ve bildirim: lib/venue-detail/improvement.ts.
 */
export const POST = defineRoute(
  {
    name: 'customer.improvement-request.create',
    roles: ['CUSTOMER'],
    schema: bodySchema,
    rateLimit: { max: 5, windowMs: 60_000, by: 'user' },
    module: 'experiences',
  },
  async ({ body, user }) => {
    const now = new Date();
    const response = await loadResponseTime(body.dealerId, now).catch(() => null);
    const request = await createImprovementRequest({
      userId: user.id,
      dealerId: body.dealerId,
      templateKey: body.templateKey,
      message: body.message,
      expectedHours: response?.hours ?? null,
      now,
    });
    return ok({ request, responseTime: response }, { status: 201 });
  }
);
