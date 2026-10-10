/**
 * "En iyiler" sıralaması — saf mantık (Jest ile test edilir).
 *
 * Eski kategori liderliği ham ortalamaya göre sıralıyordu (3 yorumla 5,00 alan, 300 yorumla
 * 4,93 alanın önünde) ve eşitlikte sıra belirsizdi. Burada:
 *  - Bayes ortalaması (IMDb): skor = (n·R + m·C) / (n + m); C = aday kümesinin ağırlıklı
 *    ortalaması (yoksa 4), m = BAYES_PRIOR_WEIGHT.
 *  - Girdi "güvenilir oy"dur: kişi başı tek oy (son puanı), anonim/işaretli/fraud/gölge-ban
 *    yorumlar sayılmaz (bkz. ratings.server.ts). Eşik: en az RANKING_MIN_REVIEWERS farklı kişi.
 *  - Eşitlik: n DESC, sonra dealerId ASC (kararlı). Aynı skora aynı sıra (yoğun sıralama).
 */

export const RANKING_MIN_REVIEWERS = 3;
export const BAYES_PRIOR_WEIGHT = 5;
export const DEFAULT_PRIOR = 4;

export interface RatingAggregate {
  dealerId: string;
  /** Farklı güvenilir değerlendirici sayısı. */
  n: number;
  /** Ortalama puan (1–5). */
  avg: number;
}

export interface RankedDealer extends RatingAggregate {
  score: number;
  rank: number;
}

/** Ağırlıklı ortalama (önsel C). Boş kümede DEFAULT_PRIOR. */
export function priorMean(rows: readonly RatingAggregate[]): number {
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    if (!(r.n > 0) || !Number.isFinite(r.avg)) continue;
    sum += r.avg * r.n;
    count += r.n;
  }
  return count > 0 ? sum / count : DEFAULT_PRIOR;
}

export function bayesScore(avg: number, n: number, prior: number, m: number = BAYES_PRIOR_WEIGHT): number {
  if (!(n > 0) || !Number.isFinite(avg)) return prior;
  return (n * avg + m * prior) / (n + m);
}

/**
 * Eşiği geçenleri Bayes skoruyla sıralar. Skorlar 3 ondalığa yuvarlanarak karşılaştırılır
 * (kayan nokta gürültüsü sırayı değiştirmesin); eşit skorlar aynı sırayı paylaşır.
 */
export function rankDealers(
  rows: readonly RatingAggregate[],
  opts: { minReviewers?: number; prior?: number; m?: number } = {},
): RankedDealer[] {
  const min = opts.minReviewers ?? RANKING_MIN_REVIEWERS;
  const eligible = rows.filter((r) => r.n >= min && Number.isFinite(r.avg));
  const prior = opts.prior ?? priorMean(eligible);
  const scored = eligible.map((r) => ({
    ...r,
    score: Math.round(bayesScore(r.avg, r.n, prior, opts.m) * 1000) / 1000,
  }));
  scored.sort((a, b) => b.score - a.score || b.n - a.n || (a.dealerId < b.dealerId ? -1 : a.dealerId > b.dealerId ? 1 : 0));
  let rank = 0;
  let previous: number | null = null;
  return scored.map((r) => {
    if (previous === null || r.score !== previous) {
      rank += 1;
      previous = r.score;
    }
    return { ...r, rank };
  });
}

/** Kartta gösterilecek puan: eşik altındaysa `null` ("Yeni" etiketi). */
export function displayRating(agg: { n: number; avg: number } | null | undefined): { avg: number; n: number } | null {
  if (!agg || agg.n < RANKING_MIN_REVIEWERS || !Number.isFinite(agg.avg)) return null;
  return { avg: Math.round(agg.avg * 10) / 10, n: agg.n };
}
