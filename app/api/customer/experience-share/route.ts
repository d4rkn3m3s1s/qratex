import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { createExperienceShare, resolveShareBase } from '@/lib/venue-detail/share';
import { SHARE_CAPTION_KEYS, SHARE_MOODS } from '@/lib/venue-detail/types';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().trim().min(8).max(64),
  experience: z.object({
    kind: z.enum(['feedback', 'review']),
    id: z.string().trim().min(8).max(64),
  }),
  captionKey: z.enum(SHARE_CAPTION_KEYS, { errorMap: () => ({ message: 'Bir not seçin.' }) }),
  mood: z.enum(SHARE_MOODS, { errorMap: () => ({ message: 'Bir ruh hâli seçin.' }) }),
});

/**
 * Anonim deneyim kartı (7 gün) — müşterinin KENDİ 4-5 puanlık deneyim kaydına bağlı,
 * şablon metinli. Serbest metin kabul edilmez (denetim B2). Ayrıntı: lib/venue-detail/share.ts.
 */
export const POST = defineRoute(
  {
    name: 'customer.experience-share.create',
    roles: ['CUSTOMER'],
    schema: bodySchema,
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    module: 'experiences',
  },
  async ({ body, user, request }) => {
    const link = await createExperienceShare({
      userId: user.id,
      dealerId: body.dealerId,
      ref: body.experience,
      captionKey: body.captionKey,
      mood: body.mood,
      baseUrl: resolveShareBase(request.nextUrl?.origin ?? null),
    });
    return ok({ link }, { status: link.reused ? 200 : 201 });
  }
);
