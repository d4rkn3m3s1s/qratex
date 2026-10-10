/**
 * Yılım (/customer/me/year) — dönem hesapları. SAF modül (Prisma/Node bağımlılığı yok);
 * sunucu, istemci ve testler aynı kuralı kullanır.
 *
 * Zaman Europe/Istanbul'dadır (yol haritası §4.4 ilke 10). Türkiye 2016'dan beri sabit
 * UTC+3 kullanır (yaz saati yok), bu yüzden dönem sınırları `Date.UTC(..., -3)` ile kesin:
 * [yıl-01-01T00:00+03:00, yıl+1-01-01T00:00+03:00). Eski kod UTC yıl başını kullanıyordu;
 * 1 Ocak 00:00–03:00 arasındaki etkinlik hiçbir yıla düşmüyordu (denetim bulgu 9).
 */
import { trDateParts } from '@/lib/cron-time';

/** Türkiye'nin UTC farkı (saat). 2016'dan beri sabit. */
export const TR_UTC_OFFSET_HOURS = 3;

/** Ocak 1 – Şubat 15 arası varsayılan dönem geçen yıldır ("yılın özeti" en çok bu aralıkta açılır). */
export const LOOKBACK_UNTIL = { month: 2, day: 15 } as const;

export type YearPeriod = {
  year: number;
  /** 1-12; `null` → bütün yıl. */
  month: number | null;
};

export type PeriodBounds = { start: Date; end: Date };

/** İstanbul saatiyle dönemin [başlangıç, bitiş) aralığı (UTC Date). */
export function periodBounds(p: YearPeriod): PeriodBounds {
  const m0 = p.month == null ? 0 : p.month - 1;
  const start = new Date(Date.UTC(p.year, m0, 1, -TR_UTC_OFFSET_HOURS));
  const end =
    p.month == null
      ? new Date(Date.UTC(p.year + 1, 0, 1, -TR_UTC_OFFSET_HOURS))
      : new Date(Date.UTC(p.year, m0 + 1, 1, -TR_UTC_OFFSET_HOURS));
  return { start, end };
}

/** Kıyas dönemi: ay → bir önceki ay, yıl → bir önceki yıl. */
export function previousPeriod(p: YearPeriod): YearPeriod {
  if (p.month == null) return { year: p.year - 1, month: null };
  return p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 };
}

/** Önbellek / URL anahtarı: `2026` ya da `2026-03`. */
export function periodKey(p: YearPeriod): string {
  return p.month == null ? String(p.year) : `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/** Dönemdeki gün sayısı (ay için takvim günü, yıl için 365/366). */
export function daysInPeriod(p: YearPeriod): number {
  const { start, end } = periodBounds(p);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Dönem bitti mi (bitiş anı geçti mi)? */
export function isPeriodClosed(p: YearPeriod, now: Date): boolean {
  return periodBounds(p).end.getTime() <= now.getTime();
}

/** Dönem şu anı içeriyor mu? */
export function isPeriodCurrent(p: YearPeriod, now: Date): boolean {
  const { start, end } = periodBounds(p);
  const t = now.getTime();
  return start.getTime() <= t && t < end.getTime();
}

/** Seçilebilir yıllar (yeniden eskiye): üyelik yılından bu yıla. */
export function availableYears(memberSince: Date, now: Date): number[] {
  const first = trDateParts(memberSince).year;
  const last = trDateParts(now).year;
  const out: number[] = [];
  for (let y = last; y >= Math.min(first, last); y--) out.push(y);
  return out;
}

/** Bir yılın seçilebilir ayları (gelecek aylar ve üyelik öncesi aylar hariç). */
export function availableMonths(year: number, memberSince: Date, now: Date): number[] {
  const nowParts = trDateParts(now);
  const member = trDateParts(memberSince);
  const out: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (year === nowParts.year && m > nowParts.month) break;
    if (year === member.year && m < member.month) continue;
    if (year < member.year || year > nowParts.year) continue;
    out.push(m);
  }
  return out;
}

/**
 * Varsayılan dönem: 1 Ocak – 15 Şubat arasında (ve kullanıcı geçen yıl zaten üyeyse)
 * geçen yıl; diğer günlerde bu yıl. Böylece 2 Ocak'ta sayfa "sıfır" açılmaz.
 */
export function defaultPeriod(now: Date, memberSince: Date): YearPeriod {
  const n = trDateParts(now);
  const memberYear = trDateParts(memberSince).year;
  const inLookback =
    n.month < LOOKBACK_UNTIL.month || (n.month === LOOKBACK_UNTIL.month && n.day <= LOOKBACK_UNTIL.day);
  if (inLookback && memberYear < n.year) return { year: n.year - 1, month: null };
  return { year: n.year, month: null };
}

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d{1,4}$/.test(v.trim())) return Number(v.trim());
  return null;
}

/**
 * URL'den gelen `year`/`month` değerini doğrular ve sınırlar. Geçersiz/gelecek/üyelik
 * öncesi bir dönem istenirse varsayılana düşer (`adjusted: true`).
 */
export function resolvePeriod(
  input: { year?: unknown; month?: unknown },
  now: Date,
  memberSince: Date
): { period: YearPeriod; adjusted: boolean } {
  const fallback = defaultPeriod(now, memberSince);
  const year = toInt(input.year);
  const monthRaw = input.month === undefined || input.month === null || input.month === '' ? null : toInt(input.month);
  const monthInvalid = input.month !== undefined && input.month !== null && input.month !== '' && monthRaw === null;

  if (year === null) {
    if (input.year !== undefined && input.year !== null && input.year !== '') return { period: fallback, adjusted: true };
    // Yalnız ay verildiyse varsayılan yılın o ayı.
    if (monthRaw !== null && availableMonths(fallback.year, memberSince, now).includes(monthRaw)) {
      return { period: { year: fallback.year, month: monthRaw }, adjusted: false };
    }
    return { period: fallback, adjusted: monthInvalid || monthRaw !== null };
  }

  const years = availableYears(memberSince, now);
  if (!years.includes(year)) return { period: fallback, adjusted: true };
  if (monthInvalid) return { period: { year, month: null }, adjusted: true };
  if (monthRaw === null) return { period: { year, month: null }, adjusted: false };
  if (!availableMonths(year, memberSince, now).includes(monthRaw)) return { period: { year, month: null }, adjusted: true };
  return { period: { year, month: monthRaw }, adjusted: false };
}

/** İstanbul takvim günü anahtarından (YYYY-MM-DD) haftanın günü (0 = Pazartesi … 6 = Pazar). */
export function weekdayOfDayKey(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Pazar
  return (js + 6) % 7;
}
