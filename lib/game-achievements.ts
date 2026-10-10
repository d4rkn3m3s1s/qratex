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
  | 'bestScore' // herhangi bir oyundaki en yüksek ham skor (ESKİ; birimler kıyaslanamaz, başarımda kullanılmaz)
  | 'bestScorePct' // bir oyunda o oyunun tavan skoruna oranla en iyi skor (%0–100) — birimden bağımsız
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
  // Skor başarımları oyunun TAVAN skoruna oranla ölçülür (eski "20+/40+ ham skor" trust-merge'de
  // karo değeriyle bedavaya açılıyor, hafıza/bot oyunlarında hiç açılamıyordu).
  { id: 'peak-80', title: 'Keskin Nişancı', description: 'Bir oyunda tavan skorun %80’ine ulaş.', icon: '🎯', rarity: 'rare', metric: 'bestScorePct', target: 80 },
  { id: 'peak-100', title: 'Kusursuz', description: 'Bir oyunda tavan skora ulaş.', icon: '💥', rarity: 'epic', metric: 'bestScorePct', target: 100 },
  { id: 'play-25', title: 'Müdavim', description: 'Toplam 25 oyun tamamla.', icon: '🔁', rarity: 'rare', metric: 'totalPlays', target: 25 },
  { id: 'streak-3', title: 'Isınıyor', description: '3 günlük seri yap.', icon: '🔥', rarity: 'common', metric: 'streak', target: 3 },
  { id: 'streak-7', title: 'Haftalık Kahraman', description: '7 günlük seri yap.', icon: '⚡', rarity: 'epic', metric: 'streak', target: 7 },
  { id: 'streak-30', title: 'Durdurulamaz', description: '30 günlük seri yap.', icon: '🌟', rarity: 'legendary', metric: 'streak', target: 30 },
] as const;

export interface AchievementStats {
  totalWins: number;
  distinctGames: number;
  bestScore: number;
  /** Tavan skora oranla en iyi skor (%0–100). Eski istemciler/mock'lar vermeyebilir → 0. */
  bestScorePct?: number;
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
    const raw = Number(stats[a.metric] ?? 0);
    const value = Number.isFinite(raw) ? raw : 0;
    const progress = Math.min(value, a.target);
    return {
      ...a,
      progress,
      unlocked: value >= a.target,
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
