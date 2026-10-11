/** Europe/Istanbul gün ve hafta kovaları (saf). */
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

/** İstanbul takvim günü, `YYYY-MM-DD`. */
export function istanbulDay(d: Date): string {
  return DAY_FMT.format(d);
}

/** O günün ait olduğu haftanın Pazartesi'si (İstanbul), `YYYY-MM-DD`. */
export function istanbulWeekStart(d: Date): string {
  const day = istanbulDay(d);
  const [y, m, dd] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, dd));
  const dow = (utc.getUTCDay() + 6) % 7; // Pazartesi = 0
  utc.setUTCDate(utc.getUTCDate() - dow);
  return utc.toISOString().slice(0, 10);
}

/** `count` adet ardışık hafta başlangıcı (eski → yeni), son eleman `now`'ın haftası. */
export function lastWeekStarts(now: Date, count: number): string[] {
  const last = istanbulWeekStart(now);
  const [y, m, d] = last.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(Date.UTC(y, m - 1, d - i * 7));
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

/** `count` adet ardışık İstanbul günü (eski → yeni). */
export function lastDays(now: Date, count: number): string[] {
  const last = istanbulDay(now);
  const [y, m, d] = last.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  return out;
}
