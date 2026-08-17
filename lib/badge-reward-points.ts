import { prisma } from '@/lib/prisma';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getEmojiBadgeText } from '@/lib/emoji-badge-texts';
import { getCharacterRevealText } from '@/lib/character-reveal-texts';

/**
 * ROZET ÖDÜL PUANI — rozet KAZANILDIĞINDA kullanıcıya yatırılan puan.
 *
 * `Badge.pointCost` ile KARIŞTIRMA: o "mağazadan puanla satın alma maliyeti"dir.
 * Buradaki ödül puanı ise rozeti hak edince HESABA EKLENİR.
 *
 * Tek doğruluk kaynağı metin tablolarıdır:
 *   • genel/emoji rozetleri  → lib/emoji-badge-texts.ts   (points)
 *   • karakter rozetleri     → lib/character-reveal-texts.ts (points)
 *
 * EKONOMİ İNVARYANTLARI ([[points-economy-invariants]]):
 *  1. ATOMİK + TEK SEFERLİK: puan yalnız UserBadge satırı O ÇAĞRIDA yaratıldıysa verilir.
 *     Çağıran, rozeti createMany({skipDuplicates:true}) ile ekleyip `count`u geçmelidir;
 *     count=0 (zaten vardı) ise puan BASILMAZ → tekrar çalıştırma puan çoğaltmaz.
 *  2. AYNI TRANSACTION: rozet eklemesiyle puan kredisi aynı tx'te olmalı (kısmi durum yok).
 *  3. GÖRÜNÜRLÜK: her kredi `points_credited` analytics olayı yazar (anti-fraud denetimi).
 */

/** Rozetin ödül puanı (yoksa 0). Genel ve karakter tablolarının ikisine de bakar. */
export function badgeRewardPoints(badgeId: string): number {
  const emoji = getEmojiBadgeText(badgeId);
  if (emoji) return Math.max(0, Math.floor(emoji.points));
  const character = getCharacterRevealText(badgeId);
  if (character) return Math.max(0, Math.floor(character.points));
  return 0;
}

/** creditPointsAndXp ile uyumlu minimal tx tipi (prisma tx veya client). */
type TxLike = Parameters<typeof creditPointsAndXp>[0] & {
  analyticsEvent: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  notification: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

/**
 * Rozet ödül puanını AYNI transaction içinde krediler + görünürlük olayı yazar.
 *
 * ⚠️ Çağıran SORUMLULUĞU: bu fonksiyon "rozet gerçekten YENİ mi" kontrolü YAPMAZ.
 * Yalnızca `justCreated` true iken çağır (createMany count>0 / create başarılı).
 * Böylece aynı rozet için puan iki kez basılamaz.
 *
 * @returns kredilenen puan (0 = ödül tanımsız veya justCreated=false)
 */
export async function creditBadgeRewardInTx(
  tx: TxLike,
  params: { userId: string; badgeId: string; badgeName?: string; justCreated: boolean }
): Promise<number> {
  if (!params.justCreated) return 0;
  const points = badgeRewardPoints(params.badgeId);
  if (points <= 0) return 0;

  await creditPointsAndXp(tx, { userId: params.userId, points });

  // Anti-fraud görünürlüğü: puan basan HER yol points_credited yazmalı (aynı tx).
  await tx.analyticsEvent.create({
    data: {
      userId: params.userId,
      event: 'points_credited',
      category: 'badge',
      data: { points, badgeId: params.badgeId },
    },
  });

  return points;
}

/**
 * Rozet ödülünü tek başına (kendi transaction'ında) krediler.
 * Rozet EKLEME işlemi zaten başka bir tx'te bittiyse ve `justCreated` biliniyorsa kullanılır.
 * Mümkünse `creditBadgeRewardInTx` tercih edilmeli (tek tx = kısmi durum riski yok).
 */
export async function creditBadgeReward(params: {
  userId: string;
  badgeId: string;
  justCreated: boolean;
}): Promise<number> {
  if (!params.justCreated) return 0;
  const points = badgeRewardPoints(params.badgeId);
  if (points <= 0) return 0;

  return prisma.$transaction(async (tx) => {
    await creditPointsAndXp(tx, { userId: params.userId, points });
    await tx.analyticsEvent.create({
      data: {
        userId: params.userId,
        event: 'points_credited',
        category: 'badge',
        data: { points, badgeId: params.badgeId },
      },
    });
    return points;
  });
}
