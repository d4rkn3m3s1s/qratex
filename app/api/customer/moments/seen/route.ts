/**
 * An Motoru — anları "görüldü" işaretle (spec §1 · API).
 *
 *   POST { ids: string[] }  (1–20 id) → { updated: number }
 *
 * İstemci bir anı GÖSTERMEYE BAŞLADIĞINDA çağırır; sekme ortada kapansa da an tekrar
 * oynamaz. Yalnız oturumdaki müşterinin kayıtları güncellenir (where userId = oturum):
 * başka kullanıcının id'si gönderilse bile etkisizdir. Zaten görülmüşlerin `seenAt`'i
 * değişmez (idempotent).
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { MOMENTS_SEEN_MAX_IDS } from '@/lib/moments/types';

export const dynamic = 'force-dynamic';

const SeenBody = z.object({
  ids: z
    .array(z.string().trim().min(1).max(64))
    .min(1, 'En az bir an seçilmeli.')
    .max(MOMENTS_SEEN_MAX_IDS, `Tek seferde en fazla ${MOMENTS_SEEN_MAX_IDS} an işaretlenebilir.`),
});

export const POST = defineRoute(
  {
    name: 'customer.moments.seen',
    roles: ['CUSTOMER'],
    schema: SeenBody,
    rateLimit: 'mutation',
    maxBodyBytes: 8_000,
  },
  async ({ body, user }) => {
    const ids = [...new Set(body.ids)];
    const res = await prisma.customerMoment.updateMany({
      where: { id: { in: ids }, userId: user.id, seenAt: null },
      data: { seenAt: new Date() },
    });
    return ok({ updated: res.count }, { legacySpread: true });
  }
);
