/**
 * İlerleme dönemleri ve kovaları — saf, Europe/Istanbul takvimi (yol haritası §4.4/10).
 *
 * Eski ekranlar günleri `toISOString()` (UTC) ile kovalıyordu: TR'de 00:00–03:00 arası
 * etkinlik önceki güne, "en aktif saat" 3 saat geriye kayıyordu (trends bulgu 4,
 * analytics bulgu 1). Burada gün/hafta/ay anahtarları İstanbul takviminden üretilir; SQL
 * tarafı aynı anahtarı `date_trunc(.., "createdAt" AT TIME ZONE 'Europe/Istanbul')` ile verir.
 */
import { addDays, dayToUTCDate, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';

export const PROGRESS_PERIODS = [7, 30, 90, 365] as const;
export type ProgressPeriod = (typeof PROGRESS_PERIODS)[number];
export const DEFAULT_PROGRESS_PERIOD: ProgressPeriod = 30;

export type BucketUnit = 'day' | 'week' | 'month';

export function parseProgressPeriod(raw: unknown): ProgressPeriod {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (PROGRESS_PERIODS as readonly number[]).includes(n) ? (n as ProgressPeriod) : DEFAULT_PROGRESS_PERIOD;
}

export function bucketUnitFor(period: ProgressPeriod): BucketUnit {
  if (period <= 30) return 'day';
  if (period <= 90) return 'week';
  return 'month';
}

export type PeriodWindow = {
  period: ProgressPeriod;
  unit: BucketUnit;
  /** İstanbul günleri, uçlar dahil. */
  fromDay: string;
  toDay: string;
  /** Yarı açık `[from, to)` anları. */
  from: Date;
  to: Date;
  /** Önceki eşit uzunluktaki dönem. */
  prevFrom: Date;
  prevTo: Date;
  /** Kova anahtarları (eski → yeni). */
  keys: string[];
};

function weekStart(day: string): string {
  const dow = dayToUTCDate(day).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Anın kova anahtarı (SQL `to_char(date_trunc(unit, ts AT TIME ZONE tz), 'YYYY-MM-DD')` ile aynı). */
export function bucketKey(at: Date | string, unit: BucketUnit): string {
  const day = istanbulDay(typeof at === 'string' ? new Date(at) : at);
  if (unit === 'day') return day;
  if (unit === 'week') return weekStart(day);
  return monthStart(day);
}

function nextMonth(key: string): string {
  const d = dayToUTCDate(key);
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function periodWindow(period: ProgressPeriod, now: Date = new Date()): PeriodWindow {
  const unit = bucketUnitFor(period);
  const toDay = istanbulDay(now);
  const fromDay = addDays(toDay, -(period - 1));
  const from = istanbulDayStart(fromDay);
  const to = istanbulDayStart(addDays(toDay, 1));
  const prevFrom = istanbulDayStart(addDays(fromDay, -period));
  const keys: string[] = [];
  let k = bucketKey(from, unit);
  const last = bucketKey(new Date(to.getTime() - 1), unit);
  for (let guard = 0; guard < 400 && k <= last; guard++) {
    keys.push(k);
    k = unit === 'day' ? addDays(k, 1) : unit === 'week' ? addDays(k, 7) : nextMonth(k);
  }
  return { period, unit, fromDay, toDay, from, to, prevFrom, prevTo: from, keys };
}

/** Kova→değer haritasını tam seriye çevirir (boş kovalar 0). */
export function fillSeries(keys: readonly string[], rows: ReadonlyArray<{ k: string; n: number }>): number[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.k, (map.get(r.k) ?? 0) + (Number(r.n) || 0));
  return keys.map((k) => map.get(k) ?? 0);
}

export type Change =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'pct'; value: number };

/**
 * Önceki döneme göre değişim. Eski uçlar 0→N için "+100" üretip istemcide "++100%" ve NaN yön
 * gösteriyordu (trends bulgu 3). Burada önceki 0 ise yüzde YOK: `new` (ilk kez) ya da `none`.
 */
export function changeOf(current: number, previous: number): Change {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p <= 0) return c > 0 ? { kind: 'new' } : { kind: 'none' };
  return { kind: 'pct', value: Math.round(((c - p) / p) * 1000) / 10 };
}
