/**
 * Müşteri Ana Sayfa (§4.3) — `GET /api/customer/home` BFF sözleşmesi.
 *
 * Sunucu ve istemci ikisi de içe aktarır (Prisma/Node bağımlılığı YOK). Tüm tarih
 * alanları ISO 8601 metindir (SSR → HydrationBoundary → istemci arasında kayıpsız).
 * Hiçbir alan "uydurma" değildir: her sayı bir DB satırından ya da sunucu ayarından gelir;
 * bir bölüm kapalıysa (modül/menü) `sections.*` false olur ve UI onu hiç çizmez.
 */

export type HomeGreeting = 'morning' | 'afternoon' | 'evening' | 'night';

export interface HomeProfile {
  name: string | null;
  image: string | null;
  /** Kuşanılmış avatar çerçevesi kimliği (`fire_effect` vb.) — `UserAvatarFrame` tanır. */
  frameId: string | null;
  /** Çerçeve ton kaydırma (hue-rotate derece) — kullanıcı seçimi. */
  frameColor: string | null;
  /** Kuşanılmış profil arka planı — yalnız güvenli https görsel URL'si (aksi null). */
  backgroundUrl: string | null;
}

export interface HomeLevel {
  level: number;
  /** Toplam XP. */
  xp: number;
  /** Bu seviyede toplanan XP. */
  intoLevel: number;
  /** Bu seviyeyi bitirmek için gereken XP. */
  levelSpan: number;
}

export interface HomeRewardTarget {
  id: string;
  name: string;
  cost: number;
  /** Çözümlenmiş görsel (yol/URL) ya da null → ikon yer tutucusu. */
  image: string | null;
}

export interface HomeWallet {
  /** Harcanabilir puan bakiyesi. */
  points: number;
  /** Bakiyenin şu an yettiği (aktif, stokta, geçerli) ödül sayısı. */
  affordableRewards: number;
  /** Bakiyenin henüz yetmediği en ucuz ödül (yoksa null). */
  nextReward: HomeRewardTarget | null;
  /** `nextReward` için kalan puan. */
  pointsToNextReward: number | null;
  /** Bu hafta (İstanbul, Pazartesi 00:00'dan beri) kazanılan puan — `points_credited` defterinden. */
  weekEarned: number;
}

export interface HomeStreak {
  /** Güncel kesintisiz gün sayısı (bugün ya da dün sayıldıysa; aksi 0 — seri kırılmış). */
  days: number;
  longest: number;
  /** Bugün (İstanbul) sayıldı mı. */
  countedToday: boolean;
  /** Pazartesi→Pazar, bu haftanın 7 günü: seri içinde mi (gerçek ardışık günlerden türetilir). */
  week: Array<{ day: string; active: boolean; isToday: boolean; isFuture: boolean }>;
  /** Sıradaki ödüllü kilometre taşı (yoksa null). */
  nextMilestone: { days: number; points: number; daysLeft: number } | null;
}

export type HomeGoalId = 'streak' | 'review' | 'spin' | 'box' | 'game';

export interface HomeGoal {
  id: HomeGoalId;
  done: boolean;
  /** Hedefe götüren sayfa; çark gibi sayfa içi eylemlerde null. */
  href: string | null;
}

export type HomePendingId = 'reviews' | 'boxes' | 'rewards' | 'remedy';

export interface HomePendingAction {
  id: HomePendingId;
  count: number;
  href: string;
}

export interface HomeLeagueStep {
  key: string;
  name: string;
  minPoints: number;
}

export interface HomeLeague {
  key: string;
  name: string;
  minPoints: number;
  maxPoints: number;
  /** Lig içi ilerleme yüzdesi (0–100; son ligde 100). */
  progress: number;
  next: HomeLeagueStep | null;
  pointsToNext: number | null;
  /** Ligdeki sıra (bakiyeye göre, aynı metrik). */
  rankInLeague: number;
  leagueSize: number;
  /** Bir üstteki kişiyi geçmek için gereken puan (zirvedeyse null). */
  gapToAbove: number | null;
  ladder: HomeLeagueStep[];
}

export interface HomeSpinPrize {
  id: string;
  label: string;
  type: 'points' | 'xp' | 'nothing';
  value: number;
}

export interface HomeSpin {
  dailyLimit: number;
  remaining: number;
  prizes: HomeSpinPrize[];
  /** Sonraki hak yenilenmesi (İstanbul gece yarısı), ISO. */
  resetAt: string;
}

export interface HomeSurpriseBox {
  /** Bugünün günlük kutusu açıldı mı. */
  openedToday: boolean;
  /** Açılmamış kutu sayısı (hediye + günlük). */
  unopened: number;
}

export interface HomeSections {
  rewards: boolean;
  surpriseBoxes: boolean;
  leaderboard: boolean;
  games: boolean;
  remedy: boolean;
  spin: boolean;
}

export interface CustomerHomeData {
  /** Sunucu saati (ISO) — istemci "şimdi"yi tahmin etmez. */
  now: string;
  /** İstanbul günü (YYYY-MM-DD). */
  today: string;
  greeting: HomeGreeting;
  /** Hiç değerlendirme yapmamış (QR + tüketim) → ilk adımlar kartı. */
  isNewCustomer: boolean;
  profile: HomeProfile;
  level: HomeLevel;
  wallet: HomeWallet;
  streak: HomeStreak;
  goals: HomeGoal[];
  pending: HomePendingAction[];
  league: HomeLeague;
  /** Çark kapalıysa null. */
  spin: HomeSpin | null;
  /** Sürpriz kutu modülü kapalıysa null. */
  surpriseBox: HomeSurpriseBox | null;
  sections: HomeSections;
}

/** React Query anahtarı — sayfa, mutasyonlar ve testler aynı anahtarı kullanır. */
export const CUSTOMER_HOME_QUERY_KEY = ['customer', 'home'] as const;
