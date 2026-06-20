/**
 * Mini oyun başarımları (achievements). Mevcut Badge/UserBadge sistemine
 * dokunmadan, tamamen MiniGameSession verisinden türetilir — ayrı tablo/migration
 * yok. Her başarımın bir hedefi (target) ve oyuncunun verisinden hesaplanan bir
 * ilerlemesi (progress) vardır. Kilidi açık = progress >= target.
 *
 * Yeni başarım eklemek = bu diziye bir satır + computeAchievementStats'ta gerekli
 * metriği üret.
 */
export type AchievementMetric =
  | 'totalWins' // toplam kazanılan oyun
  | 'distinctGames' // kaç farklı oyun türü oynandı
  | 'bestScore' // herhangi bir oyundaki en yüksek tek skor
  | 'totalPlays' // toplam tamamlanan oyun (kazanç/kayıp)
  | 'streak'; // en uzun günlük seri

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  metric: AchievementMetric;
  target: number;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-win', title: 'İlk Zafer', description: 'İlk oyununu kazan.', icon: '🥇', rarity: 'common', metric: 'totalWins', target: 1 },
  { id: 'win-10', title: 'Usta Oyuncu', description: '10 oyun kazan.', icon: '🏅', rarity: 'rare', metric: 'totalWins', target: 10 },
  { id: 'win-50', title: 'Efsane', description: '50 oyun kazan.', icon: '👑', rarity: 'legendary', metric: 'totalWins', target: 50 },
  { id: 'explorer-5', title: 'Kâşif', description: '5 farklı oyun oyna.', icon: '🧭', rarity: 'common', metric: 'distinctGames', target: 5 },
  { id: 'explorer-all', title: 'Koleksiyoncu', description: '10 farklı oyun oyna.', icon: '🎮', rarity: 'epic', metric: 'distinctGames', target: 10 },
  { id: 'score-20', title: 'Keskin Nişancı', description: 'Tek oyunda 20+ skor yap.', icon: '🎯', rarity: 'rare', metric: 'bestScore', target: 20 },
  { id: 'score-40', title: 'Skor Avcısı', description: 'Tek oyunda 40+ skor yap.', icon: '💥', rarity: 'epic', metric: 'bestScore', target: 40 },
  { id: 'play-25', title: 'Müdavim', description: 'Toplam 25 oyun tamamla.', icon: '🔁', rarity: 'rare', metric: 'totalPlays', target: 25 },
  { id: 'streak-3', title: 'Isınıyor', description: '3 günlük seri yap.', icon: '🔥', rarity: 'common', metric: 'streak', target: 3 },
  { id: 'streak-7', title: 'Haftalık Kahraman', description: '7 günlük seri yap.', icon: '⚡', rarity: 'epic', metric: 'streak', target: 7 },
  { id: 'streak-30', title: 'Durdurulamaz', description: '30 günlük seri yap.', icon: '🌟', rarity: 'legendary', metric: 'streak', target: 30 },
] as const;

export interface AchievementStats {
  totalWins: number;
  distinctGames: number;
  bestScore: number;
  totalPlays: number;
  streak: number;
}

export interface AchievementProgress extends AchievementDef {
  progress: number;
  unlocked: boolean;
  pct: number;
}

/** Bir başarımın oyuncunun istatistiklerine göre durumunu hesaplar. */
export function evaluateAchievements(stats: AchievementStats): AchievementProgress[] {
  return ACHIEVEMENTS.map((a) => {
    const progress = Math.min(stats[a.metric], a.target);
    return {
      ...a,
      progress,
      unlocked: stats[a.metric] >= a.target,
      pct: Math.round((progress / a.target) * 100),
    };
  });
}

export const RARITY_COLOR: Record<AchievementDef['rarity'], string> = {
  common: '#94a3b8',
  rare: '#38bdf8',
  epic: '#a855f7',
  legendary: '#fbbf24',
};
