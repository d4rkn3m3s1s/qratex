/**
 * Mekân detayı — ziyaret sayımı ve ziyaret kartı (SAF).
 *
 * Eski `/customer/experiences` "ziyaret sayısı" = geri bildirim + tüketim KAYIT sayısıydı (aynı
 * ziyarette ikisi varsa iki sayılıyordu) ve "sadakat rozeti" hiçbir sisteme bağlı olmayan sabit
 * bir etiketti. Burada:
 *  - Ziyaret = İstanbul takvim gününde EN AZ BİR tüketim ya da QR geri bildirimi (gün tekil).
 *  - Ziyaret kartı: her farklı gün bir damga, 10 damgada kart dolar ve yenisi başlar.
 *  - Kademe adı yalnız ziyaret gününden türeyen nötr bir etikettir; ödül/rozet VAADİ YOKTUR
 *    (işletmeye özel gerçek ödül altyapısı yok — bkz. rapor "Uygulama (Dalga 2)").
 */
export const STAMPS_PER_CARD = 10;

export type VisitTierKey = 'first' | 'familiar' | 'regular' | 'insider';

export const VISIT_TIERS: ReadonlyArray<{ key: VisitTierKey; at: number }> = [
  { key: 'first', at: 1 },
  { key: 'familiar', at: 3 },
  { key: 'regular', at: 10 },
  { key: 'insider', at: 25 },
];

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` (Europe/Istanbul). */
export function istanbulDayKey(d: Date): string {
  return dayFormatter.format(d);
}

export type VisitSummary = {
  days: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
};

export function summarizeVisits(dates: ReadonlyArray<Date>): VisitSummary {
  const keys = new Set<string>();
  let first: Date | null = null;
  let last: Date | null = null;
  for (const d of dates) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) continue;
    keys.add(istanbulDayKey(d));
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  return { days: keys.size, firstVisitAt: first, lastVisitAt: last };
}

export type StampCardState = {
  perCard: number;
  /** Güncel karttaki dolu damga (0..perCard). Tam dolu kart, yeni ziyarete kadar dolu görünür. */
  filled: number;
  /** Tamamen dolmuş kart sayısı. */
  completedCards: number;
  /** Güncel kartın dolmasına kalan ziyaret günü. */
  toFull: number;
};

export function stampCard(days: number, perCard: number = STAMPS_PER_CARD): StampCardState {
  const n = Math.max(0, Math.floor(days));
  const filled = n === 0 ? 0 : ((n - 1) % perCard) + 1;
  return { perCard, filled, completedCards: Math.floor(n / perCard), toFull: perCard - filled };
}

export type VisitTierState = {
  current: VisitTierKey | null;
  next: VisitTierKey | null;
  nextAt: number | null;
};

export function visitTier(days: number): VisitTierState {
  const achieved = [...VISIT_TIERS].reverse().find((t) => days >= t.at) ?? null;
  const next = VISIT_TIERS.find((t) => days < t.at) ?? null;
  return { current: achieved?.key ?? null, next: next?.key ?? null, nextAt: next?.at ?? null };
}

/** Bir dizi (yanıt − oluşturma) süresinin medyanı, saat. Örneklem < `minSample` → null. */
export function medianHours(
  pairs: ReadonlyArray<{ createdAt: Date; repliedAt: Date | null }>,
  minSample = 3
): { hours: number; sample: number } | null {
  const diffs = pairs
    .filter((p) => p.repliedAt && p.repliedAt.getTime() >= p.createdAt.getTime())
    .map((p) => (p.repliedAt!.getTime() - p.createdAt.getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  if (diffs.length < minSample) return null;
  const mid = Math.floor(diffs.length / 2);
  const median = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return { hours: Math.round(median * 10) / 10, sample: diffs.length };
}
