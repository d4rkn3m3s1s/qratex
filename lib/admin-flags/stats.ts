/**
 * Deney istatistikleri — saf fonksiyonlar (sunucu hesaplar, arayüz yalnız gösterir).
 *  - Wilson skor aralığı (oran için %95 GA; küçük örneklemde Wald'dan güvenilir)
 *  - İki oran z-testi (birleşik varyans) → çift yönlü p
 *  - Fark için Newcombe (Wilson tabanlı) %95 GA
 *  - SRM: beklenen paya karşı ki-kare (sd = 1) → p < 0,001 uyumsuzluk
 */

const Z95 = 1.959963984540054;

/** Standart normal CDF (Abramowitz–Stegun 7.1.26, |hata| < 1.5e-7). */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** %95 Wilson aralığı; n = 0 → null. Değerler 0–1 oran. */
export function wilson(successes: number, n: number, z = Z95): [number, number] | null {
  if (!(n > 0)) return null;
  const p = Math.min(1, Math.max(0, successes / n));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** İki oran z-testi; çift yönlü p. Örneklem yoksa veya varyans 0 ise null. */
export function twoProportionP(x1: number, n1: number, x2: number, n2: number): number | null {
  if (!(n1 > 0 && n2 > 0)) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return null;
  const z = (x2 / n2 - x1 / n1) / se;
  return Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z)))));
}

/** Newcombe yöntem 10: p2 − p1 için %95 GA (oran farkı, 0–1 ölçeğinde). */
export function newcombeDiff(x1: number, n1: number, x2: number, n2: number): [number, number] | null {
  const w1 = wilson(x1, n1);
  const w2 = wilson(x2, n2);
  if (!w1 || !w2) return null;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const d = p2 - p1;
  const lower = d - Math.sqrt((p2 - w2[0]) ** 2 + (w1[1] - p1) ** 2);
  const upper = d + Math.sqrt((w2[1] - p2) ** 2 + (p1 - w1[0]) ** 2);
  return [lower, upper];
}

/** Ki-kare (sd = 1) üst kuyruk olasılığı: P(X > x) = erfc(√(x/2)) = 2·(1 − Φ(√x)). */
export function chiSquare1P(x: number): number {
  if (!(x > 0)) return 1;
  return Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.sqrt(x)))));
}

/** Örneklem oranı uyumsuzluğu (SRM). `expectedB` 0–1. Toplam 0 → null. */
export function sampleRatioMismatch(nA: number, nB: number, expectedB: number): { chi2: number | null; pValue: number | null; mismatch: boolean } {
  const total = nA + nB;
  if (!(total > 0) || !(expectedB > 0 && expectedB < 1)) return { chi2: null, pValue: null, mismatch: false };
  const eA = total * (1 - expectedB);
  const eB = total * expectedB;
  const chi2 = (nA - eA) ** 2 / eA + (nB - eB) ** 2 / eB;
  const pValue = chiSquare1P(chi2);
  // Sektör deseni (Statsig/Optimizely): p < 0,001 ve anlamlı hacim.
  return { chi2, pValue, mismatch: total >= 100 && pValue < 0.001 };
}

export const MIN_SAMPLE_PER_VARIANT = 100;
export const MIN_CONVERSIONS_PER_VARIANT = 5;

export type CompareInput = { aExposed: number; aConverted: number; bExposed: number; bConverted: number };

/** Karar özeti: yetersiz örneklemde yorum yapılmaz (değerler yine gösterilir). */
export function compareVariants(i: CompareInput, alpha = 0.05) {
  const aRate = i.aExposed > 0 ? i.aConverted / i.aExposed : null;
  const bRate = i.bExposed > 0 ? i.bConverted / i.bExposed : null;
  const diff = aRate !== null && bRate !== null ? bRate - aRate : null;
  const diffCi = newcombeDiff(i.aConverted, i.aExposed, i.bConverted, i.bExposed);
  const pValue = twoProportionP(i.aConverted, i.aExposed, i.bConverted, i.bExposed);
  const relativeLift = aRate !== null && bRate !== null && aRate > 0 ? ((bRate - aRate) / aRate) * 100 : null;
  const enough =
    i.aExposed >= MIN_SAMPLE_PER_VARIANT &&
    i.bExposed >= MIN_SAMPLE_PER_VARIANT &&
    i.aConverted + i.bConverted >= MIN_CONVERSIONS_PER_VARIANT * 2;
  let verdict: 'insufficient' | 'not_significant' | 'b_better' | 'a_better' = 'insufficient';
  if (enough) {
    if (pValue !== null && pValue < alpha && diff !== null) verdict = diff > 0 ? 'b_better' : 'a_better';
    else verdict = 'not_significant';
  }
  return {
    diffPp: diff === null ? null : diff * 100,
    diffCi: diffCi ? ([diffCi[0] * 100, diffCi[1] * 100] as [number, number]) : null,
    relativeLift,
    pValue,
    verdict,
  };
}
