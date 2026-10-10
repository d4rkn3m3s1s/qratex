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
 * KREDİ BURADA YAPILMAZ. Rozet ve ödülü yalnız `awardBadge` (lib/badges/award.ts) verir:
 * rozet oluşturma + `mintPoints` (defter, tek-kez anahtarı, points_credited) + An Motoru anı
 * aynı transaction'da. Eski `creditBadgeRewardInTx` / `creditBadgeReward` yardımcıları
 * kaldırıldı (P0-14): ayrı bir kredi yolu, rozetsiz ya da tekrar puan basmaya kapı açıyordu.
 */

/** Rozetin ödül puanı (yoksa 0). Genel ve karakter tablolarının ikisine de bakar. */
export function badgeRewardPoints(badgeId: string): number {
  const emoji = getEmojiBadgeText(badgeId);
  if (emoji) return Math.max(0, Math.floor(emoji.points));
  const character = getCharacterRevealText(badgeId);
  if (character) return Math.max(0, Math.floor(character.points));
  return 0;
}
