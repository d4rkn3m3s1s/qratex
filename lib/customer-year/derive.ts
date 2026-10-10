/**
 * Yılım — saf türetme kuralları (sayıyı kod hesaplar). Prisma yok; jest ile doğrudan test edilir.
 */
import type { RhythmKey } from './contract';
import { weekdayOfDayKey, type YearPeriod } from './period';

/** Aktif gün satırı: İstanbul takvim günü + o günkü saat dilimi dağılımı. */
export type ActivityDayRow = {
  day: string; // YYYY-MM-DD (İstanbul)
  n: number;
  morning: number; // 05:00–11:59
  noon: number; // 12:00–16:59
  evening: number; // 17:00–21:59
  night: number; // 22:00–04:59
};

function dayIndex(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Ardışık takvim günlerinden oluşan en uzun seri. Girdi sırasız ve tekrarlı olabilir. */
export function longestDayStreak(dayKeys: readonly string[]): number {
  const idx = Array.from(new Set(dayKeys.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).map(dayIndex))).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < idx.length; i++) {
    run = i > 0 && idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** 1..5 dağılımından en çok verilen yıldız; eşitlikte YÜKSEK olan. Hiç puan yoksa null. */
export function mostGivenRating(distribution: readonly number[]): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (let i = 0; i < 5; i++) {
    const c = distribution[i] ?? 0;
    if (c > 0 && c >= bestCount) {
      best = i + 1;
      bestCount = c;
    }
  }
  return best;
}

/** Yanıt oranı (%): yanıt gelen YORUM / toplam yorum. Birimler aynı (denetim bulgu 1). */
export function replyRate(replied: number, total: number): number | null {
  if (!(total > 0)) return null;
  const r = Math.round((Math.max(0, Math.min(replied, total)) / total) * 100);
  return Math.max(0, Math.min(100, r));
}

/** Etkinlik kovaları: yıl → 12 ay, ay → takvim günleri. */
export function bucketize(rows: readonly ActivityDayRow[], period: YearPeriod, daysInMonth: number): number[] {
  if (period.month == null) {
    const out = new Array<number>(12).fill(0);
    for (const r of rows) {
      const [y, m] = r.day.split('-').map(Number);
      if (y === period.year && m >= 1 && m <= 12) out[m - 1] += r.n;
    }
    return out;
  }
  const out = new Array<number>(daysInMonth).fill(0);
  for (const r of rows) {
    const [y, m, d] = r.day.split('-').map(Number);
    if (y === period.year && m === period.month && d >= 1 && d <= daysInMonth) out[d - 1] += r.n;
  }
  return out;
}

export type RhythmSummary = {
  counts: Record<RhythmKey, number>;
  peak: RhythmKey | null;
  peakShare: number | null;
  peakWeekday: number | null;
};

/** Gün dilimi ve hafta günü ritmi. Eşitlikte sabit sıra (sabah → gece) kazanır. */
export function rhythmOf(rows: readonly ActivityDayRow[]): RhythmSummary {
  const counts: Record<RhythmKey, number> = { morning: 0, noon: 0, evening: 0, night: 0 };
  const weekday = new Array<number>(7).fill(0);
  for (const r of rows) {
    counts.morning += r.morning;
    counts.noon += r.noon;
    counts.evening += r.evening;
    counts.night += r.night;
    weekday[weekdayOfDayKey(r.day)] += r.n;
  }
  const total = counts.morning + counts.noon + counts.evening + counts.night;
  if (total === 0) return { counts, peak: null, peakShare: null, peakWeekday: null };
  let peak: RhythmKey = 'morning';
  for (const k of ['noon', 'evening', 'night'] as const) if (counts[k] > counts[peak]) peak = k;
  let wd = 0;
  for (let i = 1; i < 7; i++) if (weekday[i] > weekday[wd]) wd = i;
  return { counts, peak, peakShare: Math.round((counts[peak] / total) * 100), peakWeekday: weekday[wd] > 0 ? wd : null };
}

/** Yanıt alıntısı: boşlukları sadeleştirir, kelime sınırında keser. */
export function trimQuote(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** Hiçbir gerçek etkinlik yoksa hikâye yerine dürüst boş durum gösterilir. */
export function hasAnyActivity(s: {
  visits: number;
  reviews: number;
  badges: number;
  leagueUps: number;
  levelUps: number;
  battles: number;
}): boolean {
  return s.visits + s.reviews + s.badges + s.leagueUps + s.levelUps + s.battles > 0;
}
