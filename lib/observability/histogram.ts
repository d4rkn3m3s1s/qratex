/**
 * Sabit kovalı histogram yardımcıları (saf; Redis/Prisma bağımlılığı yok).
 *
 * Kova i, (edges[i-1], edges[i]] aralığıdır; son kova (edges.length) taşma kovasıdır.
 * Eşik değerleri kova sınırlarına denk getirildiği için "iyi / geliştirilmeli / zayıf"
 * sayıları yaklaşık değil, kesindir. Yüzdelik (p75/p95) ise kova içinde doğrusal
 * aradeğerlemeyle hesaplanır ve bu yüzden "yaklaşık" olarak sunulur.
 */

export function bucketIndex(edges: readonly number[], value: number): number {
  for (let i = 0; i < edges.length; i++) if (value <= edges[i]) return i;
  return edges.length;
}

export function totalCount(counts: readonly number[]): number {
  let n = 0;
  for (const c of counts) n += Number.isFinite(c) && c > 0 ? c : 0;
  return n;
}

export type Quantile = {
  /** Tahmini değer; örnek yoksa null. */
  value: number | null;
  /** true → değer taşma kovasında; gerçek değer `value`'dan büyük ya da eşit. */
  atLeast: boolean;
};

/** Histogramdan yüzdelik (q ∈ (0,1]) tahmini. */
export function quantileFromHistogram(edges: readonly number[], counts: readonly number[], q: number): Quantile {
  const n = totalCount(counts);
  if (n === 0) return { value: null, atLeast: false };
  const target = Math.max(1e-9, Math.min(1, q)) * n;
  let cum = 0;
  for (let i = 0; i <= edges.length; i++) {
    const c = Math.max(0, counts[i] ?? 0);
    if (c === 0) continue;
    if (cum + c >= target) {
      if (i === edges.length) return { value: edges[edges.length - 1] ?? 0, atLeast: true };
      const lo = i === 0 ? 0 : edges[i - 1];
      const hi = edges[i];
      const frac = (target - cum) / c;
      return { value: lo + (hi - lo) * frac, atLeast: false };
    }
    cum += c;
  }
  return { value: edges[edges.length - 1] ?? 0, atLeast: true };
}

/** `good` ve `poor` eşikleri kova sınırı olmalı (≤ good iyi, > poor zayıf). */
export function ratingSplit(
  edges: readonly number[],
  counts: readonly number[],
  good: number,
  poor: number
): { good: number; needsImprovement: number; poor: number } {
  let g = 0;
  let p = 0;
  let ni = 0;
  for (let i = 0; i <= edges.length; i++) {
    const c = Math.max(0, counts[i] ?? 0);
    const upper = i < edges.length ? edges[i] : Number.POSITIVE_INFINITY;
    const lower = i === 0 ? Number.NEGATIVE_INFINITY : edges[i - 1];
    if (upper <= good) g += c;
    else if (lower >= poor) p += c;
    else ni += c;
  }
  return { good: g, needsImprovement: ni, poor: p };
}

export function addInto(target: number[], source: readonly number[]): number[] {
  for (let i = 0; i < source.length; i++) target[i] = (target[i] ?? 0) + (Number.isFinite(source[i]) ? source[i] : 0);
  return target;
}

/** Panel/API yollarındaki kimlikleri `:id` ile maskeler (kardinalite + gizlilik). */
export function normalizePath(raw: string, maxLen = 120): string {
  let p = String(raw || '').split('?')[0].split('#')[0].trim();
  if (!p.startsWith('/')) p = `/${p}`;
  const segs = p
    .split('/')
    .filter(Boolean)
    .slice(0, 8)
    .map((s) => {
      if (/^\d+$/.test(s)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return ':id';
      if (/^c[a-z0-9]{20,}$/i.test(s)) return ':id';
      if (/^[A-Za-z0-9_-]{20,}$/.test(s) && /\d/.test(s)) return ':id';
      if (/^[0-9a-f]{16,}$/i.test(s)) return ':id';
      return s.replace(/[|\s]/g, '').slice(0, 40);
    });
  const out = `/${segs.join('/')}`;
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}
