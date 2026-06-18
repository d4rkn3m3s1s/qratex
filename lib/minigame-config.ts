/**
 * Pacman tarzı mini oyun sabitleri. Ödül ve eşikler tek yerde; sunucu bunları
 * kullanarak ödülü doğrular (client'ın bildirdiği yıldız sayısına körü körüne
 * güvenilmez — makul üst sınır + minimum süre kontrolü).
 */
export const MINIGAME = {
  gameType: 'pacman',
  /** Ödül için gereken yıldız sayısı. */
  starsForReward: 5,
  /** Haritadaki toplam yıldız (üst sınır doğrulaması). */
  totalStars: 5,
  /** 5 yıldızda verilen sabit ödül (puan). */
  rewardPoints: 150,
  /** Ödülün XP karşılığı. */
  rewardXp: 75,
  /** Oyunun gerçekçi en kısa süresi (sn) — bundan hızlı "tamamlandı" şüpheli. */
  minDurationSec: 5,
} as const;

/** Toplanan yıldıza göre sunucu ödülünü hesaplar (cap'li). */
export function computeMinigameReward(starsCollected: number): {
  points: number;
  xp: number;
} {
  const stars = Math.max(0, Math.min(MINIGAME.totalStars, Math.floor(starsCollected)));
  if (stars >= MINIGAME.starsForReward) {
    return { points: MINIGAME.rewardPoints, xp: MINIGAME.rewardXp };
  }
  return { points: 0, xp: 0 };
}
