/**
 * Ben → İlerleme yüzeyinin sunucu ↔ istemci sözleşmesi (JSON'a serileşir; Date yok, ISO var).
 * Sunucu sayıyı hesaplar; istemci yalnız biçimler ve çevirir.
 */
import type { ContributionResult } from './contribution';
import type { LevelMilestone, LevelProgress } from './level';
import type { BucketUnit, Change, ProgressPeriod } from './period';

/** Bir bölüm hesaplanamadıysa adı burada; UI "şu an hesaplanamadı" gösterir (200 + sıfır yok). */
export type PartialKey =
  | 'rewards'
  | 'league'
  | 'badges'
  | 'contribution'
  | 'pending'
  | 'velocity'
  | 'activity'
  | 'points'
  | 'habits'
  | 'experience'
  | 'places';

export type BadgeChip = {
  id: string;
  name: string;
  /** Görsel (küçük resim) ya da null. */
  imageSrc: string | null;
  /** Emoji/kısa metin ikon (görsel yoksa). */
  emoji: string | null;
  rarity: string;
  color: string | null;
  earnedAt: string;
};

export type StreakState = 'today' | 'at_risk' | 'broken' | 'none';

export type ProgressSummary = {
  asOf: string;
  memberSince: string;
  level: LevelProgress;
  upcoming: LevelMilestone[];
  /** Son 30 günde defterde kazanılan XP; tempo tahmini bundan. null → defter okunamadı. */
  xpLast30: number | null;
  daysToNextLevel: number | null;
  points: {
    balance: number;
    /** En yakın erişilemeyen ödül (katalogdan). */
    nextReward: { id: string; name: string; cost: number; remaining: number } | null;
    /** Şu an bakiyenin yettiği ödül sayısı. */
    affordableCount: number;
  };
  league: { key: string; name: string; next: { key: string; name: string; minPoints: number; remaining: number } | null } | null;
  streak: {
    state: StreakState;
    /** Gösterilecek seri (kırıldıysa 0). */
    current: number;
    longest: number;
    nextMilestone: { days: number; points: number; remaining: number } | null;
  };
  badges: { total: number; recent: BadgeChip[] };
  pendingReviews: number | null;
  /** Modül kapalıysa null (bölüm hiç çizilmez). */
  contribution:
    | (ContributionResult & { weeklyChange: number; history: number[]; window: { days: number; weeks: number } })
    | null;
  partial: PartialKey[];
};

export type KpiKey = 'reviews' | 'visits' | 'places' | 'pointsEarned' | 'xpEarned';

export type Kpi = { key: KpiKey; current: number | null; previous: number | null; change: Change };

export type ProgressTrends = {
  asOf: string;
  period: ProgressPeriod;
  unit: BucketUnit;
  fromDay: string;
  toDay: string;
  keys: string[];
  kpis: Kpi[];
  pointsSpent: number | null;
  series: {
    reviews: number[];
    visits: number[];
    pointsEarned: number[] | null;
    xpEarned: number[] | null;
  };
  /** Puan defterinin tutulmaya başladığı gün; dönem bundan önce başlıyorsa grafik eksik kalır. */
  ledgerSince: string | null;
  /** 7×24 (ISO gün 1=Pzt … 7=Paz; saat 0–23), İstanbul saati. */
  habits: { cells: Array<{ d: number; h: number; n: number }>; total: number } | null;
  experience: { positive: number; neutral: number; negative: number; pending: number; heard: number } | null;
  places: Array<{
    dealerId: string;
    name: string;
    logo: string | null;
    visits: number;
    reviews: number;
    avgRating: number | null;
    lastAt: string;
  }> | null;
  topProducts: Array<{ id: string; name: string; count: number }> | null;
  partial: PartialKey[];
};

// ── Yolculuk akışı ──

export const JOURNEY_FILTERS = ['all', 'reviews', 'badges', 'rewards', 'visits', 'milestones'] as const;
export type JourneyFilter = (typeof JOURNEY_FILTERS)[number];

export type JourneyEvent =
  | { key: string; type: 'review'; at: string; href: string | null; data: { rating: number; place: string | null; source: 'qr' | 'consumption' } }
  | { key: string; type: 'heard'; at: string; href: string | null; data: { place: string | null; source: 'qr' | 'consumption' } }
  | { key: string; type: 'badge'; at: string; href: string | null; data: { name: string; imageSrc: string | null; emoji: string | null; rarity: string; color: string | null } }
  | { key: string; type: 'reward'; at: string; href: string | null; data: { name: string } }
  | { key: string; type: 'visit'; at: string; href: string | null; data: { place: string | null; product: string | null } }
  | { key: string; type: 'quest'; at: string; href: string | null; data: { name: string } }
  | { key: string; type: 'level'; at: string; href: string | null; data: { to: number } }
  | { key: string; type: 'league'; at: string; href: string | null; data: { name: string } };

export type JourneyPage = { items: JourneyEvent[]; nextCursor: string | null };
