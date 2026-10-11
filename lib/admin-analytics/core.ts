/**
 * Admin Analitik — saf hesap çekirdeği (jest'li; DB'siz).
 *
 * SQL yalnız GROUP BY toplamlarını getirir; karşılaştırma, kıyas (z), Bayes düzeltmesi,
 * sektör kırılımı ve kök neden dökümü burada, test edilebilir biçimde kurulur.
 *
 * Kapatılan rapor bulguları (admin_analytics.md):
 *  - B-1: "En iyi bayiler" artık tüm bayilerin dönem toplamından, Bayes düzeltmesiyle.
 *  - B-2: tek `Comparison` sözleşmesi; önceki dönem aynı tanımla hesaplanır.
 *  - B-9: verisi olmayan / az örneklemli bayi kıyasa girmez ("yetersiz veri" ayrı sayılır);
 *    segment ortalaması bayinin KENDİSİ hariç (leave-one-out); eşikler simetrik ve açıklanır.
 *  - B-17: kök neden "zincir" değil, konu × gün dilimi × bayi dökümü; pay = konulu olumsuzların %'si.
 * insights.md: B5 (açıklanabilir odak önerisi), B6 (0 yerine null), B7 (k-anonimlik eşiği).
 */
import { addDays, rangeLength, type DayRange } from '@/components/ds/page/date-range';
import { normalizeTopic } from '@/lib/dealer-analytics/topics';
import type { PlaceCategory } from '@/lib/places/categories';
import {
  DAY_PARTS,
  type AttentionDealer,
  type AttentionTopic,
  type BenchmarkStatus,
  type Comparison,
  type DayPart,
  type DealerRow,
  type OverviewSeriesPoint,
  type RootCauseTopic,
  type SectorFilter,
  type SectorFocus,
  type SectorRow,
} from './types';

/** Kıyasa girmek için gereken en az değerlendirme. */
export const MIN_N = 5;
/** Kıyas için gereken en az akran bayi (k-anonimlik ile aynı eşik). */
export const MIN_PEERS = 3;
/** Sektör satırı için k-anonimlik eşiği (altı "örneklem küçük"). */
export const K_MIN = 3;
/** Simetrik z eşikleri (eskiden açıklanmamış −1,2 / +1,8). */
export const Z_LOW = -1.5;
export const Z_HIGH = 1.5;
/** Bayes düzeltmesinde önsel ağırlık (sanal değerlendirme sayısı). */
export const BAYES_C = 10;
/** Sektör odak önerisi koşulları. */
export const FOCUS_MIN_N = 30;
export const FOCUS_MAX_Z = -2;

export function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = toNum(v);
  return Number.isFinite(n) ? n : null;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Tek karşılaştırma nesnesi. `previous === undefined` → karşılaştırma kapalı. */
export function comparison(current: number | null, previous: number | null | undefined, digits = 2): Comparison {
  const cur = current == null || !Number.isFinite(current) ? null : round(current, digits);
  if (previous === undefined) return { current: cur, previous: null, deltaAbs: null, deltaPct: null };
  const prev = previous == null || !Number.isFinite(previous) ? null : round(previous, digits);
  const deltaAbs = cur != null && prev != null ? round(cur - prev, digits) : null;
  const deltaPct = cur != null && prev != null && prev !== 0 ? round(((cur - prev) / Math.abs(prev)) * 100, 1) : null;
  return { current: cur, previous: prev, deltaAbs, deltaPct };
}

export function avgOf(sum: number, n: number): number | null {
  return n > 0 ? round(sum / n, 2) : null;
}

export function sharePct(part: number, total: number): number | null {
  return total > 0 ? round((part / total) * 100, 1) : null;
}

/** Aralıktaki İstanbul günleri (uçlar dahil). */
export function daysOf(range: DayRange): string[] {
  const len = rangeLength(range);
  const out: string[] = [];
  for (let i = 0; i < len; i++) out.push(addDays(range.from, i));
  return out;
}

export interface DailyRaw {
  day: string;
  n: unknown;
  rating_sum?: unknown;
  negative?: unknown;
}

export function buildSeries(input: {
  range: DayRange;
  compareRange: DayRange | null;
  reviews: readonly DailyRaw[];
  compareReviews: readonly DailyRaw[];
  newUsers: readonly DailyRaw[];
  scans: readonly DailyRaw[];
}): OverviewSeriesPoint[] {
  const days = daysOf(input.range);
  const cmpDays = input.compareRange ? daysOf(input.compareRange) : [];
  const rev = new Map(input.reviews.map((r) => [r.day, r]));
  const cmp = new Map(input.compareReviews.map((r) => [r.day, toNum(r.n)]));
  const users = new Map(input.newUsers.map((r) => [r.day, toNum(r.n)]));
  const scans = new Map(input.scans.map((r) => [r.day, toNum(r.n)]));
  return days.map((day, i) => {
    const r = rev.get(day);
    const n = r ? toNum(r.n) : 0;
    const cd = input.compareRange ? (cmpDays[i] ?? null) : null;
    return {
      day,
      reviews: n,
      avgRating: r ? avgOf(toNum(r.rating_sum), n) : null,
      newUsers: users.get(day) ?? 0,
      scans: scans.get(day) ?? 0,
      negative: r ? toNum(r.negative) : 0,
      compareDay: cd,
      compareReviews: cd ? (cmp.get(cd) ?? 0) : null,
    };
  });
}

/** ISODOW (1 = Pazartesi) × saat → 7 × 24 ızgara. */
export function buildHeatmap(rows: ReadonlyArray<{ dow: unknown; hour: unknown; n: unknown }>): { cells: number[][]; max: number; total: number } {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let max = 0;
  let total = 0;
  for (const r of rows) {
    const d = toNum(r.dow) - 1;
    const h = toNum(r.hour);
    if (d < 0 || d > 6 || h < 0 || h > 23) continue;
    const n = toNum(r.n);
    cells[d]![h] = (cells[d]![h] ?? 0) + n;
    total += n;
    if (cells[d]![h]! > max) max = cells[d]![h]!;
  }
  return { cells, max, total };
}

/** İstanbul saati → gün dilimi (Gece 00–06, Sabah 06–12, Öğleden sonra 12–17, Akşam 17–24). */
export function dayPartOf(hour: number): DayPart {
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/* ───────────────────────── Bayi kıyası ───────────────────────── */

export interface DealerAggRaw {
  dealer_id: string;
  n: unknown;
  rating_sum: unknown;
  rating_sq?: unknown;
  positive?: unknown;
  negative?: unknown;
}

export interface DealerAgg {
  n: number;
  ratingSum: number;
  ratingSq: number;
  positive: number;
  negative: number;
}

export function toAggMap(rows: readonly DealerAggRaw[]): Map<string, DealerAgg> {
  const out = new Map<string, DealerAgg>();
  for (const r of rows) {
    if (!r.dealer_id) continue;
    out.set(r.dealer_id, {
      n: toNum(r.n),
      ratingSum: toNum(r.rating_sum),
      ratingSq: toNum(r.rating_sq),
      positive: toNum(r.positive),
      negative: toNum(r.negative),
    });
  }
  return out;
}

export interface RosterDealer {
  id: string;
  name: string;
  sector: PlaceCategory | null;
}

export function bayesRating(ratingSum: number, n: number, prior: number | null, c = BAYES_C): number | null {
  if (n <= 0) return null;
  if (prior == null) return round(ratingSum / n, 2);
  return round((c * prior + ratingSum) / (c + n), 2);
}

function meanSd(values: readonly number[]): { mean: number; sd: number } {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

export interface DealerBenchmark {
  rows: DealerRow[];
  platformAvg: number | null;
  insufficient: number;
  silent: number;
}

/**
 * Bayi tablosu + kıyas. Kıyas grubu: aynı sektörde en az `MIN_PEERS` uygun akran varsa sektör,
 * yoksa platform geneli (bayinin kendisi her iki durumda da hariç).
 */
export function buildDealerBenchmark(
  roster: readonly RosterDealer[],
  current: Map<string, DealerAgg>,
  previous: Map<string, DealerAgg> | null,
): DealerBenchmark {
  let totalN = 0;
  let totalSum = 0;
  for (const a of current.values()) {
    totalN += a.n;
    totalSum += a.ratingSum;
  }
  const platformAvg = avgOf(totalSum, totalN);

  const eligible = roster
    .map((d) => ({ d, a: current.get(d.id) }))
    .filter((x): x is { d: RosterDealer; a: DealerAgg } => !!x.a && x.a.n >= MIN_N)
    .map((x) => ({ id: x.d.id, sector: x.d.sector, avg: x.a.ratingSum / x.a.n }));

  const bySector = new Map<string, typeof eligible>();
  for (const e of eligible) {
    if (!e.sector) continue;
    const list = bySector.get(e.sector) ?? [];
    list.push(e);
    bySector.set(e.sector, list);
  }

  let insufficient = 0;
  let silent = 0;
  const rows: DealerRow[] = [];
  for (const d of roster) {
    const a = current.get(d.id);
    if (!a || a.n === 0) {
      silent += 1;
      continue;
    }
    const prev = previous ? (previous.get(d.id)?.n ?? 0) : null;
    const avg = a.ratingSum / a.n;
    let status: BenchmarkStatus = 'insufficient';
    let segmentAvg: number | null = null;
    let segmentPeers = 0;
    let segmentScope: 'sector' | 'platform' = 'platform';
    let z: number | null = null;
    if (a.n < MIN_N) {
      insufficient += 1;
    } else {
      const sectorPeers = d.sector ? (bySector.get(d.sector) ?? []).filter((p) => p.id !== d.id) : [];
      const peers = sectorPeers.length >= MIN_PEERS ? sectorPeers : eligible.filter((p) => p.id !== d.id);
      segmentScope = sectorPeers.length >= MIN_PEERS ? 'sector' : 'platform';
      segmentPeers = peers.length;
      if (peers.length < MIN_PEERS) {
        status = 'no-peers';
      } else {
        const { mean, sd } = meanSd(peers.map((p) => p.avg));
        segmentAvg = round(mean, 2);
        z = sd > 0 ? round((avg - mean) / sd, 2) : 0;
        status = z <= Z_LOW ? 'low' : z >= Z_HIGH ? 'high' : 'normal';
      }
    }
    rows.push({
      id: d.id,
      name: d.name,
      sector: d.sector,
      n: a.n,
      avgRating: avgOf(a.ratingSum, a.n),
      bayesRating: bayesRating(a.ratingSum, a.n, platformAvg),
      positiveShare: sharePct(a.positive, a.n),
      negativeShare: sharePct(a.negative, a.n),
      previousN: prev,
      deltaPct: prev != null && prev > 0 ? round(((a.n - prev) / prev) * 100, 1) : null,
      segmentAvg,
      segmentPeers,
      segmentScope,
      z,
      status,
    });
  }
  rows.sort((x, y) => (y.bayesRating ?? 0) - (x.bayesRating ?? 0) || y.n - x.n || x.name.localeCompare(y.name, 'tr'));
  return { rows, platformAvg, insufficient, silent };
}

export function attentionDealers(rows: readonly DealerRow[], limit = 5): AttentionDealer[] {
  return rows
    .filter((r) => r.status === 'low' && r.z != null && r.avgRating != null && r.segmentAvg != null)
    .sort((a, b) => (a.z as number) - (b.z as number))
    .slice(0, limit)
    .map((r) => ({ id: r.id, name: r.name, sector: r.sector, avgRating: r.avgRating as number, segmentAvg: r.segmentAvg as number, z: r.z as number, n: r.n }));
}

/* ───────────────────────── Sektör kırılımı ───────────────────────── */

export function buildSectors(input: {
  roster: readonly RosterDealer[];
  current: Map<string, DealerAgg>;
  previous: Map<string, DealerAgg> | null;
  scans: Map<string, number>;
}): { rows: SectorRow[]; platformAvg: number | null; uncategorized: number; totalDealers: number; categorizedShare: number | null; focus: SectorFocus | null } {
  type Acc = { dealers: number; active: number; n: number; sum: number; sq: number; dealerAvgs: number[]; scans: number; pn: number; psum: number };
  const acc = new Map<SectorFilter, Acc>();
  let totalN = 0;
  let totalSum = 0;
  for (const d of input.roster) {
    const key: SectorFilter = d.sector ?? 'none';
    const cur = acc.get(key) ?? { dealers: 0, active: 0, n: 0, sum: 0, sq: 0, dealerAvgs: [], scans: 0, pn: 0, psum: 0 };
    cur.dealers += 1;
    const a = input.current.get(d.id);
    if (a && a.n > 0) {
      cur.active += 1;
      cur.n += a.n;
      cur.sum += a.ratingSum;
      cur.sq += a.ratingSq;
      totalN += a.n;
      totalSum += a.ratingSum;
      if (a.n >= MIN_N) cur.dealerAvgs.push(a.ratingSum / a.n);
    }
    const p = input.previous?.get(d.id);
    if (p) {
      cur.pn += p.n;
      cur.psum += p.ratingSum;
    }
    cur.scans += input.scans.get(d.id) ?? 0;
    acc.set(key, cur);
  }
  const platformAvg = avgOf(totalSum, totalN);
  const rows: SectorRow[] = [];
  for (const [sector, a] of acc) {
    const avg = a.n > 0 ? a.sum / a.n : null;
    let z: number | null = null;
    const restN = totalN - a.n;
    if (avg != null && a.n >= 2 && restN > 0) {
      const restAvg = (totalSum - a.sum) / restN;
      const variance = Math.max(0, a.sq / a.n - avg * avg);
      const se = Math.sqrt(variance / a.n);
      z = se > 0 ? round((avg - restAvg) / se, 2) : null;
    }
    const hasPrev = input.previous != null;
    const previousAvg = hasPrev ? avgOf(a.psum, a.pn) : null;
    rows.push({
      sector,
      dealerCount: a.dealers,
      activeDealers: a.active,
      n: a.n,
      avgRating: avg == null ? null : round(avg, 2),
      dealerAvgRating: a.dealerAvgs.length ? round(a.dealerAvgs.reduce((s, v) => s + v, 0) / a.dealerAvgs.length, 2) : null,
      scans: a.scans,
      previousN: hasPrev ? a.pn : null,
      previousAvg,
      deltaPct: hasPrev && a.pn > 0 ? round(((a.n - a.pn) / a.pn) * 100, 1) : null,
      deltaAvg: avg != null && previousAvg != null ? round(avg - previousAvg, 2) : null,
      z,
      lowSample: a.dealers < K_MIN,
    });
  }
  rows.sort((x, y) => {
    if (x.sector === 'none') return 1;
    if (y.sector === 'none') return -1;
    return y.n - x.n || y.dealerCount - x.dealerCount;
  });
  const totalDealers = input.roster.length;
  const uncategorized = acc.get('none')?.dealers ?? 0;
  const candidates = rows.filter(
    (r) => r.sector !== 'none' && !r.lowSample && r.n >= FOCUS_MIN_N && r.activeDealers >= MIN_PEERS && r.z != null && r.z <= FOCUS_MAX_Z && r.avgRating != null,
  );
  candidates.sort((a, b) => (a.z as number) - (b.z as number));
  const f = candidates[0];
  const focus: SectorFocus | null =
    f && platformAvg != null
      ? { sector: f.sector, avgRating: f.avgRating as number, platformAvg, n: f.n, dealers: f.activeDealers, z: f.z as number }
      : null;
  return {
    rows,
    platformAvg,
    uncategorized,
    totalDealers,
    categorizedShare: totalDealers > 0 ? round(((totalDealers - uncategorized) / totalDealers) * 100, 1) : null,
    focus,
  };
}

/* ───────────────────────── Kök neden ───────────────────────── */

export interface TopicPartRaw {
  topic: string;
  hour: unknown;
  n: unknown;
}
export interface TopicDealerRaw {
  topic: string;
  dealer_id: string;
  n: unknown;
}
export interface TopicCountRaw {
  topic: string;
  n: unknown;
}

export function buildRootCause(input: {
  parts: readonly TopicPartRaw[];
  dealers: readonly TopicDealerRaw[];
  previous: readonly TopicCountRaw[] | null;
  topicBase: number;
  names: Map<string, string>;
  limit?: number;
}): RootCauseTopic[] {
  const byKey = new Map<string, { count: number; dayParts: Record<DayPart, number>; dealers: Map<string, number> }>();
  const get = (key: string) => {
    let v = byKey.get(key);
    if (!v) {
      v = { count: 0, dayParts: { night: 0, morning: 0, afternoon: 0, evening: 0 }, dealers: new Map() };
      byKey.set(key, v);
    }
    return v;
  };
  for (const r of input.parts) {
    const norm = normalizeTopic(r.topic);
    if (!norm) continue;
    const n = toNum(r.n);
    const v = get(norm.key);
    v.count += n;
    v.dayParts[dayPartOf(toNum(r.hour))] += n;
  }
  for (const r of input.dealers) {
    const norm = normalizeTopic(r.topic);
    if (!norm || !r.dealer_id) continue;
    const v = get(norm.key);
    v.dealers.set(r.dealer_id, (v.dealers.get(r.dealer_id) ?? 0) + toNum(r.n));
  }
  const prev = new Map<string, number>();
  for (const r of input.previous ?? []) {
    const norm = normalizeTopic(r.topic);
    if (!norm) continue;
    prev.set(norm.key, (prev.get(norm.key) ?? 0) + toNum(r.n));
  }
  const out: RootCauseTopic[] = [];
  for (const [key, v] of byKey) {
    if (v.count <= 0) continue;
    const p = input.previous ? (prev.get(key) ?? 0) : null;
    const dayParts = {} as Record<DayPart, number>;
    for (const part of DAY_PARTS) dayParts[part] = v.dayParts[part];
    out.push({
      key,
      count: v.count,
      share: input.topicBase > 0 ? round((v.count / input.topicBase) * 100, 1) : 0,
      previous: p,
      deltaPct: p != null && p > 0 ? round(((v.count - p) / p) * 100, 1) : null,
      dayParts,
      dealers: [...v.dealers.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => ({ id, name: input.names.get(id) ?? '—', count })),
    });
  }
  out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return out.slice(0, input.limit ?? 12);
}

/** Yükselen olumsuz konular: önceki döneme göre artış (en az 3 kayıt). */
export function risingTopics(topics: readonly RootCauseTopic[], limit = 3): AttentionTopic[] {
  return topics
    .filter((t) => t.previous != null && t.count >= 3 && t.count > (t.previous as number))
    .sort((a, b) => b.count - (b.previous as number) - (a.count - (a.previous as number)))
    .slice(0, limit)
    .map((t) => ({ key: t.key, count: t.count, previous: t.previous, deltaPct: t.deltaPct }));
}

/**
 * Yüzdeleri en büyük kalan yöntemiyle yuvarlar: toplam her zaman 100 (toplam > 0 ise).
 * Rapor #21: yuvarlama sonrası lejant toplamı 99/101 olabiliyordu.
 */
export function percentagesLargestRemainder(values: readonly number[]): number[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) / total) * 100);
  const floors = raw.map((r) => Math.floor(r));
  let remaining = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remaining -= 1;
  }
  return floors;
}
