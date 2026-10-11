/** Europe/Istanbul gün anahtarı (YYYY-MM-DD) — kullanım sayaçları ve günlük seriler için. */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function istanbulDayKey(d: Date): string {
  return dayFmt.format(d);
}

/** Bugün dahil son `n` günün İstanbul gün anahtarları (eski → yeni). */
export function lastIstanbulDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(istanbulDayKey(new Date(now.getTime() - i * 86_400_000)));
  return [...new Set(out)];
}
