/**
 * Bayi Analitik — saf hesap çekirdeği (Prisma/React yok; jest ile test edilir).
 *
 * Rapor bulgularının "hesap" tarafı burada kapanır:
 *  - B-1 dönüşüm: pay ve payda AYNI pencere + AYNI kanal (dönem içi QR geri bildirimi / dönem
 *    içi QR tarama olayı). Tarama yoksa ya da pay paydayı aşıyorsa (takip boşluğu) değer null.
 *  - B-2 birimler: puan farkı mutlak (★), oranlar yüzde PUAN, hacim göreli %; önceki dönem 0 ise
 *    göreli değişim YOK (eskiden "+%100").
 *  - B-4 sahte içgörü: zirve saat/gün yalnız örneklem eşiğinin (10) üstünde.
 *  - #18 boş gün: ortalama puan null (grafikte boşluk), 0 değil.
 *  - B-7 / heatmap Bulgu 7: "en iyi" Bayes-düzeltilmiş puanla ve asgari örneklemle.
 */
import type { MetricValue } from '@/components/ds/data/metric-format';
import { addDays, rangeLength, type DayRange } from '@/components/ds/page/date-range';
import { mergeTopicCounts, type RawTopicCount } from './topics';
import {
  WEEKDAYS,
  type Anomaly,
  type AnalyticsChannel,
  type BestQrInsight,
  type ConversionStatus,
  type HeatCell,
  type HeatRow,
  type HeatmapInsights,
  type HeatmapMetric,
  type LocationRow,
  type OverviewKpis,
  type PeakInsight,
  type QrRow,
  type SeriesPoint,
  type TopicRow,
} from './types';

export const PEAK_MIN_N = 10;
export const RATING_MIN_N = 10;
export const NPS_MIN_N = 30;
export const BEST_QR_MIN_N = 5;
export const BAYES_PRIOR_WEIGHT = 10;
export const CELL_MIN_N = 5;
/** Kalite düşüşü sayılması için genel ortalamanın en az bu kadar altında olmalı (★). */
export const QUALITY_DIP_GAP = 0.3;
export const ANOMALY_MIN_DAYS = 14;
export const ANOMALY_MIN_TOTAL = 30;

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function toNum(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Göreli değişim (%); önceki 0 ise tanımsız (null) — "+%100" uydurulmaz. */
export function relDeltaPct(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return round(((cur - prev) / prev) * 100, 1);
}

/** Bayes ortalaması: az örneklemli kalem genel ortalamaya (m) çekilir. */
export function bayesAverage(sum: number, n: number, prior: number, weight = BAYES_PRIOR_WEIGHT): number | null {
  if (n <= 0 && weight <= 0) return null;
  if (n <= 0) return null;
  return round((weight * prior + sum) / (weight + n), 2);
}

/* ───────────────────────── Pencere toplamları → KPI ───────────────────────── */

/** Bir zaman penceresinin SQL toplamı (tek satır). */
export interface WindowAgg {
  n: number;
  ratingSum: number;
  positive: number;
  neutral: number;
  negative: number;
  pending: number;
  replied: number;
  /** Yanıtlananlarda medyan yanıt süresi (sn). */
  replyMedianSec: number | null;
  npsN: number;
  promoters: number;
  detractors: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  /** Penceredeki QR kanalı geri bildirimi (dönüşüm payı). */
  qrN: number;
}

export function emptyAgg(): WindowAgg {
  return {
    n: 0,
    ratingSum: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    pending: 0,
    replied: 0,
    replyMedianSec: null,
    npsN: 0,
    promoters: 0,
    detractors: 0,
    r1: 0,
    r2: 0,
    r3: 0,
    r4: 0,
    r5: 0,
    qrN: 0,
  };
}

/** SQL satırını (bigint/string sayılar) `WindowAgg`'e çevirir. */
export function aggFromRow(row: Record<string, unknown> | undefined | null): WindowAgg {
  if (!row) return emptyAgg();
  return {
    n: toNum(row.n),
    ratingSum: toNum(row.rating_sum),
    positive: toNum(row.positive),
    neutral: toNum(row.neutral),
    negative: toNum(row.negative),
    pending: toNum(row.pending),
    replied: toNum(row.replied),
    replyMedianSec: toNumOrNull(row.reply_median_sec),
    npsN: toNum(row.nps_n),
    promoters: toNum(row.promoters),
    detractors: toNum(row.detractors),
    r1: toNum(row.r1),
    r2: toNum(row.r2),
    r3: toNum(row.r3),
    r4: toNum(row.r4),
    r5: toNum(row.r5),
    qrN: toNum(row.qr_n),
  };
}

export function avgRatingOf(a: WindowAgg): number | null {
  return a.n > 0 ? round(a.ratingSum / a.n, 2) : null;
}

/** Olumlu payı (%): bekleyen (analizsiz) kayıtlar paydada YOK (nötrü şişirmez — B-12). */
export function positiveShareOf(a: WindowAgg): number | null {
  const base = a.n - a.pending;
  return base > 0 ? round((a.positive / base) * 100, 1) : null;
}

export function responseRateOf(a: WindowAgg): number | null {
  return a.n > 0 ? round((a.replied / a.n) * 100, 1) : null;
}

export function npsOf(a: WindowAgg): number | null {
  return a.npsN > 0 ? round(((a.promoters - a.detractors) / a.npsN) * 100, 0) : null;
}

export interface ScanCounts {
  /** Penceredeki tekilleştirilmiş QR tarama olayı; null = takip edilmiyor/sorgulanmadı. */
  current: number | null;
  compare: number | null;
}

export function conversionOf(qrN: number, scans: number | null): { value: number | null; status: ConversionStatus } {
  if (scans == null || scans <= 0) return { value: null, status: 'no_scans' };
  // Pay paydayı aşıyorsa tarama takibi o dönemde eksiktir: uydurma %140 yerine "eksik".
  if (qrN > scans) return { value: null, status: 'incomplete' };
  return { value: round((qrN / scans) * 100, 1), status: 'ok' };
}

function pointsDelta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null;
  return round(cur - prev, 1);
}

export function buildKpis(input: {
  cur: WindowAgg;
  cmp: WindowAgg | null;
  series: readonly SeriesPoint[];
  scans: ScanCounts;
  channel: AnalyticsChannel;
}): { kpis: OverviewKpis; conversionStatus: ConversionStatus } {
  const { cur, cmp, series, scans, channel } = input;
  const hasCmp = cmp != null;

  const volumeDelta = hasCmp ? relDeltaPct(cur.n, cmp!.n) : null;
  const avg = avgRatingOf(cur);
  const avgPrev = hasCmp ? avgRatingOf(cmp!) : null;
  const pos = positiveShareOf(cur);
  const posPrev = hasCmp ? positiveShareOf(cmp!) : null;
  const rr = responseRateOf(cur);
  const rrPrev = hasCmp ? responseRateOf(cmp!) : null;
  const nps = npsOf(cur);
  const npsPrev = hasCmp ? npsOf(cmp!) : null;

  let conversion: { value: number | null; status: ConversionStatus } = { value: null, status: 'not_applicable' };
  let conversionPrev: number | null = null;
  if (channel !== 'consumption') {
    conversion = conversionOf(cur.qrN, scans.current);
    if (hasCmp) conversionPrev = conversionOf(cmp!.qrN, scans.compare).value;
  }

  const replyDelta =
    hasCmp && cur.replyMedianSec != null && cmp!.replyMedianSec != null ? relDeltaPct(cur.replyMedianSec, cmp!.replyMedianSec) : null;

  const kpis: OverviewKpis = {
    volume: {
      value: cur.n,
      format: 'number',
      delta: volumeDelta == null ? null : { value: volumeDelta, kind: 'percent', goodDirection: 'up' },
      series: series.map((p) => p.count),
    },
    avgRating: {
      value: avg,
      format: 'number',
      fractionDigits: 1,
      unit: '/ 5',
      n: cur.n,
      minN: RATING_MIN_N,
      delta: pointsDelta(avg, avgPrev) == null ? null : { value: round(avg! - avgPrev!, 2), kind: 'absolute', goodDirection: 'up' },
      series: series.map((p) => p.avgRating),
    },
    positiveShare: {
      value: pos,
      format: 'percent',
      n: cur.n - cur.pending,
      minN: RATING_MIN_N,
      delta: pointsDelta(pos, posPrev) == null ? null : { value: pointsDelta(pos, posPrev)!, kind: 'points', goodDirection: 'up' },
    },
    responseRate: {
      value: rr,
      format: 'percent',
      n: cur.n,
      delta: pointsDelta(rr, rrPrev) == null ? null : { value: pointsDelta(rr, rrPrev)!, kind: 'points', goodDirection: 'up' },
    },
    medianReply: {
      value: cur.replyMedianSec == null ? null : Math.round(cur.replyMedianSec),
      format: 'duration',
      durationUnit: 's',
      n: cur.replied,
      delta: replyDelta == null ? null : { value: replyDelta, kind: 'percent', goodDirection: 'down' },
    },
    conversion: {
      value: conversion.value,
      format: 'percent',
      n: scans.current ?? null,
      delta:
        conversion.value != null && conversionPrev != null
          ? { value: round(conversion.value - conversionPrev, 1), kind: 'points', goodDirection: 'up' }
          : null,
    },
    nps: {
      value: nps,
      format: 'number',
      n: cur.npsN,
      minN: NPS_MIN_N,
      delta: nps != null && npsPrev != null ? { value: nps - npsPrev, kind: 'absolute', goodDirection: 'up' } : null,
    },
  };
  return { kpis, conversionStatus: conversion.status };
}

/* ───────────────────────── Günlük seri ───────────────────────── */

export interface DayRowRaw {
  day: string;
  n: unknown;
  rating_sum: unknown;
  positive: unknown;
  neutral: unknown;
  negative: unknown;
  pending: unknown;
}

/** Dönemin her günü için satır (kaydı olmayan gün 0 adet + null puan). */
export function fillSeries(
  range: DayRange,
  compareRange: DayRange | null,
  rows: readonly DayRowRaw[],
  compareRows: readonly { day: string; n: unknown }[] | null,
): SeriesPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const cmpByDay = new Map((compareRows ?? []).map((r) => [r.day, toNum(r.n)]));
  const len = Math.max(0, rangeLength(range));
  const cmpLen = compareRange ? rangeLength(compareRange) : 0;
  const out: SeriesPoint[] = [];
  for (let i = 0; i < len; i++) {
    const day = addDays(range.from, i);
    const r = byDay.get(day);
    const n = r ? toNum(r.n) : 0;
    const compareDay = compareRange && i < cmpLen ? addDays(compareRange.from, i) : null;
    out.push({
      day,
      count: n,
      avgRating: n > 0 ? round(toNum(r!.rating_sum) / n, 2) : null,
      positive: r ? toNum(r.positive) : 0,
      neutral: r ? toNum(r.neutral) : 0,
      negative: r ? toNum(r.negative) : 0,
      pending: r ? toNum(r.pending) : 0,
      compareDay,
      compareCount: compareDay ? cmpByDay.get(compareDay) ?? 0 : null,
    });
  }
  return out;
}

/* ───────────────────────── Zirve (saat / gün) ───────────────────────── */

export interface DowHourRaw {
  /** ISO gün 1 (Pzt) … 7 (Paz). */
  dow: unknown;
  hour: unknown;
  n: unknown;
}

export function computePeaks(rows: readonly DowHourRaw[], minN = PEAK_MIN_N): PeakInsight {
  const hours = new Array<number>(24).fill(0);
  const days = new Array<number>(7).fill(0);
  let total = 0;
  for (const r of rows) {
    const d = toNum(r.dow) - 1;
    const h = toNum(r.hour);
    const n = toNum(r.n);
    if (d < 0 || d > 6 || h < 0 || h > 23 || n <= 0) continue;
    hours[h] += n;
    days[d] += n;
    total += n;
  }
  if (total < minN) return { hour: null, day: null, n: total, minN };
  const hMax = Math.max(...hours);
  const dMax = Math.max(...days);
  const hIdx = hours.indexOf(hMax);
  const dIdx = days.indexOf(dMax);
  return {
    hour: { hour: hIdx, count: hMax, share: round((hMax / total) * 100, 1) },
    day: { day: WEEKDAYS[dIdx], count: dMax, share: round((dMax / total) * 100, 1) },
    n: total,
    minN,
  };
}

/* ───────────────────────── Anomali ───────────────────────── */

/**
 * Basit, açıklanabilir anomali kuralları (sayıyı kod hesaplar; LLM yok):
 *  - olumsuz sıçrama: o gün ≥ 3 olumsuz ve olumsuz payı dönem payının 2 katı (ve +25 puan) üstü
 *  - hacim sıçraması: adet ≥ 5 ve ortalama + 3σ üstü
 * Kısa dönemde (< 14 gün) ya da az veride (< 30) anomali üretilmez.
 */
export function detectAnomalies(series: readonly SeriesPoint[], max = 5): Anomaly[] {
  if (series.length < ANOMALY_MIN_DAYS) return [];
  const total = series.reduce((s, p) => s + p.count, 0);
  if (total < ANOMALY_MIN_TOTAL) return [];
  const classified = series.reduce((s, p) => s + p.count - p.pending, 0);
  const negTotal = series.reduce((s, p) => s + p.negative, 0);
  const negShare = classified > 0 ? negTotal / classified : 0;
  const mean = total / series.length;
  const variance = series.reduce((s, p) => s + (p.count - mean) ** 2, 0) / series.length;
  const sd = Math.sqrt(variance);

  const out: Array<Anomaly & { score: number }> = [];
  for (const p of series) {
    const base = p.count - p.pending;
    if (p.negative >= 3 && base > 0) {
      const share = p.negative / base;
      if (share >= Math.max(negShare * 2, negShare + 0.25)) {
        const expected = round(base * negShare, 1);
        out.push({ day: p.day, kind: 'negative_spike', value: p.negative, expected, score: share / Math.max(negShare, 0.01) });
      }
    }
    if (sd > 0 && p.count >= 5 && p.count > mean + 3 * sd) {
      out.push({ day: p.day, kind: 'volume_spike', value: p.count, expected: round(mean, 1), score: (p.count - mean) / sd });
    }
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ score: _score, ...a }) => a)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/* ───────────────────────── Konular ───────────────────────── */

/** Sık = en az 2 bahis ve tüm konu bahislerinin ≥ %10'u. */
export function topicQuadrant(count: number, net: number, frequentMin: number): TopicRow['quadrant'] {
  const frequent = count >= Math.max(2, frequentMin);
  if (frequent && net <= -0.2) return 'fix';
  if (frequent && net >= 0.4) return 'strength';
  return 'watch';
}

export function buildTopicRows(cur: readonly RawTopicCount[], cmp: readonly RawTopicCount[] | null, limit = 8): TopicRow[] {
  const merged = mergeTopicCounts(cur);
  const cmpMerged = cmp ? mergeTopicCounts(cmp) : null;
  const rows = [...merged.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
  let mentions = 0;
  for (const v of merged.values()) mentions += v.count;
  const frequentMin = Math.ceil(mentions * 0.1);
  return rows.map((r) => {
    const net = r.count > 0 ? round((r.positive - r.negative) / r.count, 2) : 0;
    return {
      key: r.key,
      known: r.known,
      count: r.count,
      positive: r.positive,
      negative: r.negative,
      net,
      compareCount: cmpMerged ? cmpMerged.get(r.key)?.count ?? 0 : null,
      quadrant: topicQuadrant(r.count, net, frequentMin),
    };
  });
}

/* ───────────────────────── QR tablosu ───────────────────────── */

export interface QrMeta {
  id: string;
  name: string;
  code: string;
  locationId: string | null;
  locationName: string | null;
  archived: boolean;
}

export interface QrAggRaw {
  qr_id: string;
  n: unknown;
  rating_sum: unknown;
  positive: unknown;
  neutral?: unknown;
  negative?: unknown;
  pending: unknown;
}

export function buildQrRows(input: {
  meta: readonly QrMeta[];
  cur: readonly QrAggRaw[];
  cmp: readonly { qr_id: string; n: unknown }[] | null;
  scans: ReadonlyMap<string, number> | null;
  prior: number | null;
}): QrRow[] {
  const curBy = new Map(input.cur.map((r) => [r.qr_id, r]));
  const cmpBy = input.cmp ? new Map(input.cmp.map((r) => [r.qr_id, toNum(r.n)])) : null;
  const rows: QrRow[] = [];
  for (const m of input.meta) {
    const r = curBy.get(m.id);
    const n = r ? toNum(r.n) : 0;
    // Arşivlenmiş ve dönemde kaydı olmayan QR listeyi kalabalıklaştırmaz.
    if (m.archived && n === 0) continue;
    const sum = r ? toNum(r.rating_sum) : 0;
    const pending = r ? toNum(r.pending) : 0;
    const positive = r ? toNum(r.positive) : 0;
    const base = n - pending;
    const scans = input.scans ? input.scans.get(m.id) ?? 0 : null;
    const conv = scans != null && scans > 0 && n <= scans ? round((n / scans) * 100, 1) : null;
    const cmpN = cmpBy ? cmpBy.get(m.id) ?? 0 : null;
    rows.push({
      id: m.id,
      name: m.name,
      code: m.code,
      locationId: m.locationId,
      locationName: m.locationName,
      archived: m.archived,
      feedbacks: n,
      avgRating: n > 0 ? round(sum / n, 2) : null,
      bayesRating: n > 0 && input.prior != null ? bayesAverage(sum, n, input.prior) : null,
      positiveShare: base > 0 ? round((positive / base) * 100, 1) : null,
      scans,
      conversion: conv,
      compareFeedbacks: cmpN,
      feedbackDelta: cmpN == null ? null : relDeltaPct(n, cmpN),
    });
  }
  return rows.sort((a, b) => b.feedbacks - a.feedbacks || a.name.localeCompare(b.name, 'tr'));
}

export function pickBestQr(rows: readonly QrRow[], minN = BEST_QR_MIN_N): BestQrInsight | null {
  const eligible = rows.filter((r) => r.feedbacks >= minN && r.bayesRating != null && r.avgRating != null);
  if (eligible.length === 0) return null;
  const best = [...eligible].sort((a, b) => b.bayesRating! - a.bayesRating! || b.feedbacks - a.feedbacks)[0];
  return { id: best.id, name: best.name, avgRating: best.avgRating!, bayesRating: best.bayesRating!, feedbacks: best.feedbacks };
}

/* ───────────────────────── Isı haritası ───────────────────────── */

export interface HeatFeedbackRaw extends DowHourRaw {
  rating_sum: unknown;
  negative: unknown;
}

export interface HeatVisitRaw extends DowHourRaw {
  revenue: unknown;
}

function emptyCell(hour: number, withCompare: boolean): HeatCell {
  return {
    hour,
    feedback: 0,
    avgRating: null,
    negative: 0,
    visits: 0,
    revenue: 0,
    compareFeedback: withCompare ? 0 : null,
    compareVisits: withCompare ? 0 : null,
    compareRevenue: withCompare ? 0 : null,
  };
}

function cellAt(dow: unknown, hour: unknown): [number, number] | null {
  const d = toNum(dow) - 1;
  const h = toNum(hour);
  if (!Number.isInteger(d) || !Number.isInteger(h) || d < 0 || d > 6 || h < 0 || h > 23) return null;
  return [d, h];
}

/** 7×24 ızgara (Pazartesi ilk satır; gün anahtarı ile — sayısal etiket kayması imkânsız). */
export function buildHeatRows(input: {
  feedback: readonly HeatFeedbackRaw[];
  visits: readonly HeatVisitRaw[] | null;
  compareFeedback: readonly DowHourRaw[] | null;
  compareVisits: readonly HeatVisitRaw[] | null;
}): HeatRow[] {
  const withCompare = input.compareFeedback != null;
  const rows: HeatRow[] = WEEKDAYS.map((day) => ({ day, cells: Array.from({ length: 24 }, (_, h) => emptyCell(h, withCompare)) }));
  const sums = new Map<string, number>();
  for (const r of input.feedback) {
    const at = cellAt(r.dow, r.hour);
    if (!at) continue;
    const c = rows[at[0]].cells[at[1]];
    c.feedback += toNum(r.n);
    c.negative += toNum(r.negative);
    sums.set(`${at[0]}:${at[1]}`, (sums.get(`${at[0]}:${at[1]}`) ?? 0) + toNum(r.rating_sum));
  }
  for (const [k, s] of sums) {
    const [d, h] = k.split(':').map(Number);
    const c = rows[d].cells[h];
    c.avgRating = c.feedback > 0 ? round(s / c.feedback, 2) : null;
  }
  for (const r of input.visits ?? []) {
    const at = cellAt(r.dow, r.hour);
    if (!at) continue;
    const c = rows[at[0]].cells[at[1]];
    c.visits += toNum(r.n);
    c.revenue = round(c.revenue + toNum(r.revenue), 2);
  }
  for (const r of input.compareFeedback ?? []) {
    const at = cellAt(r.dow, r.hour);
    if (!at) continue;
    const c = rows[at[0]].cells[at[1]];
    c.compareFeedback = (c.compareFeedback ?? 0) + toNum(r.n);
  }
  for (const r of input.compareVisits ?? []) {
    const at = cellAt(r.dow, r.hour);
    if (!at) continue;
    const c = rows[at[0]].cells[at[1]];
    c.compareVisits = (c.compareVisits ?? 0) + toNum(r.n);
    c.compareRevenue = round((c.compareRevenue ?? 0) + toNum(r.revenue), 2);
  }
  return rows;
}

/** Hücrenin seçili metrikteki değeri (puan metriğinde kayıt yoksa null). */
export function cellValue(c: HeatCell, metric: HeatmapMetric): number | null {
  switch (metric) {
    case 'visits':
      return c.visits;
    case 'revenue':
      return c.revenue;
    case 'rating':
      return c.avgRating;
    case 'feedback':
    default:
      return c.feedback;
  }
}

export function cellCompareValue(c: HeatCell, metric: HeatmapMetric): number | null {
  switch (metric) {
    case 'visits':
      return c.compareVisits;
    case 'revenue':
      return c.compareRevenue;
    case 'rating':
      return null;
    case 'feedback':
    default:
      return c.compareFeedback;
  }
}

/** Hücre örneklemi: puan/geri bildirim için geri bildirim adedi; ziyaret/ciro için ziyaret. */
export function cellN(c: HeatCell, metric: HeatmapMetric): number {
  return metric === 'visits' || metric === 'revenue' ? c.visits : c.feedback;
}

export function buildLocationRows(input: {
  meta: readonly QrMeta[];
  agg: readonly QrAggRaw[];
  prior: number | null;
}): LocationRow[] {
  const metaBy = new Map(input.meta.map((m) => [m.id, m]));
  const groups = new Map<string, LocationRow & { ratingSum: number }>();
  for (const r of input.agg) {
    const m = metaBy.get(r.qr_id);
    if (!m) continue;
    const key = m.locationId ?? '__none__';
    const g =
      groups.get(key) ??
      ({ id: m.locationId, name: m.locationName, feedbacks: 0, avgRating: null, bayesRating: null, positive: 0, neutral: 0, negative: 0, pending: 0, qr: [], ratingSum: 0 } as LocationRow & {
        ratingSum: number;
      });
    const n = toNum(r.n);
    const sum = toNum(r.rating_sum);
    const pos = toNum(r.positive);
    const neu = toNum(r.neutral);
    const neg = toNum(r.negative);
    const pen = toNum(r.pending);
    g.feedbacks += n;
    g.ratingSum += sum;
    g.positive += pos;
    g.neutral += neu;
    g.negative += neg;
    g.pending += pen;
    const base = n - pen;
    g.qr.push({
      id: m.id,
      name: m.name,
      archived: m.archived,
      feedbacks: n,
      avgRating: n > 0 ? round(sum / n, 2) : null,
      positiveShare: base > 0 ? round((pos / base) * 100, 1) : null,
      positive: pos,
      neutral: neu,
      negative: neg,
      pending: pen,
    });
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ ratingSum, ...g }) => ({
      ...g,
      avgRating: g.feedbacks > 0 ? round(ratingSum / g.feedbacks, 2) : null,
      bayesRating: g.feedbacks > 0 && input.prior != null ? bayesAverage(ratingSum, g.feedbacks, input.prior) : null,
      qr: g.qr.sort((a, b) => b.feedbacks - a.feedbacks || a.name.localeCompare(b.name, 'tr')),
    }))
    .sort((a, b) => b.feedbacks - a.feedbacks);
}

export function heatInsights(input: {
  rows: readonly HeatRow[];
  metric: HeatmapMetric;
  overallAvg: number | null;
  locations: readonly LocationRow[];
  minN?: number;
  minCellN?: number;
}): HeatmapInsights {
  const minN = input.minN ?? PEAK_MIN_N;
  const minCellN = input.minCellN ?? CELL_MIN_N;
  const { rows, metric } = input;

  let total = 0;
  for (const r of rows) for (const c of r.cells) total += cellN(c, metric);

  let peak: HeatmapInsights['peak'] = null;
  if (total >= minN) {
    for (const r of rows) {
      for (const c of r.cells) {
        const v = cellValue(c, metric);
        if (v == null) continue;
        if (metric === 'rating' && c.feedback < minCellN) continue;
        if (!peak || v > peak.value) peak = { day: r.day, hour: c.hour, value: v, compareValue: cellCompareValue(c, metric) };
      }
    }
    if (peak && peak.value <= 0) peak = null;
  }

  let qualityDip: HeatmapInsights['qualityDip'] = null;
  if (input.overallAvg != null) {
    for (const r of rows) {
      for (const c of r.cells) {
        if (c.avgRating == null || c.feedback < minCellN) continue;
        if (input.overallAvg - c.avgRating < QUALITY_DIP_GAP) continue;
        if (!qualityDip || c.avgRating < qualityDip.avgRating || (c.avgRating === qualityDip.avgRating && c.feedback > qualityDip.n)) {
          qualityDip = { day: r.day, hour: c.hour, avgRating: c.avgRating, n: c.feedback, baseline: input.overallAvg };
        }
      }
    }
  }

  let attentionLocation: HeatmapInsights['attentionLocation'] = null;
  const eligible = input.locations.filter((l) => l.feedbacks >= BEST_QR_MIN_N && l.bayesRating != null && l.avgRating != null);
  if (eligible.length >= 2) {
    const worst = [...eligible].sort((a, b) => a.bayesRating! - b.bayesRating! || b.feedbacks - a.feedbacks)[0];
    attentionLocation = { id: worst.id, name: worst.name, bayesRating: worst.bayesRating!, avgRating: worst.avgRating!, feedbacks: worst.feedbacks };
  }

  return { peak, qualityDip, attentionLocation, minN, minCellN };
}
