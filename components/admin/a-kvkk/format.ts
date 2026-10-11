/** KVKK merkezi — biçimleyiciler (tr-TR, Europe/Istanbul). Saf. */
const TZ = 'Europe/Istanbul';

const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeZone: TZ });
const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function formatPercent(v: number | null | undefined): string {
  if (v == null) return '—';
  return `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

export function formatNumber(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('tr-TR');
}

/** "3 saat önce", "dün" gibi göreli zaman. */
export function relativeFromNow(iso: string | Date, now: Date = new Date()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

/** Saklama süresini okunur yaz: 365 → "1 yıl", 180 → "180 gün". */
export function formatDays(days: number): string {
  if (days >= 365 && days % 365 === 0) return `${days / 365} yıl`;
  return `${days.toLocaleString('tr-TR')} gün`;
}
