/**
 * UTC takvim günü aralıkları (sol → sağ: en eski … bugün).
 * Raporlarda tutarlı günlük sayımlar için kullanılır.
 */
export type UtcDayBucket = { key: string; start: Date; end: Date };

export function buildUtcCalendarDayBuckets(now: Date, numDays: number): UtcDayBucket[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const list: UtcDayBucket[] = [];
  for (let ago = numDays - 1; ago >= 0; ago--) {
    const dayRef = new Date(Date.UTC(y, m, d - ago));
    const start = new Date(
      Date.UTC(dayRef.getUTCFullYear(), dayRef.getUTCMonth(), dayRef.getUTCDate(), 0, 0, 0, 0)
    );
    const end = new Date(
      Date.UTC(dayRef.getUTCFullYear(), dayRef.getUTCMonth(), dayRef.getUTCDate(), 23, 59, 59, 999)
    );
    list.push({ key: start.toISOString().slice(0, 10), start, end });
  }
  return list;
}
