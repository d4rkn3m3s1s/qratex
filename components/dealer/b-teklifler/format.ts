/**
 * Teklifler — zaman biçimleme. Görünen saatler her zaman Europe/Istanbul'dur (bayinin
 * tarayıcı saat diliminden bağımsız).
 */
import type { OffersLocale } from './copy';

const TZ = 'Europe/Istanbul';
const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(locale: OffersLocale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: TZ, ...opts });
    cache.set(key, f);
  }
  return f;
}

/** "14:30" */
export function formatTime(iso: string, locale: OffersLocale): string {
  return fmt(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "12 Eki 14:30" */
export function formatDateTime(iso: string, locale: OffersLocale): string {
  return fmt(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "12 Eki" */
export function formatDay(iso: string, locale: OffersLocale): string {
  return fmt(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function istanbulDayKey(d: Date): string {
  return fmt('en', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Aynı gün içindeyse yalnız saat; değilse gün + saat. */
export function formatWindow(fromIso: string, toIso: string, locale: OffersLocale): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const sameDay = istanbulDayKey(from) === istanbulDayKey(to);
  const start = formatDateTime(fromIso, locale);
  const end = sameDay ? formatTime(toIso, locale) : formatDateTime(toIso, locale);
  return `${start} – ${end}`;
}

/** Kalan süre: "1 sa 20 dk", "12 dk", "<1 dk". */
export function formatDuration(ms: number, locale: OffersLocale): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  const en = locale === 'en';
  if (min < 1) return en ? '<1 min' : '<1 dk';
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  if (days > 0) return en ? `${days} d ${hours} h` : `${days} gün ${hours} sa`;
  if (hours > 0) return en ? `${hours} h ${mins} min` : `${hours} sa ${mins} dk`;
  return en ? `${mins} min` : `${mins} dk`;
}

/** "3 gün önce" / "az önce" — göreli tarih (Intl.RelativeTimeFormat). */
export function formatRelative(iso: string, locale: OffersLocale, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'tr', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60_000) return locale === 'en' ? 'just now' : 'az önce';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return formatDay(iso, locale);
}
