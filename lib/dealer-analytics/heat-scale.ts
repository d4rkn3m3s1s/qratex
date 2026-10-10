/**
 * Isı haritası renk ölçeği — saf (jest'li).
 *
 * Rapor heatmap Bulgu 17: doğrusal kovalar tek aykırı hücrede tüm ızgarayı soluklaştırıyordu ve
 * lejantta sayı yoktu. Burada karekök ölçek (düşük değerler de ayırt edilir) + 4 kademe; her
 * kademenin sayısal eşiği lejantta yazılır. Puan metriğinde ıraksak ölçek: genel ortalamanın
 * altı → tehlike, üstü → başarı; az örneklemli hücre "güvenilir değil" işaretlenir.
 */

export const HEAT_LEVELS = 4;

/** 0 = boş, 1..4 = kademe. */
export function heatLevel(value: number | null, max: number): number {
  if (value == null || !(value > 0) || !(max > 0)) return 0;
  const r = Math.sqrt(Math.min(1, value / max));
  return Math.max(1, Math.min(HEAT_LEVELS, Math.ceil(r * HEAT_LEVELS - 1e-9)));
}

/** Kademe aralıkları (lejant): [alt, üst] (uçlar dahil, tamsayı metriklerde yuvarlanır). */
export function heatThresholds(max: number, integer = true): Array<{ level: number; from: number; to: number }> {
  if (!(max > 0)) return [];
  const out: Array<{ level: number; from: number; to: number }> = [];
  let prevTo = 0;
  for (let k = 1; k <= HEAT_LEVELS; k++) {
    const upper = max * (k / HEAT_LEVELS) ** 2;
    const to = integer ? Math.floor(upper + 1e-9) : Math.round(upper);
    const from = integer ? prevTo + 1 : prevTo;
    if (to >= from) out.push({ level: k, from, to: k === HEAT_LEVELS ? (integer ? Math.round(max) : max) : to });
    prevTo = Math.max(prevTo, to);
  }
  return out;
}

/** Kademe → dolgu saydamlığı (marka tonu). */
export const LEVEL_ALPHA = [0, 0.18, 0.38, 0.62, 0.9] as const;

/** Puan hücresi rengi: genel ortalamadan sapma (±1★ tam doygunluk). */
export function ratingTone(avg: number | null, baseline: number | null): { tone: 'danger' | 'success' | 'neutral'; alpha: number } {
  if (avg == null || baseline == null) return { tone: 'neutral', alpha: 0 };
  const d = avg - baseline;
  const alpha = Math.min(0.9, 0.18 + Math.abs(d) * 0.72);
  if (Math.abs(d) < 0.1) return { tone: 'neutral', alpha: 0.25 };
  return { tone: d < 0 ? 'danger' : 'success', alpha };
}
