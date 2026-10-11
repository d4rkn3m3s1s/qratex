/**
 * Müşteri Ana Sayfa — saf hesaplar (Prisma yok; Jest ile test edilir).
 *
 * Kurallar: gün/hafta sınırları Europe/Istanbul (§4.4 ilke 10); seviye formülü
 * `lib/utils.calculateLevel` ile birebir (kredi yolu `creditPointsAndXp` aynı formülü
 * kullanır); hiçbir değer uydurulmaz — eksik veri `null`/0 olarak dürüstçe döner.
 */
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import { nextIstanbulMidnight, nextIstanbulWeekStart } from '@/components/ds/play/istanbul-time';
import type {
  HomeGoal,
  HomeGreeting,
  HomeLeague,
  HomeLeagueStep,
  HomeLevel,
  HomePendingAction,
  HomeRewardTarget,
  HomeSections,
  HomeStreak,
} from './types';

// ───────────────────────────── Bağlantılar ─────────────────────────────

/**
 * Ana sayfanın gönderdiği hedefler. Bugün var olan rotalar kullanılır; yeni bilgi
 * mimarisindeki hedefleri (`/customer/wallet/*`, `/customer/me/*`) hazır olunca
 * `lib/navigation` yönlendirmeleri (308, sorgu korunur) taşır — link asla 404 olmaz.
 */
export const HOME_LINKS = {
  scan: '/customer/scan',
  pendingReviews: '/customer/wallet/activity?hasReview=false',
  // Kutular sekmesi: `owned` varsayılanı kodlar/kuponlar ("passes") sekmesidir.
  surpriseBoxes: '/customer/wallet/owned?tab=boxes',
  /** Ödül KATALOĞU (puanla al). */
  rewards: '/customer/wallet/rewards',
  /** Alınmış, kullanılmayı bekleyen ödül KODLARI ("kodunu kasada göster"). */
  ownedRewards: '/customer/wallet/owned',
  remedy: '/customer/me/voices',
  games: '/customer/games',
  leaderboard: '/customer/leaderboard',
  profile: '/customer/me/settings',
} as const;

// ───────────────────────────── Zaman ─────────────────────────────

const HOUR_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' });

export function istanbulHour(now: Date): number {
  const h = Number(HOUR_FMT.formatToParts(now).find((p) => p.type === 'hour')?.value ?? '0');
  return Number.isFinite(h) ? h % 24 : 0;
}

export function greetingFor(now: Date): HomeGreeting {
  const h = istanbulHour(now);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

/** İstanbul gününün başlangıcı (UTC anı). */
export function istanbulTodayStart(now: Date): Date {
  return istanbulDayStart(istanbulDay(now));
}

/** Bu haftanın (İstanbul, Pazartesi 00:00) başlangıcı. */
export function istanbulWeekStart(now: Date): Date {
  const next = nextIstanbulWeekStart(now);
  return istanbulDayStart(addDays(istanbulDay(next), -7));
}

export function nextResetAt(now: Date): Date {
  return nextIstanbulMidnight(now);
}

/** `YYYY-MM-DD` gününün haftadaki sırası (Pazartesi = 0 … Pazar = 6). */
function mondayIndex(day: string): number {
  const d = new Date(`${day}T00:00:00.000Z`);
  return (d.getUTCDay() + 6) % 7;
}

/**
 * `@db.Date` sütunu için gün değeri (İstanbul gününün takvim tarihi, UTC 00:00).
 * DailySpin.day bu biçimde yazılır ve okunur.
 */
export function dayKeyToDbDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

// ───────────────────────────── Seviye ─────────────────────────────

const XP_PER_LEVEL = 1000;
const LEVEL_MULTIPLIER = 1.5;

/** `calculateLevel(xp)` ile aynı eğri; ek olarak seviye içi ilerlemeyi verir. */
export function levelFromXp(rawXp: number): HomeLevel {
  const xp = Math.max(0, Math.floor(Number(rawXp) || 0));
  let level = 1;
  let required = XP_PER_LEVEL;
  let total = 0;
  while (total + required <= xp) {
    total += required;
    level += 1;
    required = Math.floor(XP_PER_LEVEL * Math.pow(LEVEL_MULTIPLIER, level - 1));
  }
  return { level, xp, intoLevel: xp - total, levelSpan: required };
}

// ───────────────────────────── Seri ─────────────────────────────

export type StreakInput = {
  count: number;
  longest: number;
  lastDay: Date | null;
  claimedMilestones: readonly number[];
};

export function parseClaimedMilestones(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === 'number' ? Math.floor(v) : Number.NaN)).filter((v) => Number.isFinite(v));
}

export function streakSnapshot(
  input: StreakInput,
  now: Date,
  milestones: ReadonlyArray<{ days: number; points: number }>
): HomeStreak {
  const today = istanbulDay(now);
  const last = input.lastDay ? istanbulDay(input.lastDay) : null;
  const countedToday = last === today;
  const alive = countedToday || (last !== null && last === addDays(today, -1));
  const days = alive ? Math.max(0, Math.floor(input.count)) : 0;
  const first = alive && last && days > 0 ? addDays(last, -(days - 1)) : null;

  const monday = addDays(today, -mondayIndex(today));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return {
      day,
      active: !!(first && last && day >= first && day <= last),
      isToday: day === today,
      isFuture: day > today,
    };
  });

  const claimed = new Set(input.claimedMilestones);
  const next = milestones.find((m) => m.days > days && !claimed.has(m.days)) ?? null;

  return {
    days,
    longest: Math.max(Math.floor(input.longest) || 0, days),
    countedToday,
    week,
    nextMilestone: next ? { days: next.days, points: next.points, daysLeft: next.days - days } : null,
  };
}

// ───────────────────────────── Ödül hedefi ─────────────────────────────

export type RewardCandidate = {
  id: string;
  name: string;
  icon: string | null;
  cost: number;
  stock: number;
  metadata: unknown;
};

function readDate(meta: unknown, key: string): Date | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Şu an alınabilir mi (stok + geçerlilik penceresi). Bakiyeye bakmaz. */
export function isRewardAvailable(r: RewardCandidate, now: Date): boolean {
  if (!(r.stock === -1 || r.stock > 0)) return false;
  const from = readDate(r.metadata, 'validFrom');
  const until = readDate(r.metadata, 'validUntil');
  if (from && now < from) return false;
  if (until && now > until) return false;
  return Number.isFinite(r.cost) && r.cost > 0;
}

export function pickRewardTargets(
  rewards: readonly RewardCandidate[],
  points: number,
  now: Date,
  resolveImage: (r: RewardCandidate) => string | null
): { affordable: number; next: HomeRewardTarget | null; pointsToNext: number | null } {
  const available = rewards.filter((r) => isRewardAvailable(r, now));
  const affordable = available.filter((r) => r.cost <= points).length;
  const next = available.filter((r) => r.cost > points).sort((a, b) => a.cost - b.cost)[0] ?? null;
  return {
    affordable,
    next: next ? { id: next.id, name: next.name, cost: next.cost, image: resolveImage(next) } : null,
    pointsToNext: next ? next.cost - points : null,
  };
}

// ───────────────────────────── Puan defteri ─────────────────────────────

/** `points_credited` olaylarının `data.points` toplamı (bozuk/negatif satırlar sayılmaz). */
export function sumCreditedPoints(rows: ReadonlyArray<{ data: unknown }>): number {
  let sum = 0;
  for (const row of rows) {
    const d = row.data;
    if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
    const p = (d as Record<string, unknown>).points;
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) sum += Math.floor(p);
  }
  return sum;
}

// ───────────────────────────── Lig ─────────────────────────────

export type LeagueRuleLike = { key: string; name: string; minPoints: number; maxPoints: number };

/** Son kademe açık uçludur (100.000 üstü kullanıcı Başlangıç'a düşmez). */
export function leagueFor(points: number, rules: readonly LeagueRuleLike[]): { current: LeagueRuleLike; index: number } {
  const sorted = [...rules].sort((a, b) => a.minPoints - b.minPoints);
  const p = Math.max(0, points);
  let index = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (p >= sorted[i].minPoints) index = i;
  }
  return { current: sorted[index], index };
}

export function leagueSnapshot(
  points: number,
  rules: readonly LeagueRuleLike[],
  rank: { rankInLeague: number; leagueSize: number; gapToAbove: number | null }
): HomeLeague {
  const sorted = [...rules].sort((a, b) => a.minPoints - b.minPoints);
  const { current, index } = leagueFor(points, sorted);
  const nextRule = sorted[index + 1] ?? null;
  const ladder: HomeLeagueStep[] = sorted.map((r) => ({ key: r.key, name: r.name, minPoints: r.minPoints }));
  let progress = 100;
  if (nextRule) {
    const span = Math.max(1, nextRule.minPoints - current.minPoints);
    progress = Math.max(0, Math.min(100, Math.floor(((points - current.minPoints) / span) * 100)));
  }
  return {
    key: current.key,
    name: current.name,
    minPoints: current.minPoints,
    maxPoints: current.maxPoints,
    progress,
    next: nextRule ? { key: nextRule.key, name: nextRule.name, minPoints: nextRule.minPoints } : null,
    pointsToNext: nextRule ? Math.max(0, nextRule.minPoints - points) : null,
    rankInLeague: Math.max(1, rank.rankInLeague),
    leagueSize: Math.max(1, rank.leagueSize, rank.rankInLeague),
    gapToAbove: rank.gapToAbove,
    ladder,
  };
}

// ───────────────────────────── Hedefler ve bekleyenler ─────────────────────────────

export type GoalSignals = {
  streakCountedToday: boolean;
  reviewedToday: boolean;
  spinUsedToday: boolean;
  boxOpenedToday: boolean;
  playedToday: boolean;
};

/**
 * Günlük 3 hedef: seriyi koru + bir değerlendirme yap + (çark → günlük kutu → oyun;
 * açık olan ilk seçenek). Hedefler ödül vaat etmez; durumları bugünkü gerçek kayıtlardan gelir.
 */
export function buildDailyGoals(signals: GoalSignals, sections: HomeSections): HomeGoal[] {
  const goals: HomeGoal[] = [
    { id: 'streak', done: signals.streakCountedToday, href: null },
    { id: 'review', done: signals.reviewedToday, href: HOME_LINKS.scan },
  ];
  if (sections.spin) goals.push({ id: 'spin', done: signals.spinUsedToday, href: null });
  else if (sections.surpriseBoxes) goals.push({ id: 'box', done: signals.boxOpenedToday, href: HOME_LINKS.surpriseBoxes });
  else if (sections.games) goals.push({ id: 'game', done: signals.playedToday, href: HOME_LINKS.games });
  return goals.slice(0, 3);
}

export type PendingCounts = {
  reviews: number;
  boxes: number;
  rewards: number;
  remedy: number;
};

/** Sayısı > 0 olan ve bölümü açık olan bekleyen işler, önem sırasıyla. */
export function buildPendingActions(counts: PendingCounts, sections: HomeSections): HomePendingAction[] {
  const out: HomePendingAction[] = [];
  if (sections.remedy && counts.remedy > 0) out.push({ id: 'remedy', count: counts.remedy, href: HOME_LINKS.remedy });
  if (counts.reviews > 0) out.push({ id: 'reviews', count: counts.reviews, href: HOME_LINKS.pendingReviews });
  if (sections.rewards && counts.rewards > 0) out.push({ id: 'rewards', count: counts.rewards, href: HOME_LINKS.ownedRewards });
  if (sections.surpriseBoxes && counts.boxes > 0) out.push({ id: 'boxes', count: counts.boxes, href: HOME_LINKS.surpriseBoxes });
  return out;
}

// ───────────────────────────── Kozmetik ─────────────────────────────

/**
 * Profil arka planı yalnız güvenli bir https görsel URL'si ise çizilir (CSS `url()` içine
 * girer: tırnak, parantez, boşluk ve ters bölü reddedilir). Sınıf adı/önayar değerleri
 * bugün bir render tanımına sahip değil → null (dürüst: etkisi yok demek).
 */
export function safeBackgroundUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!/^https:\/\/[^\s"'()\\<>]+$/i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Günlük kutunun bugünkü anahtarları: eski kayıtlar UTC günü, yeni kayıtlar İstanbul günü taşıyabilir. */
export function dailyBoxDayKeys(now: Date): string[] {
  return Array.from(new Set([istanbulDay(now), now.toISOString().slice(0, 10)]));
}
