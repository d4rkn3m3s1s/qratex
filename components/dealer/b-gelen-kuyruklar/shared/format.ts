/**
 * Biçimlendirme (Europe/Istanbul, TR/EN). Saf; hem sunucu hem istemci kullanabilir.
 */
export type QueueLocale = 'tr' | 'en';

const TZ = 'Europe/Istanbul';
const tag = (l: QueueLocale) => (l === 'en' ? 'en-GB' : 'tr-TR');

export function formatDateTime(iso: string, l: QueueLocale): string {
  return new Intl.DateTimeFormat(tag(l), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatDay(iso: string, l: QueueLocale): string {
  return new Intl.DateTimeFormat(tag(l), { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso));
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "3 saat önce", "2 gün sonra" (7 günden uzaksa tarih). */
export function formatRelative(iso: string, l: QueueLocale, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(tag(l), { numeric: 'auto' });
  if (abs < MIN) return rtf.format(0, 'minute');
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  return formatDay(iso, l);
}

/** Süre (sn) → "2 sa 15 dk" / "3 g 4 sa". */
export function formatDurationShort(seconds: number, l: QueueLocale): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const u = l === 'en' ? { d: 'd', h: 'h', m: 'min' } : { d: 'g', h: 'sa', m: 'dk' };
  if (d > 0) return h > 0 ? `${d} ${u.d} ${h} ${u.h}` : `${d} ${u.d}`;
  if (h > 0) return m > 0 ? `${h} ${u.h} ${m} ${u.m}` : `${h} ${u.h}`;
  return `${Math.max(1, m)} ${u.m}`;
}

export function formatNumber(n: number, l: QueueLocale, digits = 0): string {
  return new Intl.NumberFormat(tag(l), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

/** ISO → `YYYY-MM-DD` (İstanbul) — tarih seçicinin değeri. */
export function toIstanbulYmd(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : '';
}

/** Bugünün İstanbul günü `YYYY-MM-DD` (tarih seçicinin `min` değeri). */
export function todayIstanbulYmd(now: number = Date.now()): string {
  return toIstanbulYmd(new Date(now).toISOString());
}
