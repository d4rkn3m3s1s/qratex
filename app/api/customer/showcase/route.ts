import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { SHOWCASE_PIN_LIMIT } from '@/lib/badges/collection-logic';

export const dynamic = 'force-dynamic';

/**
 * Profil vitrini (eski uç; yeni istemci Cüzdan → Kozmetik `cosmetics/state` kullanır).
 *
 * Güvenlik (müşteri API denetimi O3/D1): eskiden ham `getServerSession` (askıya alınmış / oturumu
 * iptal edilmiş hesap geçiyordu) ve şemasız gövde (dizi olmayan değer 500, sınırsız kimlik
 * listesi) vardı. Artık yalnız CUSTOMER (`requireAuth`: oturum sürümü, askı, güncel rol DB'den),
 * zod gövdesi ve hız sınırı.
 */
export const GET = defineRoute(
  { name: 'customer.showcase.get', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    const [ownedCosmetics, ownedBadges, userDetails] = await Promise.all([
      prisma.userCosmetic.findMany({ where: { userId: user.id }, include: { cosmetic: true }, take: 500 }),
      prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true }, take: 500 }),
      prisma.user.findUnique({ where: { id: user.id }, select: { customFrameColor: true } }),
    ]);
    return ok(
      { cosmetics: ownedCosmetics, badges: ownedBadges, customFrameColor: userDetails?.customFrameColor || null },
      { legacySpread: true }
    );
  }
);

const idList = z
  .array(z.string().trim().min(1).max(64))
  .max(SHOWCASE_PIN_LIMIT)
  .default([])
  .refine((ids) => new Set(ids).size === ids.length, 'Aynı öge vitrine iki kez eklenemez.');

const Body = z
  .object({ pinnedBadgeIds: idList, pinnedCosmeticIds: idList })
  .strict()
  .refine((b) => b.pinnedBadgeIds.length + b.pinnedCosmeticIds.length <= SHOWCASE_PIN_LIMIT, {
    message: `Vitrinde en fazla ${SHOWCASE_PIN_LIMIT} öge sergilenebilir.`,
  });

export const POST = defineRoute(
  { name: 'customer.showcase.update', roles: ['CUSTOMER'], schema: Body, rateLimit: 'mutation' },
  async ({ user, body }) => {
    const userId = user.id;
    const { pinnedBadgeIds, pinnedCosmeticIds } = body;
    const totalPins = pinnedBadgeIds.length + pinnedCosmeticIds.length;

    // Yalnız sahip olunan ögeler sergilenebilir.
    const [validBadges, validCosmetics] = await Promise.all([
      prisma.userBadge.count({ where: { userId, badgeId: { in: pinnedBadgeIds } } }),
      prisma.userCosmetic.count({ where: { userId, cosmeticId: { in: pinnedCosmeticIds } } }),
    ]);
    if (validBadges !== pinnedBadgeIds.length || validCosmetics !== pinnedCosmeticIds.length) {
      throw new ApiError('VALIDATION', 'Geçersiz öge seçimi. Sadece sahip olduğunuz ögeleri sergileyebilirsiniz.');
    }

    await prisma.$transaction([
      prisma.userCosmetic.updateMany({ where: { userId }, data: { isPinned: false } }),
      prisma.userBadge.updateMany({ where: { userId }, data: { isPinned: false } }),
      prisma.userCosmetic.updateMany({ where: { userId, cosmeticId: { in: pinnedCosmeticIds } }, data: { isPinned: true } }),
      prisma.userBadge.updateMany({ where: { userId, badgeId: { in: pinnedBadgeIds } }, data: { isPinned: true } }),
    ]);

    // Vitrin ustası başarımı (tek seferlik ödeme lib/quests/reward → rewardQuestOnce).
    const { advanceAchievementProgress } = await import('@/lib/achievements');
    await advanceAchievementProgress(userId, 'quest-showcase-master', totalPins, 'set');

    return ok({ message: 'Vitrin başarıyla güncellendi!' }, { legacySpread: true });
  }
);
