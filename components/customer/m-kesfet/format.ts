import type { OpenState } from '@/lib/places/business-hours';
import type { Tone } from '@/components/states';
import type { PlacesCopy, PlacesLocale } from './copy';

/** Açık/kapalı durumunu metin + tona çevirir; durum yoksa `null` (rozet gösterilmez). */
export function openStateLabel(state: OpenState | null, copy: PlacesCopy): { label: string; tone: Tone } | null {
  if (!state) return null;
  if (state.status === 'holiday') return { label: copy.holiday, tone: 'warning' };
  if (state.status === 'open') {
    if (!state.closesAt) return { label: `${copy.open} · ${copy.open24}`, tone: 'success' };
    if (state.closingSoon) return { label: copy.closingSoon(state.closesAt), tone: 'warning' };
    return { label: `${copy.open} · ${copy.closesAt(state.closesAt)}`, tone: 'success' };
  }
  const n = state.nextOpen;
  if (!n) return { label: copy.closed, tone: 'neutral' };
  const when =
    n.inDays === 0 ? copy.opensToday(n.time) : n.inDays === 1 ? copy.opensTomorrow(n.time) : copy.opensOn(copy.weekdays[n.weekday] ?? '', n.time);
  return { label: `${copy.closed} · ${when}`, tone: 'neutral' };
}

export function formatMultiplierLabel(m: number, locale: PlacesLocale): string {
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 1 }).format(m)}×`;
}

export function formatRating(avg: number, locale: PlacesLocale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(avg);
}

export function formatClockIso(iso: string | null, locale: PlacesLocale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'tr-TR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

export function formatDate(iso: string | null, locale: PlacesLocale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'tr-TR', opts).format(d);
}

/** "3 gün önce" / "az önce" — göreli tarih (Intl.RelativeTimeFormat). */
export function formatRelative(iso: string | null, locale: PlacesLocale, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en-US' : 'tr-TR', { numeric: 'auto' });
  if (abs < 60) return rtf.format(0, 'minute');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month');
  return rtf.format(Math.round(diff / (86400 * 365)), 'year');
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.charAt(0) ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (a + b).toLocaleUpperCase('tr-TR') || '?';
}
