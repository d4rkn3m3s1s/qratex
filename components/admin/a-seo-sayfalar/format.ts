const abs = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

/** "12 Eki 2026 14:05" (İstanbul saati). */
export const fmtAbs = (iso: string | null | undefined) => (iso ? abs.format(new Date(iso)) : '—');

/** "3 gün önce" — 30 günden eskiyse mutlak tarih. */
export function relTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const a = Math.abs(diff);
  if (a < 45) return 'az önce';
  if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (a < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (a < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), 'day');
  return fmtAbs(iso);
}
