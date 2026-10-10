/**
 * Sayı ve tarih biçimleri — uygulama diline bağlı, saat dilimi Europe/Istanbul.
 * (Locale'siz `toLocaleString()` SSR/tarayıcı arasında farklı ayraç üretiyordu.)
 */
const TZ = 'Europe/Istanbul';

export function formatPoints(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

export function formatDate(iso: string | null | undefined, locale: string, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

/** "3 gün sonra", "2 saat sonra" — yalnız gelecek için (bitiş geri sayımı). */
export function formatRelativeFuture(iso: string, locale: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const hours = Math.round(diff / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(Math.max(1, hours), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

/** Bitişe 7 günden az kaldıysa aciliyet çipi gösterilir. */
export function endsSoon(iso: string | null, now: number = Date.now()): boolean {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - now;
  return diff > 0 && diff <= 7 * 86_400_000;
}
