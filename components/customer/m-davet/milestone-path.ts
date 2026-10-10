/**
 * Kademe yolu: duraklar eşit aralıklı sütunların ortasında (3 → 5 → 10 → 25); dolum iki durak
 * arasında doğrusal ilerler, son duraktan sonra sona kadar dolar.
 * Durum yalnız renkle değil, ikon + metinle de anlatılır.
 */
export function fillPercent(completed: number, counts: number[]): number {
  if (counts.length === 0) return 0;
  const step = 100 / counts.length;
  let prevCount = 0;
  let prevPos = 0;
  for (let i = 0; i < counts.length; i++) {
    const target = counts[i]!;
    const pos = (i + 0.5) * step;
    if (completed < target) {
      const span = target - prevCount;
      const done = Math.max(0, completed - prevCount);
      return prevPos + (span > 0 ? (done / span) * (pos - prevPos) : 0);
    }
    prevCount = target;
    prevPos = pos;
  }
  return 100;
}
