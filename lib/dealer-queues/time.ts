/**
 * Gelen Kutusu kuyrukları — zaman yardımcıları (saf, Europe/Istanbul).
 *
 * Türkiye 2016'dan beri kalıcı UTC+3'tür (yaz saati yok). Gün/ay sınırları bu sabit
 * ofsetle hesaplanır; görüntüleme tarafı ayrıca `Intl` ile `Europe/Istanbul` biçimler.
 */

export const ISTANBUL_TZ = 'Europe/Istanbul';
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** İstanbul gününün başlangıcı (UTC anı). */
export function istanbulDayStart(at: Date): Date {
  const local = at.getTime() + OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - OFFSET_MS);
}

/** İstanbul ayının ilk günü 00:00 (UTC anı). */
export function istanbulMonthStart(at: Date): Date {
  const local = new Date(at.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS);
}

/** İstanbul haftasının pazartesi 00:00'ı (UTC anı). */
export function istanbulWeekStart(at: Date): Date {
  const dayStart = istanbulDayStart(at);
  const local = new Date(dayStart.getTime() + OFFSET_MS);
  const weekday = (local.getUTCDay() + 6) % 7; // pazartesi = 0
  return new Date(dayStart.getTime() - weekday * DAY_MS);
}

/**
 * `YYYY-MM-DD` (İstanbul takvim günü) → o günün 23:59:59.999'u (UTC anı).
 * Son tarih alanları tarih seçiciden gün olarak gelir; "o günün sonuna kadar" anlamına gelir.
 * Geçersiz girdide `null`.
 */
export function istanbulEndOfDay(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const startUtc = Date.UTC(y, mo - 1, d) - OFFSET_MS;
  const check = new Date(startUtc + OFFSET_MS);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(startUtc + DAY_MS - 1);
}

/** UTC anı → İstanbul takvim günü `YYYY-MM-DD` (tarih seçicinin değeri). */
export function istanbulYmd(at: Date | string): string {
  const t = new Date(typeof at === 'string' ? at : at.getTime());
  const local = new Date(t.getTime() + OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const HOUR_MS = 60 * 60 * 1000;
export { DAY_MS };
