import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { SHOWCASE_PIN_LIMIT } from '@/lib/badges/collection-logic';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(120) });
const Body = z.object({ isPinned: z.boolean() }).strict();

/**
 * PATCH /api/customer/badges/[id] — rozeti profil vitrinine sabitle / kaldır.
 *
 *  - Yalnız SAHİP OLUNAN rozet (`UserBadge (userId, badgeId)`); başkasınınki 404.
 *  - Vitrin sınırı `/api/customer/showcase` ile AYNI: rozet + kozmetik toplam 4 öge.
 *    Sınır, kullanıcı satırı kilitlenerek transaction içinde sayılır (iki eşzamanlı
 *    sabitleme 5. ögeyi geçiremez).
 *  - Puan basmaz. "Vitrin ustası" başarımı showcase ucu gibi toplam sabitleme sayısıyla
 *    ilerletilir (tek seferlik ödül `rewardQuestOnce` ile korunur).
 */
export const PATCH = defineRoute(
  {
    name: 'customer.badges.pin',
    roles: ['CUSTOMER'],
    params: Params,
    schema: Body,
    rateLimit: 'mutation',
  },
  async ({ params, body, user }) => {
    const userId = user.id;
    const badgeId = params.id;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const row = await tx.userBadge.findUnique({
        where: { userId_badgeId: { userId, badgeId } },
        select: { id: true, isPinned: true },
      });
      if (!row) throw new ApiError('NOT_FOUND', 'Bu rozet koleksiyonunda yok.');

      if (body.isPinned && !row.isPinned) {
        const [pinnedBadges, pinnedCosmetics] = await Promise.all([
          tx.userBadge.count({ where: { userId, isPinned: true } }),
          tx.userCosmetic.count({ where: { userId, isPinned: true } }),
        ]);
        if (pinnedBadges + pinnedCosmetics >= SHOWCASE_PIN_LIMIT) {
          throw new ApiError(
            'PIN_LIMIT',
            `Vitrinde en fazla ${SHOWCASE_PIN_LIMIT} öge sergilenebilir. Önce birini kaldır.`,
            { status: 409 },
          );
        }
      }

      if (row.isPinned !== body.isPinned) {
        await tx.userBadge.update({ where: { id: row.id }, data: { isPinned: body.isPinned } });
      }

      const [pinnedBadges, pinnedCosmetics] = await Promise.all([
        tx.userBadge.count({ where: { userId, isPinned: true } }),
        tx.userCosmetic.count({ where: { userId, isPinned: true } }),
      ]);
      return { badgeId, isPinned: body.isPinned, pinnedBadges, pinnedTotal: pinnedBadges + pinnedCosmetics };
    });

    if (body.isPinned) {
      // Başarım ilerlemesi işlemden SONRA ve hatası yanıtı bozmaz (showcase ucuyla aynı kural).
      try {
        const { advanceAchievementProgress } = await import('@/lib/achievements');
        await advanceAchievementProgress(userId, 'quest-showcase-master', result.pinnedTotal, 'set');
      } catch (e) {
        console.error('[BADGE_PIN_ACHIEVEMENT]', e);
      }
    }

    return { ...result, pinLimit: SHOWCASE_PIN_LIMIT };
  },
);
