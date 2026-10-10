/**
 * Bayi Kıyas — saf hesap katmanı (jest). DB'ye, Redis'e, React'e dokunmaz.
 *
 * Denetim kapanışları (docs/audit/2026-10-08/bayi/dealer_benchmark.md):
 *  - B1: tek sıra sözleşmesi (`position/outOf/topPercent/betterThanPercent`), eşitlikte orta
 *    sıra; örneklemi yetersiz bayi sıralanmaz ve dağılıma girmez.
 *  - B2: k-anonimlik KATKI VEREN işletme sayısı üzerinden (bayi hariç ≥ 5; uç eşik için ≥ 10).
 *  - B3: boş kova `null` (0'a çakılmaz) + her noktada `n`.
 *  - B5: hata yedeği yok — hesap yapılamıyorsa çağıran hata fırlatır; "üst %50" uydurulmaz.
 *  - B10: akran istatistikleri bayi HARİÇ; aksiyon oranında iptal paydada değil.
 */
import { addDays, dayDiff, type DayRange } from '@/components/ds/page/date-range';
import type { PlaceCategory } from '@/lib/places/categories';
import {
  BENCHMARK_METRICS,
  K_ANON_DECILE_MIN,
  K_ANON_MIN,
  METRIC_DIRECTION,
  METRIC_UNIT,
  SERIES_METRICS,
  type BenchmarkMetricKey,
  type BenchmarkPreset,
  type MetricRail,
  type PeerDistribution,
  type PeerGroup,
  type RankInfo,
  type Recommendation,
  type SegmentInfo,
  type SeriesMetricKey,
  type SeriesPoint,
  type Standing,
  type TopicGap,
} from './types';

// ───────────────────────────── Girdi biçimleri ─────────────────────────────

/** Bir bayinin dönem toplamı (iki kaynak birleşik: QR geri bildirimi + tüketim yorumu). */
export interface DealerAgg {
  n: number;
  ratingSum: number;
  replied: number;
  negative: number;
  replyMedianSec: number | null;
  actClosed: number;
  actRelevant: number;
}

export interface RosterEntry {
  id: string;
  category: PlaceCategory | null;
  city: string | null;
  isDemo: boolean;
}

/** [dealerId, kova, n, puan toplamı, yanıtlanan, olumsuz] */
export type BucketTuple = [string, string, number, number, number, number];
/** [dealerId, konu, olumsuz yorumlarda anılma] */
export type TopicTuple = [string, string, number];

/** Platform anlık görüntüsü — bayiden bağımsız, tek Redis anahtarında paylaşılır (B6). */
export interface PlatformSnapshot {
  range: DayRange;
  compareRange: DayRange;
  bucket: 'day' | 'week';
  current: Record<string, DealerAgg>;
  previous: Record<string, DealerAgg>;
  buckets: BucketTuple[];
  topics: TopicTuple[];
  /** Konu payının paydası: AI konusu çıkarılmış olumsuz QR yorumu sayısı (bayi başına). */
  topicBase: Record<string, number>;
  roster: RosterEntry[];
}

// ───────────────────────────── Eşikler ─────────────────────────────

/** Sıralamaya/dağılıma girmek için dönemde gereken en az değerlendirme. */
export function minFeedbackFor(preset: BenchmarkPreset): number {
  return preset === 'last7' ? 5 : preset === 'last90' ? 20 : 10;
}
/** Medyan yanıt süresinin anlamlı olması için en az yanıt. */
export const MIN_REPLIES = 3;
/** Aksiyon kapanış oranı için en az ilgili aksiyon. */
export const MIN_ACTIONS = 3;
/** Kova noktasının akran bandına girmesi için bayinin o kovadaki en az örneklemi. */
export const MIN_BUCKET_N = 3;
/** Konu kıyası için en az olumsuz yorum. */
export const MIN_NEGATIVE_FOR_TOPICS = 5;

export function bucketFor(range: DayRange): 'day' | 'week' {
  return dayDiff(range.from, range.to) + 1 <= 31 ? 'day' : 'week';
}

// ───────────────────────────── İstatistik ─────────────────────────────

/** Doğrusal ara değerli yüzdelik (tip 7). Boş dizide NaN. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

const EPS = 1e-9;

/**
 * Bayinin akranlar içindeki konumu (iyi yöne göre). Eşitlik yarım sayılır (orta sıra);
 * sıra "rekabet sırası" (eşitler aynı sırayı paylaşır).
 */
export function standingAmong(
  you: number,
  others: readonly number[],
  direction: 'up' | 'down',
): { position: number; outOf: number; betterThanPercent: number; topPercent: number } {
  let better = 0; // bayiden iyi olanlar
  let worse = 0;
  let equal = 0;
  for (const v of others) {
    if (Math.abs(v - you) < EPS) equal += 1;
    else if (direction === 'up' ? v > you : v < you) better += 1;
    else worse += 1;
  }
  const outOf = others.length + 1;
  const position = better + 1;
  const betterThanPercent = others.length === 0 ? 100 : ((worse + equal * 0.5) / others.length) * 100;
  const topPercent = Math.max(1, Math.ceil((position / outOf) * 100));
  return { position, outOf, betterThanPercent: round(betterThanPercent, 1), topPercent };
}

export function distribution(values: readonly number[], direction: 'up' | 'down'): PeerDistribution | null {
  if (values.length < K_ANON_MIN) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const top = values.length >= K_ANON_DECILE_MIN ? quantile(sorted, direction === 'up' ? 0.9 : 0.1) : null;
  return {
    contributors: values.length,
    p25: round(quantile(sorted, 0.25)),
    p50: round(quantile(sorted, 0.5)),
    p75: round(quantile(sorted, 0.75)),
    top: top == null ? null : round(top),
  };
}

// ───────────────────────────── Metrik değeri ─────────────────────────────

export interface MetricSample {
  value: number | null;
  n: number;
  minN: number;
}

/** Bir bayinin metrik değeri ve dayandığı örneklem. Örneklem yoksa değer null. */
export function metricSample(agg: DealerAgg | undefined, key: BenchmarkMetricKey, minFeedback: number): MetricSample {
  const a = agg ?? { n: 0, ratingSum: 0, replied: 0, negative: 0, replyMedianSec: null, actClosed: 0, actRelevant: 0 };
  switch (key) {
    case 'rating':
      return { value: a.n > 0 ? round(a.ratingSum / a.n) : null, n: a.n, minN: minFeedback };
    case 'negativeShare':
      return { value: a.n > 0 ? round((a.negative / a.n) * 100, 1) : null, n: a.n, minN: minFeedback };
    case 'replyRate':
      return { value: a.n > 0 ? round((a.replied / a.n) * 100, 1) : null, n: a.n, minN: minFeedback };
    case 'replyTime':
      return { value: a.replied > 0 && a.replyMedianSec != null ? Math.round(a.replyMedianSec) : null, n: a.replied, minN: MIN_REPLIES };
    case 'actionClose':
      return {
        value: a.actRelevant > 0 ? round((a.actClosed / a.actRelevant) * 100, 1) : null,
        n: a.actRelevant,
        minN: MIN_ACTIONS,
      };
  }
}

/** Değer dağılıma girebilir mi (örneklem eşiği)? */
function eligibleValue(s: MetricSample): number | null {
  return s.value != null && s.n >= s.minN ? s.value : null;
}

// ───────────────────────────── Segment ─────────────────────────────

export interface SegmentContext {
  selfId: string;
  isDemo: boolean;
  category: PlaceCategory | null;
  city: string | null;
}

/** Segmentteki BAŞKA işletmeler (aynı demo havuzu; demo hesaplar gerçek kıyasa karışmaz). */
export function segmentMembers(roster: readonly RosterEntry[], ctx: SegmentContext, group: PeerGroup): string[] | null {
  if (group === 'category' && !ctx.category) return null;
  if (group === 'city' && !ctx.city) return null;
  const out: string[] = [];
  for (const r of roster) {
    if (r.id === ctx.selfId || r.isDemo !== ctx.isDemo) continue;
    if (group === 'category' && r.category !== ctx.category) continue;
    if (group === 'city' && r.city !== ctx.city) continue;
    out.push(r.id);
  }
  return out;
}

/** Segmentte sıralamaya girebilen (dönemde ≥ minFeedback) başka işletmeler. */
export function contributorsOf(members: readonly string[], current: Record<string, DealerAgg>, minFeedback: number): string[] {
  return members.filter((id) => (current[id]?.n ?? 0) >= minFeedback);
}

export function segmentInfos(snapshot: PlatformSnapshot, ctx: SegmentContext, minFeedback: number): SegmentInfo[] {
  const groups: PeerGroup[] = ['platform', 'category', 'city'];
  return groups.map((group) => {
    const members = segmentMembers(snapshot.roster, ctx, group);
    const key = group === 'category' ? ctx.category : group === 'city' ? ctx.city : null;
    if (!members) return { group, key, contributors: 0, reason: 'not_set' as const };
    const contributors = contributorsOf(members, snapshot.current, minFeedback).length;
    return { group, key, contributors, reason: contributors >= K_ANON_MIN ? ('ok' as const) : ('too_few' as const) };
  });
}

/** İstenen grup yoksa varsayılan: kategori uygunsa kategori, değilse platform. */
export function resolveGroup(requested: PeerGroup | null, infos: readonly SegmentInfo[]): PeerGroup {
  if (requested) return requested;
  return infos.find((s) => s.group === 'category')?.reason === 'ok' ? 'category' : 'platform';
}

// ───────────────────────────── Raylar ve sıra ─────────────────────────────

function standingOf(you: number, peer: PeerDistribution, direction: 'up' | 'down'): Standing {
  const better = (a: number, b: number) => (direction === 'up' ? a >= b : a <= b);
  if (peer.top != null && better(you, peer.top)) return 'top';
  if (better(you, peer.p50)) return 'above';
  if (better(you, direction === 'up' ? peer.p25 : peer.p75)) return 'below';
  return 'bottom';
}

export function buildRails(
  snapshot: PlatformSnapshot,
  selfId: string,
  contributors: readonly string[],
  minFeedback: number,
): MetricRail[] {
  return BENCHMARK_METRICS.map((key) => {
    const direction = METRIC_DIRECTION[key];
    const mine = metricSample(snapshot.current[selfId], key, minFeedback);
    const prev = metricSample(snapshot.previous[selfId], key, minFeedback);
    const values: number[] = [];
    for (const id of contributors) {
      const v = eligibleValue(metricSample(snapshot.current[id], key, minFeedback));
      if (v != null) values.push(v);
    }
    const peer = distribution(values, direction);
    const comparable = peer != null && eligibleValue(mine) != null;
    const st = comparable ? standingAmong(mine.value as number, values, direction) : null;
    let gapToTop: number | null = null;
    if (comparable && peer?.top != null) {
      const diff = direction === 'up' ? peer.top - (mine.value as number) : (mine.value as number) - peer.top;
      gapToTop = round(Math.max(0, diff), key === 'replyTime' ? 0 : 2);
    }
    return {
      key,
      direction,
      unit: METRIC_UNIT[key],
      you: mine.value,
      youN: mine.n,
      minN: mine.minN,
      prev: eligibleValue(prev),
      peer,
      betterThanPercent: st?.betterThanPercent ?? null,
      gapToTop,
      standing: comparable && peer ? standingOf(mine.value as number, peer, direction) : null,
    };
  });
}

/** Puan sıralaması (B1). Önceki dönem aynı grup ve aynı kuralla. */
export function buildRank(
  snapshot: PlatformSnapshot,
  selfId: string,
  members: readonly string[] | null,
  minFeedback: number,
): RankInfo {
  const empty: RankInfo = {
    status: 'insufficient_data',
    position: null,
    outOf: null,
    topPercent: null,
    betterThanPercent: null,
    prevPosition: null,
    prevOutOf: null,
  };
  const ratingOf = (agg: DealerAgg | undefined) => eligibleValue(metricSample(agg, 'rating', minFeedback));
  const you = ratingOf(snapshot.current[selfId]);
  if (!members) return { ...empty, status: 'too_few_peers' };
  const others = members.map((id) => ratingOf(snapshot.current[id])).filter((v): v is number => v != null);
  if (you == null) return empty;
  if (others.length < K_ANON_MIN) return { ...empty, status: 'too_few_peers' };
  const now = standingAmong(you, others, 'up');

  let prevPosition: number | null = null;
  let prevOutOf: number | null = null;
  const prevYou = ratingOf(snapshot.previous[selfId]);
  const prevOthers = members.map((id) => ratingOf(snapshot.previous[id])).filter((v): v is number => v != null);
  if (prevYou != null && prevOthers.length >= K_ANON_MIN) {
    const p = standingAmong(prevYou, prevOthers, 'up');
    prevPosition = p.position;
    prevOutOf = p.outOf;
  }
  return {
    status: 'ok',
    position: now.position,
    outOf: now.outOf,
    topPercent: now.topPercent,
    betterThanPercent: now.betterThanPercent,
    prevPosition,
    prevOutOf,
  };
}

// ───────────────────────────── Seriler ─────────────────────────────

/** Aralıktaki kova başlangıçları (haftalıkta Pazartesi). */
export function bucketStarts(range: DayRange, bucket: 'day' | 'week'): string[] {
  const out: string[] = [];
  if (bucket === 'day') {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
    return out;
  }
  // Pazartesiye geri sar (UTC gün aritmetiği; gün dizgisi takvim günüdür).
  const dow = new Date(`${range.from}T00:00:00Z`).getUTCDay(); // 0=Pazar
  let d = addDays(range.from, -((dow + 6) % 7));
  for (; d <= range.to; d = addDays(d, 7)) out.push(d);
  return out;
}

function seriesValue(key: SeriesMetricKey, n: number, ratingSum: number, replied: number, negative: number): number | null {
  if (n <= 0) return null;
  if (key === 'rating') return round(ratingSum / n);
  if (key === 'replyRate') return round((replied / n) * 100, 1);
  return round((negative / n) * 100, 1);
}

export function buildSeries(
  snapshot: PlatformSnapshot,
  selfId: string,
  members: readonly string[] | null,
): Record<SeriesMetricKey, SeriesPoint[]> {
  const starts = bucketStarts(snapshot.range, snapshot.bucket);
  const memberSet = new Set(members ?? []);
  const mine = new Map<string, BucketTuple>();
  const peers = new Map<string, BucketTuple[]>();
  for (const t of snapshot.buckets) {
    if (t[0] === selfId) mine.set(t[1], t);
    else if (memberSet.has(t[0])) {
      const list = peers.get(t[1]) ?? [];
      list.push(t);
      peers.set(t[1], list);
    }
  }
  const out = {} as Record<SeriesMetricKey, SeriesPoint[]>;
  for (const key of SERIES_METRICS) {
    out[key] = starts.map((start) => {
      const m = mine.get(start);
      const vals = (peers.get(start) ?? [])
        .filter((t) => t[2] >= MIN_BUCKET_N)
        .map((t) => seriesValue(key, t[2], t[3], t[4], t[5]))
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      const band = vals.length >= K_ANON_MIN;
      return {
        start,
        you: m ? seriesValue(key, m[2], m[3], m[4], m[5]) : null,
        n: m ? m[2] : 0,
        peerP25: band ? round(quantile(vals, 0.25)) : null,
        peerP50: band ? round(quantile(vals, 0.5)) : null,
        peerP75: band ? round(quantile(vals, 0.75)) : null,
      };
    });
  }
  return out;
}

// ───────────────────────────── Konu kıyası ─────────────────────────────

/** AI konu etiketini birleştirilebilir anahtara indirger ("Servis Hızı " → "servis hizi"); geçersizse null. */
export function normalizeTopic(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > 40 || /^[[{]/.test(t)) return null;
  const key = t
    .toLocaleLowerCase('tr-TR')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return key.length >= 2 ? key : null;
}

export function buildTopicGaps(snapshot: PlatformSnapshot, selfId: string, contributors: readonly string[], limit = 3): TopicGap[] {
  const selfNeg = snapshot.topicBase[selfId] ?? 0;
  if (selfNeg < MIN_NEGATIVE_FOR_TOPICS) return [];
  const peerIds = contributors.filter((id) => (snapshot.topicBase[id] ?? 0) >= MIN_NEGATIVE_FOR_TOPICS);
  if (peerIds.length < K_ANON_MIN) return [];
  const peerSet = new Set(peerIds);
  const mineByTopic = new Map<string, number>();
  const peerByTopic = new Map<string, Map<string, number>>();
  for (const [dealerId, topic, mentions] of snapshot.topics) {
    if (dealerId === selfId) mineByTopic.set(topic, (mineByTopic.get(topic) ?? 0) + mentions);
    else if (peerSet.has(dealerId)) {
      const m = peerByTopic.get(topic) ?? new Map<string, number>();
      m.set(dealerId, (m.get(dealerId) ?? 0) + mentions);
      peerByTopic.set(topic, m);
    }
  }
  const gaps: TopicGap[] = [];
  for (const [topic, mentions] of mineByTopic) {
    if (mentions < 2) continue;
    const per = peerByTopic.get(topic);
    const shares = peerIds
      .map((id) => ((per?.get(id) ?? 0) / (snapshot.topicBase[id] || 1)) * 100)
      .sort((a, b) => a - b);
    const youShare = round((mentions / selfNeg) * 100, 1);
    const peerShare = round(quantile(shares, 0.5), 1);
    if (youShare - peerShare >= 5) gaps.push({ topic, youShare, youMentions: mentions, peerShare });
  }
  return gaps.sort((a, b) => b.youShare - b.peerShare - (a.youShare - a.peerShare)).slice(0, limit);
}

// ───────────────────────────── Öneriler ─────────────────────────────

export const RECOMMENDATION_LINKS: Readonly<Record<BenchmarkMetricKey | 'topic' | 'more_feedback' | 'set_category', string>> = {
  rating: '/dealer/inbox?sentiment=negative',
  negativeShare: '/dealer/analytics',
  replyRate: '/dealer/inbox?status=new',
  replyTime: '/dealer/automation/replies',
  actionClose: '/dealer/inbox/assigned',
  topic: '/dealer/inbox?sentiment=negative',
  more_feedback: '/dealer/qr-codes',
  set_category: '#akran-grubu',
};

/** Akranların medyanının gerisinde kalınan metrikler, açığın büyüklüğüne göre (en fazla 3). */
export function buildRecommendations(
  rails: readonly MetricRail[],
  topics: readonly TopicGap[],
  opts: { insufficient: boolean; categoryMissing: boolean },
): Recommendation[] {
  const out: Recommendation[] = [];
  if (opts.insufficient) {
    out.push({ kind: 'more_feedback', you: null, target: null, href: RECOMMENDATION_LINKS.more_feedback, weight: 10 });
  }
  for (const r of rails) {
    if (!r.peer || r.you == null || r.youN < r.minN) continue;
    const behind = r.direction === 'up' ? r.you < r.peer.p50 : r.you > r.peer.p50;
    if (!behind) continue;
    const spread = Math.max(Math.abs(r.peer.p75 - r.peer.p25), r.unit === 'rating' ? 0.1 : r.unit === 'percent' ? 2 : 600);
    out.push({
      kind: r.key,
      you: r.you,
      target: r.peer.p50,
      href: RECOMMENDATION_LINKS[r.key],
      weight: round(Math.abs(r.you - r.peer.p50) / spread, 3),
    });
  }
  const t = topics[0];
  if (t) {
    out.push({
      kind: 'topic',
      you: t.youShare,
      target: t.peerShare,
      topic: t.topic,
      href: RECOMMENDATION_LINKS.topic,
      weight: round((t.youShare - t.peerShare) / 20, 3),
    });
  }
  if (opts.categoryMissing) {
    out.push({ kind: 'set_category', you: null, target: null, href: RECOMMENDATION_LINKS.set_category, weight: 0.05 });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}
