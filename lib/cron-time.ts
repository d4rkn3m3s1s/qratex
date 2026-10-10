/**
 * Cron işlerinin saat dilimi yardımcıları (denetim O8).
 *
 * Eski kod `new Date(now.toLocaleString(..., 'Europe/Istanbul'))` + `setHours(0,0,0,0)` ile
 * "TR günü"nü hesaplıyordu. Vercel'de süreç UTC olduğundan sonuç 3 saat kayıyordu:
 * pencere [TR 03:00, ertesi gün TR 02:59] oluyordu. Buradaki yardımcılar sunucunun saat
 * diliminden BAĞIMSIZ, `Intl` ile doğru hesaplar.
 */

export const TR_TIME_ZONE = 'Europe/Istanbul';

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TR_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Verilen anın TR takvim günü: `YYYY-MM-DD`. */
export function trDayKey(d: Date): string {
  // en-CA biçimi zaten YYYY-MM-DD üretir.
  return dayKeyFmt.format(d);
}

/** TR takvim günü bileşenleri (ay 1-12). */
export function trDateParts(d: Date): { year: number; month: number; day: number } {
  const [y, m, dd] = trDayKey(d).split('-').map((n) => Number(n));
  return { year: y, month: m, day: dd };
}

/** İki anın TR takvim günleri arasındaki fark (b - a, gün). */
export function trDayDiff(a: Date, b: Date): number {
  const pa = trDateParts(a);
  const pb = trDateParts(b);
  const ua = Date.UTC(pa.year, pa.month - 1, pa.day);
  const ub = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((ub - ua) / 86_400_000);
}

/**
 * Hatırlatma etiketi: görev bitişi şimdiye göre TR takviminde ne zaman?
 * 'overdue' (geçti), 'today', 'tomorrow', 'later'.
 */
export function dueRelativeLabel(dueAt: Date, now: Date): 'overdue' | 'today' | 'tomorrow' | 'later' {
  if (dueAt.getTime() < now.getTime()) return 'overdue';
  const diff = trDayDiff(now, dueAt);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return 'later';
}
