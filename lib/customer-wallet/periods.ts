/**
 * Harcama özeti dönemleri — Europe/Istanbul takvimine göre (yol haritası §4.4/10).
 * Saf modül: sunucu SQL kovası (`date_trunc(..., createdAt AT TIME ZONE 'Europe/Istanbul')`)
 * ile istemci etiketleri aynı anahtarları (`YYYY-MM-DD`, kovanın ilk günü) kullanır.
 */
import { addDays, dayToUTCDate, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';

export const SUMMARY_RANGES = ['month', 'quarter', 'year', 'all'] as const;
export type SummaryRange = (typeof SUMMARY_RANGES)[number];
export type SummaryBucket = 'day' | 'week' | 'month';

export function isSummaryRange(v: unknown): v is SummaryRange {
  return typeof v === 'string' && (SUMMARY_RANGES as readonly string[]).includes(v);
}

export type ResolvedPeriod = {
  range: SummaryRange;
  /** Dahil başlangıç anı (null = tüm zamanlar). */
  from: Date | null;
  /** Hariç bitiş anı (şimdi). */
  to: Date;
  /** Karşılaştırma: önceki dönemin AYNI uzunluktaki dilimi (ay başından bugüne ↔ geçen ay başından aynı güne). */
  compare: { from: Date; to: Date } | null;
  bucket: SummaryBucket;
};

/** Takvim ayı ekle (gün = 1). `YYYY-MM-01` döner. */
export function addMonthsToMonthStart(day: string, months: number): string {
  const d = dayToUTCDate(day);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function monthStartOf(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Pazartesi başlangıçlı hafta (Postgres `date_trunc('week')` ile aynı). */
export function weekStartOf(day: string): string {
  const d = dayToUTCDate(day);
  const dow = d.getUTCDay(); // 0 = Pazar
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(day, -back);
}

export function resolveSummaryPeriod(range: SummaryRange, now: Date = new Date()): ResolvedPeriod {
  const today = istanbulDay(now);
  const elapsed = (from: Date) => now.getTime() - from.getTime();
  switch (range) {
    case 'month': {
      const startDay = monthStartOf(today);
      const from = istanbulDayStart(startDay);
      const prevFrom = istanbulDayStart(addMonthsToMonthStart(startDay, -1));
      const prevTo = new Date(Math.min(prevFrom.getTime() + elapsed(from), from.getTime()));
      return { range, from, to: now, compare: { from: prevFrom, to: prevTo }, bucket: 'day' };
    }
    case 'quarter': {
      const startDay = addMonthsToMonthStart(monthStartOf(today), -2);
      const from = istanbulDayStart(startDay);
      const prevFrom = istanbulDayStart(addMonthsToMonthStart(startDay, -3));
      const prevTo = new Date(Math.min(prevFrom.getTime() + elapsed(from), from.getTime()));
      return { range, from, to: now, compare: { from: prevFrom, to: prevTo }, bucket: 'week' };
    }
    case 'year': {
      const startDay = `${today.slice(0, 4)}-01-01`;
      const from = istanbulDayStart(startDay);
      const prevFrom = istanbulDayStart(`${Number(today.slice(0, 4)) - 1}-01-01`);
      const prevTo = new Date(Math.min(prevFrom.getTime() + elapsed(from), from.getTime()));
      return { range, from, to: now, compare: { from: prevFrom, to: prevTo }, bucket: 'month' };
    }
    case 'all':
    default:
      return { range: 'all', from: null, to: now, compare: null, bucket: 'month' };
  }
}

/** Tüm zamanlar serisinde en fazla bu kadar ay gösterilir (en yenileri). */
export const ALL_TIME_MAX_MONTHS = 36;

/**
 * Kova anahtarları (eski → yeni), sıfır kovalar dahil. `firstDay` yalnız `all` için
 * (ilk ziyaretin günü); yoksa yalnız bu ay.
 */
export function bucketKeys(period: ResolvedPeriod, firstDay?: string | null): string[] {
  const today = istanbulDay(period.to);
  const keys: string[] = [];
  if (period.bucket === 'day') {
    const start = istanbulDay(period.from ?? period.to);
    for (let d = start; d <= today; d = addDays(d, 1)) keys.push(d);
    return keys;
  }
  if (period.bucket === 'week') {
    const start = weekStartOf(istanbulDay(period.from ?? period.to));
    const last = weekStartOf(today);
    for (let d = start; d <= last; d = addDays(d, 7)) keys.push(d);
    return keys;
  }
  const lastMonth = monthStartOf(today);
  let start = period.from ? monthStartOf(istanbulDay(period.from)) : monthStartOf(firstDay ?? today);
  const floor = addMonthsToMonthStart(lastMonth, -(ALL_TIME_MAX_MONTHS - 1));
  if (start < floor) start = floor;
  for (let d = start; d <= lastMonth; d = addMonthsToMonthStart(d, 1)) keys.push(d);
  return keys;
}

/** İstanbul ayının başlangıç anı (bu ay). */
export function istanbulMonthStart(now: Date = new Date()): Date {
  return istanbulDayStart(monthStartOf(istanbulDay(now)));
}
