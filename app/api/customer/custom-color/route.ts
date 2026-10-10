import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    /** Çerçeve renk tonu (hue-rotate derecesi, 0–360) ya da sıfırlamak için null. */
    customFrameColor: z.union([
      z.null(),
      z
        .string()
        .regex(/^\d{1,3}$/, 'Renk tonu 0–360 arasında bir sayı olmalı.')
        .refine((v) => Number(v) <= 360, 'Renk tonu 0–360 arasında bir sayı olmalı.'),
    ]),
  })
  .strict();

/**
 * POST /api/customer/custom-color — kuşanılmış avatar çerçevesinin renk tonu (Ayarlar → Profil).
 * Denetim B14: değer artık doğrulanıyor (eskiden sınırsız uzunlukta herhangi bir metin yazılıyordu),
 * hız sınırı var; "0" sıfırlama olarak saklanır.
 */
export const POST = defineRoute(
  { name: 'customer.custom-color', roles: ['CUSTOMER'], schema: Body, rateLimit: 'mutation' },
  async ({ user, body }) => {
    const value = body.customFrameColor && body.customFrameColor !== '0' ? String(Number(body.customFrameColor)) : null;
    await prisma.user.update({ where: { id: user.id }, data: { customFrameColor: value }, select: { id: true } });
    if (value) {
      const { advanceAchievementProgress } = await import('@/lib/achievements');
      await advanceAchievementProgress(user.id, 'quest-color-wizard', 1, 'increment').catch((e: unknown) => {
        console.error('[custom-color] görev ilerlemesi yazılamadı', e);
      });
    }
    return ok({ customFrameColor: value, message: 'Çerçeve rengi güncellendi.' }, { legacySpread: true });
  },
);
