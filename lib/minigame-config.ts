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
  /**
   * Oyunun gerçekçi en kısa süresi (sn) — bundan hızlı "tamamlandı" şüpheli. BFS en kısa
   * rota 45 hücre ≈ 10,6 sn (60 Hz); hareket artık kare hızından bağımsız (dt), 9 sn
   * köşe hizalaması payıyla güvenli alt sınır (önceden 5: fiziksel sınırın yarısı).
   */
  minDurationSec: 9,
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
  /**
   * Makullük üst sınırı: sunucu saatine göre geçen saniye başına en fazla bu kadar skor
   * (P0-17 → F4.1). `skor > maxScorePerSec × geçenSn` ise deneme kazanılmış sayılmaz.
   * Değerler bilerek cömert: dürüst en hızlı oyuncuyu değil, betikle gönderilen
   * "anında tavan skor"u yakalar. Tanımsız → yalnız minDurationSec uygulanır.
   */
  maxScorePerSec?: number;
  /**
   * Deneme penceresi (sn): start'tan bu kadar sonra complete kabul edilmez ve yarım
   * kalan `active` deneme `failed` (oynandı, kaybedildi) sayılır. Süreli oyunlarda tur
   * süresi + 90 sn tolerans; süresiz bulmacalarda daha geniş. Tanımsız → 900 sn.
   */
  maxDurationSec?: number;
  /**
   * Portföy kararı (yol haritası §7.3): `true` → oyun hub'da, turnuva rotasyonunda ve
   * sıralı (ödüllü) denemede KAPALI; kod ve geçmiş veri silinmez (geri alınabilir).
   */
  hidden?: boolean;
  /** Gizleme gerekçesi (admin panelinde gösterilir). */
  hiddenReason?: string;
  /**
   * `'building'` → yeni portföy oyunu henüz yapım aşamasında (lib/games/registry `status:
   * 'building'`). `hidden: true` ile birlikte kullanılır: hub'da, turnuva rotasyonunda ve
   * sıralı denemede kapalı; start "henüz yayında değil" der (emekli mesajı değil).
   * Oyun ajanı canlıya alırken `hidden` ve `release`'i birlikte kaldırır.
   */
  release?: 'building';
}

/** Deneme penceresi tanımsız oyunlar için varsayılan (sn). */
export const DEFAULT_MAX_DURATION_SEC = 900;

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
    maxScorePerSec: 2.7,
    // 45 sn tur + ilk oynayış öğreticisi + duraklatma payı (deneme penceresi). Skor sunucuda replay ile.
    maxDurationSec: 240,
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
    maxScorePerSec: 1.8,
    maxDurationSec: 135,
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
    maxScorePerSec: 1,
    maxDurationSec: 155,
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
    maxScorePerSec: 1,
    maxDurationSec: 180,
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
    maxScorePerSec: 5,
    maxDurationSec: 140,
    hidden: true,
    hiddenReason: 'Çekirdek Savunması (core-defense) oyununa birleşti (§7.3 #6–7).',
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
    maxScorePerSec: 2,
    maxDurationSec: 900,
    hidden: true,
    hiddenReason:
      'Saf şans; açıklamadaki beceri yok ve skor tavanına ulaşılamıyor (§7.3 #21 KALDIR).',
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
    maxScorePerSec: 2,
    maxDurationSec: 140,
    hidden: true,
    hiddenReason: 'Kar Tanesi Yakala (frost-catcher) oyununa iyi/kötü modifikatörü olarak birleşti (§7.3 #8–9).',
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
    maxScorePerSec: 3,
    maxDurationSec: 145,
    hidden: true,
    hiddenReason: 'Çekirdek Savunması (core-defense) oyununa birleşti (§7.3 #6–7).',
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
    maxScorePerSec: 1.5,
    maxDurationSec: 140,
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
    maxScorePerSec: 3,
    maxDurationSec: 120,
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
    maxScorePerSec: 0.8,
    maxDurationSec: 900,
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
    maxScorePerSec: 1.2,
    maxDurationSec: 135,
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
    maxScorePerSec: 2,
    maxDurationSec: 135,
    hidden: true,
    hiddenReason:
      'Saf RNG; "doğru anda durdur" mekaniği yok, günlük çarkla çakışıyor (§7.3 #20 KALDIR).',
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
    maxScorePerSec: 1.2,
    maxDurationSec: 900,
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
    maxScorePerSec: 2,
    maxDurationSec: 1800,
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
    maxScorePerSec: 1,
    maxDurationSec: 3600,
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
    maxScorePerSec: 25,
    maxDurationSec: 3600,
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
    maxScorePerSec: 0.5,
    maxDurationSec: 1800,
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
    maxScorePerSec: 3,
    maxDurationSec: 1800,
  },
  {
    gameType: 'frost-catcher',
    labelKey: 'frost_catcher_game',
    title: 'Kar Tanesi Yakala',
    description:
      'Buzul Krallığı’nda gökten düşen kar tanelerini eldivenle yakala! Kombo yap, altın kristali kaçırma, buzu eritme.',
    emoji: '❄️',
    accent: '#38bdf8',
    // v2 (Dalga 2): 45 sn tohumlu sim, skor sunucuda replay ile hesaplanır. Kar +1, altın +3,
    // 10+/20+ komboda +1/+2. Bot kalibrasyonu (__tests__/lib/frost-catcher.test.ts): hareketsiz
    // ≤ ~34, seyrek ~34 ort., dikkatli ~97 ort., en iyi ~155 → eşik 45, tavan 200 (betik sigortası).
    // Deneme penceresi duraklatma payıyla 300 sn.
    maxScore: 200,
    rewardThreshold: 45,
    rewardPoints: 120,
    rewardXp: 60,
    minDurationSec: 10,
    maxScorePerSec: 6,
    maxDurationSec: 300,
  },

  // ── Yeni portföy (yol haritası §7.3, lib/games/registry) — YAPIM AŞAMASINDA ──
  // Sunucu kuralları oyun ajanları canlıya alana dek gizli; değerler ilk tasarım hedefidir,
  // oyun ajanı mekaniğe göre ayarlar (makullük testleri: lib/minigame-config.test).
  {
    gameType: 'fake-hunter',
    labelKey: 'fake_hunter_game',
    title: 'Sahte Avcısı',
    description:
      'Dört aşamada sahteyi yakala: yorumu kaydır, yorumcu dosyasını incele, ele veren cümleyi bul, botu tanı. Puanı sunucu hesaplar.',
    emoji: '🕵️',
    accent: '#22d3ee',
    maxScore: 30,
    rewardThreshold: 14,
    rewardPoints: 160,
    rewardXp: 80,
    minDurationSec: 20,
    maxScorePerSec: 1.2,
    maxDurationSec: 240,
  },
  {
    gameType: 'core-defense',
    labelKey: 'core_defense_game',
    title: 'Çekirdek Savunması',
    description:
      'Qratex çekirdeğini spam ve trol dalgalarından koru: çekirdeğin canı var, 8 dalga zorlaşır, aralarda yükseltme seç.',
    emoji: '🛡️',
    accent: '#ef4444',
    // Skor sunucuda replay ile hesaplanır (deterministik doğrulayıcı); tavan yalnız güvenlik
    // sınırı — usta oyun ≈ 900–1000 (kombo + kusursuz dalga), eşik ≈ 5.–6. dalga.
    maxScore: 1200,
    rewardThreshold: 250,
    rewardPoints: 170,
    rewardXp: 85,
    minDurationSec: 30,
    maxScorePerSec: 12,
    // 8 dalga ≈ 2–2,5 dk + yükseltme seçimleri + duraklatma payı.
    maxDurationSec: 600,
  },
  {
    gameType: 'daily-word',
    labelKey: 'daily_word_game',
    title: 'Günün Kelimesi',
    description:
      'Herkese aynı 5 harfli Türkçe kelimeyi 6 denemede bul; her tahminde harfler renklenir.',
    emoji: '🔤',
    accent: '#84cc16',
    // Skor = 7 − tahmin sayısı (1. tahminde 6 … 6. tahminde 1; bulamazsa 0).
    maxScore: 6,
    rewardThreshold: 1,
    rewardPoints: 120,
    rewardXp: 60,
    minDurationSec: 15,
    maxScorePerSec: 0.3,
    maxDurationSec: 900,
    hidden: true,
    release: 'building',
    hiddenReason: 'Yapım aşamasında: yeni oyun, sıra 1 (§7.3).',
  },
  {
    gameType: 'match-three',
    labelKey: 'match_three_game',
    title: 'Eşleştir-3',
    description:
      'Komşu rozetleri yer değiştirerek üç ve fazlasını eşleştir; seviye hedefini hamle bitmeden tamamla.',
    emoji: '💎',
    accent: '#ec4899',
    maxScore: 60,
    rewardThreshold: 24,
    rewardPoints: 160,
    rewardXp: 80,
    minDurationSec: 30,
    maxScorePerSec: 1.5,
    maxDurationSec: 600,
    hidden: true,
    release: 'building',
    hiddenReason: 'Yapım aşamasında: yeni oyun, sıra 2; memory-match’in yerini alır (§7.3).',
  },
  {
    gameType: 'venue-quiz',
    labelKey: 'venue_quiz_game',
    title: 'Mekân Bilgi Yarışması',
    description:
      'Mekânlar ve kategoriler hakkında süreli sorular; doğru cevap ve hız puan getirir.',
    emoji: '🏆',
    accent: '#8b5cf6',
    maxScore: 10,
    rewardThreshold: 6,
    rewardPoints: 150,
    rewardXp: 75,
    minDurationSec: 30,
    maxScorePerSec: 0.3,
    maxDurationSec: 300,
    hidden: true,
    release: 'building',
    hiddenReason: 'Yapım aşamasında: yeni oyun, sıra 3; canlıya çıkınca portföy tavanı (12) için en zayıf oyun emekliye ayrılır (§7.3).',
  },
];

/** gameType → tanım. Bilinmeyen tip için undefined. */
export function getMiniGame(gameType: string): MiniGameDef | undefined {
  return MINI_GAMES.find((g) => g.gameType === gameType);
}

/**
 * Yıldız Avı (sunucu anahtarı tarihsel olarak 'pacman'). Oyun kayıt defterinde
 * (lib/games/registry/star-hunt.ts) ve generic `[game]` API'sinden geçer; sunucu kuralları
 * (ödül, eşik, süre, makullük, admin aç/kapat override'ı) burada. MINI_GAMES'e EKLENMEZ
 * (hub/turnuva rotasyonu indeks tuzağı — lib/games/README.md).
 * Skor = 5 seviye boyunca toplanan yıldız (0..25); eşik 5 = ilk seviyeyi temizlemek.
 * Skor sunucuda deterministik replay ile hesaplanır (lib/games/validators/star-hunt.ts).
 */
export const PACMAN_GAME: MiniGameDef = {
  gameType: MINIGAME.gameType,
  labelKey: 'pacman_game',
  title: 'Yıldız Avı',
  description: 'Labirentte yıldızları topla, hayaletlerden kaç: 5 seviye, 3 can. İlk 5 yıldız ödülü getirir.',
  emoji: '👾',
  accent: '#fbbf24',
  // components/customer/games/star-hunt/sim.ts MAX_SCORE (5 seviye × 5 yıldız).
  maxScore: 25,
  rewardThreshold: MINIGAME.starsForReward,
  rewardPoints: MINIGAME.rewardPoints,
  rewardXp: MINIGAME.rewardXp,
  minDurationSec: MINIGAME.minDurationSec,
  // Oyuncu 4,5 hücre/sn; seviye başı 1,5 sn hazırlık + seviye arası 1,7 sn. Skor replay'le
  // sunucunun; bu tavan yalnız betik koruması (25 yıldız > 0,8 × 9 sn).
  maxScorePerSec: 0.8,
  maxDurationSec: 900,
};

/** Registry oyunları + pacman: sunucu tarafı tek arama (start/complete/admin/turnuva). */
export const ALL_GAME_DEFS: readonly MiniGameDef[] = [...MINI_GAMES, PACMAN_GAME];

/** gameType → tanım (pacman dahil). Bilinmeyen tip için undefined. */
export function getGameDef(gameType: string): MiniGameDef | undefined {
  return ALL_GAME_DEFS.find((g) => g.gameType === gameType);
}

/** Portföyde görünür (gizlenmemiş) registry oyunları — hub ve turnuva rotasyonu. */
export function visibleMiniGames(): MiniGameDef[] {
  return MINI_GAMES.filter((g) => !g.hidden);
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
