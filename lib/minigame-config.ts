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

/* ------------------------------------------------------------------------- *
 * Çoklu mini oyun kayıt defteri (registry)
 *
 * Pacman dışındaki tüm oyunlar tek bir generic start/complete API ve tek bir
 * şema (MiniGameSession) üzerinden çalışır. Her oyunun "puanı" 0..maxScore
 * aralığında bir tam sayıdır; ödül eşiği (rewardThreshold) aşılırsa sabit
 * puan + XP verilir. Ödül DAİMA sunucuda, bu tablodan hesaplanır — client'ın
 * bildirdiği skora körü körüne güvenilmez (cap + minimum süre).
 * ------------------------------------------------------------------------- */

export interface MiniGameDef {
  /** Veritabanı + URL anahtarı (kebab-case). MiniGameSession.gameType. */
  gameType: string;
  /** Sidebar/i18n etiket anahtarı (messages → sidebarNav.customer.<key>). */
  labelKey: string;
  /** Hub kartında ve sayfa başlığında görünen ad. */
  title: string;
  /** Kısa açıklama (hub kartı + sayfa başlığı). */
  description: string;
  /** Hub kartı emojisi / simgesi. */
  emoji: string;
  /** Tema rengi (hub kartı vurgusu) — tailwind'den bağımsız hex. */
  accent: string;
  /** Skorun üst sınırı (anti-cheat cap + zod max). */
  maxScore: number;
  /** Ödül için gereken minimum skor. */
  rewardThreshold: number;
  /** Eşik aşılınca verilen puan. */
  rewardPoints: number;
  /** Eşik aşılınca verilen XP. */
  rewardXp: number;
  /** Gerçekçi en kısa süre (sn) — bundan hızlı "tamamlandı" şüpheli. */
  minDurationSec: number;
}

/**
 * Yeni oyun eklemek = buraya bir satır + components/customer/games/<...> bileşeni
 * + app/customer/games/<gameType>/page.tsx + sidebar/i18n. API route'lar generic.
 */
export const MINI_GAMES: readonly MiniGameDef[] = [
  {
    gameType: 'mind-thief',
    labelKey: 'mind_thief_game',
    title: 'Zihin Hırsızı',
    description:
      'Bozulmuş yorumları ağ enfekte olmadan yok et, gerçek yorumlara dokunma. Patron her seviyede güçleniyor!',
    emoji: '🧠',
    accent: '#a855f7',
    maxScore: 30,
    rewardThreshold: 15,
    rewardPoints: 160,
    rewardXp: 80,
    minDurationSec: 8,
  },
  {
    gameType: 'truth-vs-fake',
    labelKey: 'truth_vs_fake_game',
    title: 'Gerçek mi Sahte mi',
    description:
      'Kartları hızlıca sağa-sola kaydır: gerçek yorum mu, sahte mi? 45 saniyede kombo yap, puanı topla.',
    emoji: '⚖️',
    accent: '#22d3ee',
    maxScore: 20,
    rewardThreshold: 12,
    rewardPoints: 140,
    rewardXp: 70,
    minDurationSec: 8,
  },
  {
    gameType: 'bot-hunter',
    labelKey: 'bot_hunter_game',
    title: 'Bot Avcısı',
    description:
      '6 profilden sahte botları yakala. Radar taraması bitmeden gerçek kullanıcıları koru!',
    emoji: '🛰️',
    accent: '#34d399',
    maxScore: 10,
    rewardThreshold: 6,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'review-detective',
    labelKey: 'review_detective_game',
    title: 'Yorum Dedektifi',
    description:
      'Elit dedektif ol: dosyadaki yorumlardan sahte/yapay olanı bul. Süre daraldıkça ipuçları azalır!',
    emoji: '🕵️',
    accent: '#f59e0b',
    maxScore: 10,
    rewardThreshold: 6,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'spam-defense',
    labelKey: 'spam_defense_game',
    title: 'Spam Savunması',
    description:
      'Qratex Çekirdeği’ni spam dalgalarından koru! Gelen botlara ateş et, dalgalar zorlaştıkça hayatta kal.',
    emoji: '🛡️',
    accent: '#ef4444',
    maxScore: 60,
    rewardThreshold: 30,
    rewardPoints: 170,
    rewardXp: 85,
    minDurationSec: 10,
  },
  {
    gameType: 'data-miner',
    labelKey: 'data_miner_game',
    title: 'Veri Madencisi',
    description:
      'Holografik küpleri aç, değerli veriyi bul — ama bazı küplerde bot tuzağı var! Risk/ödül senin elinde.',
    emoji: '⛏️',
    accent: '#06b6d4',
    maxScore: 20,
    rewardThreshold: 10,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'guardian-of-trust',
    labelKey: 'guardian_of_trust_game',
    title: 'Güven Muhafızı',
    description:
      'Yukarıdan düşen olumlu yorumları, bozuk yorumlar enfekte etmeden kalkanınla koru!',
    emoji: '✨',
    accent: '#fbbf24',
    maxScore: 25,
    rewardThreshold: 14,
    rewardPoints: 160,
    rewardXp: 80,
    minDurationSec: 10,
  },
  {
    gameType: 'troll-slayer',
    labelKey: 'troll_slayer_game',
    title: 'Troll Avcısı Arena',
    description:
      'Dijital arenada troll dalgalarıyla savaş! Dokun ve yok et, mümkün olduğunca uzun hayatta kal.',
    emoji: '⚔️',
    accent: '#f43f5e',
    maxScore: 40,
    rewardThreshold: 20,
    rewardPoints: 170,
    rewardXp: 85,
    minDurationSec: 10,
  },
  {
    gameType: 'network-defender',
    labelKey: 'network_defender_game',
    title: 'Ağ Savunucusu',
    description:
      'Düğümlere dokunarak yayılan kötü amaçlı sinyali durdur! Enfeksiyon tüm ağı sarmadan temizle.',
    emoji: '🌐',
    accent: '#8b5cf6',
    maxScore: 15,
    rewardThreshold: 8,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'combo-tap',
    labelKey: 'combo_tap_game',
    title: 'Kombo Yıldız',
    description:
      'Beliren yıldızlara hızla dokun, komboyu kaçırma! Refleksini test et, üst üste vur, puanı katla.',
    emoji: '🎯',
    accent: '#f97316',
    maxScore: 30,
    rewardThreshold: 16,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'memory-match',
    labelKey: 'memory_match_game',
    title: 'Hafıza Eşleştir',
    description:
      'Kartları çevir, eşleşen emoji çiftlerini bul! Hafızanı kullan, en az hamlede tüm çiftleri topla.',
    emoji: '🃏',
    accent: '#ec4899',
    maxScore: 8,
    rewardThreshold: 6,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'speed-order',
    labelKey: 'speed_order_game',
    title: 'Hız Sıralama',
    description:
      'Rakamlara 1’den başlayarak sırayla dokun! Süre tükenmeden doğru sırayı yakala, hızlan.',
    emoji: '⚡',
    accent: '#22d3ee',
    maxScore: 12,
    rewardThreshold: 7,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'lucky-wheel',
    labelKey: 'lucky_wheel_game',
    title: 'Şans Çarkı',
    description:
      'Çarkı doğru anda durdur! Yeşil bölgeyi yakala, riskli dilimlerden kaç, puanı topla.',
    emoji: '🎰',
    accent: '#84cc16',
    maxScore: 20,
    rewardThreshold: 12,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'word-spot',
    labelKey: 'word_spot_game',
    title: 'Sahteyi Yakala',
    description:
      'Izgaradaki kelimelerden FARKLI/sahte olanı bul! Dikkatini topla, hızlanan turlarda gözünü açık tut.',
    emoji: '🧩',
    accent: '#a78bfa',
    maxScore: 12,
    rewardThreshold: 7,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 8,
  },
  {
    gameType: 'data-snake',
    labelKey: 'data_snake_game',
    title: 'Veri Yılanı',
    description:
      'Yılanı yönlendir, veri paketlerini yut ve büyü! Bot duvarlarından ve kendi kuyruğundan kaç.',
    emoji: '🐍',
    accent: '#10b981',
    maxScore: 30,
    rewardThreshold: 12,
    rewardPoints: 160,
    rewardXp: 80,
    minDurationSec: 10,
  },
  {
    gameType: 'review-stack',
    labelKey: 'review_stack_game',
    title: 'Yorum İstifi',
    description:
      'Düşen yorum bloklarını döndürüp diz! Bir satır dolarsa onaylanır ve temizlenir. Üst üste yığma.',
    emoji: '🧱',
    accent: '#3b82f6',
    maxScore: 40,
    rewardThreshold: 16,
    rewardPoints: 170,
    rewardXp: 85,
    minDurationSec: 12,
  },
  {
    gameType: 'trust-merge',
    labelKey: 'trust_merge_game',
    title: 'Güven Birleştir',
    description:
      'Aynı güven rozetlerini kaydırıp birleştir! 2 → 4 → 8… güven skorunu en yükseğe taşı.',
    emoji: '🔢',
    accent: '#f59e0b',
    maxScore: 2048,
    rewardThreshold: 256,
    rewardPoints: 170,
    rewardXp: 85,
    minDurationSec: 12,
  },
  {
    gameType: 'signal-pipe',
    labelKey: 'signal_pipe_game',
    title: 'Sinyal Bağla',
    description:
      'Boruları döndürerek QR sinyalini kaynaktan sunucuya ulaştır! Kesintisiz hat kur, akışı tamamla.',
    emoji: '🔧',
    accent: '#06b6d4',
    maxScore: 10,
    rewardThreshold: 5,
    rewardPoints: 160,
    rewardXp: 80,
    minDurationSec: 10,
  },
  {
    gameType: 'spam-breaker',
    labelKey: 'spam_breaker_game',
    title: 'Spam Kırıcı',
    description:
      'Kalkanı kaydır, topu sektir, spam tuğlalarını kır! Çekirdeği koru, tüm bloğu temizle.',
    emoji: '🧊',
    accent: '#ef4444',
    // Skor = isabet sayısı. Tahta: 2 sıra×7 (hp2) + 3 sıra×7 (hp1) = 49 isabet üst sınır.
    maxScore: 49,
    rewardThreshold: 18,
    rewardPoints: 170,
    rewardXp: 85,
    minDurationSec: 12,
  },
];

/** gameType → tanım. Bilinmeyen tip için undefined. */
export function getMiniGame(gameType: string): MiniGameDef | undefined {
  return MINI_GAMES.find((g) => g.gameType === gameType);
}

/** Generic: bir oyun tanımı + skora göre sunucu ödülünü hesaplar (cap'li). */
export function computeGameReward(
  game: MiniGameDef,
  score: number
): { points: number; xp: number } {
  const s = Math.max(0, Math.min(game.maxScore, Math.floor(score)));
  if (s >= game.rewardThreshold) {
    return { points: game.rewardPoints, xp: game.rewardXp };
  }
  return { points: 0, xp: 0 };
}
