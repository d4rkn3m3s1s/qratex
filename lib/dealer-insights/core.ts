/**
 * İçgörüler — deterministik hesap çekirdeği (saf; jest'li). SAYIYI KOD HESAPLAR.
 *
 * Eski sayfanın kapattığımız hataları (dealer_ai-insights.md):
 *  - NPS/CSAT/CES/yanıt oranı/korelasyon LLM'in uydurmasıydı → burada gerçek veriden; NPS yalnız
 *    gerçek 0-10 tavsiye yanıtı varsa, CES verisi olmadığından kart yok (AI efor sinyali ayrı ve
 *    etiketli).
 *  - Tema "yıldızı" model güven skorundan (`score*5`) türetiliyordu → artık o temadan bahseden
 *    kayıtların GERÇEK ortalama yıldızı.
 *  - "Korelasyon %" → temadan bahsedenler ile bahsetmeyenler arasındaki ortalama yıldız FARKI
 *    (n ile birlikte; iki grupta da en az `IMPACT_MIN_N` kayıt yoksa gösterilmez).
 *  - Uyarılar LLM serbest metniydi → kural tabanlı, her biri ilgili kayıt listesine bağlı.
 *  - Dönem seçici veriyi süzmüyordu → çağıran taraf satırları dönemle süzer; trend gerçekten
 *    önceki dönemle kıyaslanır.
 * Tek duygu tanımı Gelen Kutusu ile aynı (`unifiedSentiment`, `isNegativeItem`).
 */
import { isNegativeItem, unifiedSentiment, URGENT_THRESHOLD, CHURN_THRESHOLD } from '@/lib/dealer-inbox/core';
import type { MetricValue } from '@/components/ds/data/metric-format';
import { addDays, dayToUTCDate, rangeLength, type DayRange } from '@/components/ds/page/date-range';
import {
  ENTITY_TYPES,
  INTENT_KEYS,
  type AlertSeverity,
  type EntityRow,
  type EntityType,
  type InsightAlert,
  type InsightsAggregates,
  type InsightsMetrics,
  type InsightsSample,
  type IntentKey,
  type RecPriority,
  type Recommendation,
  type SentimentKey,
  type SignalSummary,
  type ThemeRow,
} from './types';

export { URGENT_THRESHOLD, CHURN_THRESHOLD };

/** Puan farkı için iki grupta da gereken en az kayıt. */
export const IMPACT_MIN_N = 5;
export const HIGH_EFFORT_THRESHOLD = 0.7;
export const MEDIUM_SIGNAL_THRESHOLD = 0.4;
export const MAX_THEMES = 40;
export const MAX_ENTITIES = 12;
export const MAX_RECOMMENDATIONS = 6;

/* ───────────────────────── Girdi satırı ───────────────────────── */

export interface ThemeMention {
  label: string;
  sub: string | null;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
}

export interface EntityMention {
  name: string;
  type: EntityType;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
}

export interface SuggestionMention {
  text: string;
  priority: RecPriority;
}

/** Sunucunun DB satırlarından ürettiği birleşik satır (QR + tüketim yorumu). */
export interface InsightRow {
  id: string;
  source: 'qr' | 'consumption';
  rating: number;
  sentiment: string | null;
  hasText: boolean;
  analyzed: boolean;
  replied: boolean;
  /** İstanbul günü (YYYY-MM-DD). */
  day: string;
  npsScore: number | null;
  urgency: number | null;
  churnRisk: number | null;
  effort: number | null;
  intent: string | null;
  isToxic: boolean;
  themes: ThemeMention[];
  entities: EntityMention[];
  emotions: string[];
  suggestions: SuggestionMention[];
}

/* ───────────────────────── Normalizasyon ───────────────────────── */

/** Türkçe küçük harf, kenar noktalama ve fazla boşluk temizliği. */
export function normalizeKey(raw: string): string {
  return raw
    .toLocaleLowerCase('tr')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[“”"'`´]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?\-–—()[\]]+|[\s.,;:!?\-–—()[\]]+$/g, '')
    .trim();
}

/** FNV-1a 32 bit — kararlı, kısa kimlik (öneri eşlemesi, React anahtarı). */
export function stableHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function recommendationId(text: string): string {
  return `r_${stableHash(normalizeKey(text))}`;
}

function cleanLabel(raw: unknown, max = 80): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function asSentiment(raw: unknown): ThemeMention['sentiment'] {
  return raw === 'positive' || raw === 'negative' || raw === 'neutral' || raw === 'mixed' ? raw : null;
}

export function parseThemes(json: unknown): ThemeMention[] {
  if (!Array.isArray(json)) return [];
  const out: ThemeMention[] = [];
  const seen = new Set<string>();
  for (const t of json.slice(0, 20)) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const label = cleanLabel(o.theme);
    if (!label) continue;
    const key = normalizeKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, sub: cleanLabel(o.subTheme), sentiment: asSentiment(o.sentiment) });
  }
  return out;
}

export function parseEntities(json: unknown): EntityMention[] {
  if (!Array.isArray(json)) return [];
  const out: EntityMention[] = [];
  const seen = new Set<string>();
  for (const e of json.slice(0, 20)) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const name = cleanLabel(o.name, 60);
    if (!name) continue;
    const type = (ENTITY_TYPES as readonly string[]).includes(String(o.type)) ? (o.type as EntityType) : 'other';
    const key = `${type}:${normalizeKey(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = asSentiment(o.sentiment);
    out.push({ name, type, sentiment: s === 'mixed' ? null : s });
  }
  return out;
}

/** `[{label, score}]` ya da `["happy"]` biçimini kabul eder (eski kayıtlar). Skor < 0,3 sayılmaz. */
export function parseEmotions(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  const out = new Set<string>();
  for (const e of json.slice(0, 12)) {
    if (typeof e === 'string') {
      const k = normalizeKey(e);
      if (k) out.add(k);
      continue;
    }
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const label = typeof o.label === 'string' ? normalizeKey(o.label) : '';
    const score = typeof o.score === 'number' ? o.score : 1;
    if (label && score >= 0.3) out.add(label);
  }
  return [...out];
}

function asPriority(raw: unknown): RecPriority {
  return raw === 'critical' || raw === 'high' || raw === 'low' ? raw : 'medium';
}

export function parseSuggestions(json: unknown): SuggestionMention[] {
  if (!Array.isArray(json)) return [];
  const out: SuggestionMention[] = [];
  const seen = new Set<string>();
  for (const s of json.slice(0, 10)) {
    let text: string | null = null;
    let priority: RecPriority = 'medium';
    if (typeof s === 'string') text = cleanLabel(s, 240);
    else if (s && typeof s === 'object') {
      const o = s as Record<string, unknown>;
      text = cleanLabel(o.action ?? o.text, 240);
      priority = asPriority(o.priority);
    }
    if (!text) continue;
    const key = normalizeKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, priority });
  }
  return out;
}

/* ───────────────────────── Yardımcılar ───────────────────────── */

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? round1((num / den) * 100) : 0);

function rowSentiment(r: InsightRow): SentimentKey {
  return unifiedSentiment({ sentiment: r.sentiment, rating: r.rating, hasText: r.hasText, analyzed: r.analyzed }).sentiment;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Pazartesi başlangıçlı hafta anahtarı (o haftanın Pazartesi günü). */
export function weekStart(day: string): string {
  const dow = dayToUTCDate(day).getUTCDay(); // 0 = Pazar
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(day, -back);
}

export function bucketFor(range: DayRange): 'day' | 'week' {
  return rangeLength(range) <= 31 ? 'day' : 'week';
}

/** Dönemin kova anahtarları (eski → yeni). */
export function bucketKeys(range: DayRange, bucket: 'day' | 'week'): string[] {
  const keys: string[] = [];
  if (bucket === 'day') {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) keys.push(d);
    return keys;
  }
  for (let w = weekStart(range.from); w <= range.to; w = addDays(w, 7)) keys.push(w);
  return keys;
}

function seriesOf(
  rows: readonly InsightRow[],
  keys: readonly string[],
  bucket: 'day' | 'week',
  fn: (bucketRows: InsightRow[]) => number | null
): Array<number | null> {
  const map = new Map<string, InsightRow[]>();
  for (const k of keys) map.set(k, []);
  for (const r of rows) {
    const k = bucket === 'day' ? r.day : weekStart(r.day);
    map.get(k)?.push(r);
  }
  return keys.map((k) => {
    const b = map.get(k) ?? [];
    return b.length === 0 ? null : fn(b);
  });
}

/* ───────────────────────── Metrikler ───────────────────────── */

interface BaseStats {
  n: number;
  avgRating: number | null;
  csat: number | null;
  negativeRate: number | null;
  negatives: number;
  responseRate: number | null;
  withText: number;
  highChurn: number;
}

export function baseStats(rows: readonly InsightRow[]): BaseStats {
  const n = rows.length;
  let sum = 0;
  let csatN = 0;
  let negatives = 0;
  let withText = 0;
  let replied = 0;
  let highChurn = 0;
  for (const r of rows) {
    sum += r.rating;
    if (r.rating >= 4) csatN += 1;
    if (isNegativeItem(r.rating, r.sentiment)) negatives += 1;
    if (r.hasText) {
      withText += 1;
      if (r.replied) replied += 1;
    }
    if ((r.churnRisk ?? 0) >= CHURN_THRESHOLD) highChurn += 1;
  }
  return {
    n,
    avgRating: n > 0 ? round2(sum / n) : null,
    csat: n > 0 ? pct(csatN, n) : null,
    negativeRate: n > 0 ? pct(negatives, n) : null,
    negatives,
    responseRate: withText > 0 ? pct(replied, withText) : null,
    withText,
    highChurn,
  };
}

export function npsOf(rows: readonly InsightRow[]): { value: number; n: number } | null {
  let promoters = 0;
  let detractors = 0;
  let n = 0;
  for (const r of rows) {
    if (r.npsScore == null || !Number.isFinite(r.npsScore) || r.npsScore < 0 || r.npsScore > 10) continue;
    n += 1;
    if (r.npsScore >= 9) promoters += 1;
    else if (r.npsScore <= 6) detractors += 1;
  }
  if (n === 0) return null;
  return { value: Math.round(((promoters - detractors) / n) * 100), n };
}

export function computeMetrics(
  cur: readonly InsightRow[],
  prev: readonly InsightRow[] | null,
  range: DayRange,
  asOf: string
): InsightsMetrics {
  const c = baseStats(cur);
  const p = prev ? baseStats(prev) : null;
  const bucket = bucketFor(range);
  const keys = bucketKeys(range, bucket);
  const hasPrev = !!p && p.n > 0;

  const avgSeries = seriesOf(cur, keys, bucket, (b) => round2(b.reduce((a, r) => a + r.rating, 0) / b.length));
  const volSeries = seriesOf(cur, keys, bucket, (b) => b.length).map((v) => v ?? 0);
  const csatSeries = seriesOf(cur, keys, bucket, (b) => pct(b.filter((r) => r.rating >= 4).length, b.length));
  const negSeries = seriesOf(cur, keys, bucket, (b) => pct(b.filter((r) => isNegativeItem(r.rating, r.sentiment)).length, b.length));

  const avgRating: MetricValue = {
    value: c.avgRating,
    fractionDigits: 2,
    n: c.n,
    minN: 10,
    series: avgSeries,
    asOf,
    delta:
      hasPrev && c.avgRating != null && p!.avgRating != null
        ? { value: round2(c.avgRating - p!.avgRating), kind: 'absolute', goodDirection: 'up' }
        : null,
  };
  const csat: MetricValue = {
    value: c.csat,
    format: 'percent',
    n: c.n,
    minN: 10,
    series: csatSeries,
    asOf,
    delta: hasPrev && c.csat != null && p!.csat != null ? { value: round1(c.csat - p!.csat), kind: 'points', goodDirection: 'up' } : null,
  };
  const negativeRate: MetricValue = {
    value: c.negativeRate,
    format: 'percent',
    n: c.n,
    minN: 10,
    series: negSeries,
    asOf,
    delta:
      hasPrev && c.negativeRate != null && p!.negativeRate != null
        ? { value: round1(c.negativeRate - p!.negativeRate), kind: 'points', goodDirection: 'down' }
        : null,
  };
  const responseRate: MetricValue = {
    value: c.responseRate,
    format: 'percent',
    n: c.withText,
    minN: 5,
    asOf,
    delta:
      p && c.responseRate != null && p.responseRate != null
        ? { value: round1(c.responseRate - p.responseRate), kind: 'points', goodDirection: 'up' }
        : null,
  };
  const volume: MetricValue = {
    value: c.n,
    series: volSeries,
    asOf,
    delta: p && p.n > 0 ? { value: round1(((c.n - p.n) / p.n) * 100), kind: 'percent', goodDirection: 'neutral' } : null,
  };
  const highChurn: MetricValue = {
    value: c.highChurn,
    asOf,
    delta: p ? { value: c.highChurn - p.highChurn, kind: 'absolute', goodDirection: 'down' } : null,
  };
  const npsCur = npsOf(cur);
  const npsPrev = prev ? npsOf(prev) : null;
  const nps: MetricValue | null = npsCur
    ? {
        value: npsCur.value,
        n: npsCur.n,
        minN: 30,
        asOf,
        delta: npsPrev ? { value: npsCur.value - npsPrev.value, kind: 'absolute', goodDirection: 'up' } : null,
      }
    : null;

  return { avgRating, csat, negativeRate, responseRate, volume, highChurn, nps };
}

/* ───────────────────────── Örneklem ───────────────────────── */

export function computeSample(rows: readonly InsightRow[], truncated: boolean): InsightsSample {
  let qr = 0;
  let withText = 0;
  let analyzed = 0;
  let pending = 0;
  let withSignals = 0;
  for (const r of rows) {
    if (r.source === 'qr') qr += 1;
    if (r.hasText) {
      withText += 1;
      if (r.analyzed) analyzed += 1;
      else pending += 1;
    }
    if (r.source === 'qr' && r.analyzed) withSignals += 1;
  }
  return { total: rows.length, qr, consumption: rows.length - qr, withText, analyzed, pending, withSignals, truncated };
}

/* ───────────────────────── Duygu + puan dağılımı ───────────────────────── */

export function sentimentCounts(rows: readonly InsightRow[]): Record<SentimentKey, number> {
  const out: Record<SentimentKey, number> = { positive: 0, neutral: 0, negative: 0, pending: 0 };
  for (const r of rows) out[rowSentiment(r)] += 1;
  return out;
}

export function ratingDistribution(rows: readonly InsightRow[]): [number, number, number, number, number] {
  const d: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of rows) {
    const i = Math.round(r.rating) - 1;
    if (i >= 0 && i < 5) d[i] += 1;
  }
  return d;
}

/* ───────────────────────── Temalar ───────────────────────── */

interface ThemeAcc {
  labels: Map<string, number>;
  subs: Map<string, number>;
  count: number;
  ratingSum: number;
  pos: number;
  neg: number;
}

function themeMentionSentiment(m: ThemeMention, row: InsightRow): 'positive' | 'negative' | 'neutral' | null {
  if (m.sentiment === 'positive' || m.sentiment === 'negative' || m.sentiment === 'neutral') return m.sentiment;
  if (m.sentiment === 'mixed') return null;
  const s = rowSentiment(row);
  return s === 'pending' ? null : s;
}

function accumulateThemes(rows: readonly InsightRow[]): { map: Map<string, ThemeAcc>; themed: InsightRow[] } {
  const map = new Map<string, ThemeAcc>();
  const themed: InsightRow[] = [];
  for (const r of rows) {
    if (r.themes.length === 0) continue;
    themed.push(r);
    for (const m of r.themes) {
      const key = normalizeKey(m.label);
      if (!key) continue;
      let acc = map.get(key);
      if (!acc) {
        acc = { labels: new Map(), subs: new Map(), count: 0, ratingSum: 0, pos: 0, neg: 0 };
        map.set(key, acc);
      }
      acc.count += 1;
      acc.ratingSum += r.rating;
      acc.labels.set(m.label, (acc.labels.get(m.label) ?? 0) + 1);
      if (m.sub) acc.subs.set(m.sub, (acc.subs.get(m.sub) ?? 0) + 1);
      const s = themeMentionSentiment(m, r);
      if (s === 'positive') acc.pos += 1;
      else if (s === 'negative') acc.neg += 1;
    }
  }
  return { map, themed };
}

function topOf(map: Map<string, number>, n: number): string[] {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr')).slice(0, n).map(([k]) => k);
}

export function computeThemes(cur: readonly InsightRow[], prev: readonly InsightRow[] | null): ThemeRow[] {
  const { map, themed } = accumulateThemes(cur);
  const prevAcc = prev ? accumulateThemes(prev).map : null;
  const totalThemed = themed.length;
  const totalRatingSum = themed.reduce((a, r) => a + r.rating, 0);

  const rows: ThemeRow[] = [];
  for (const [key, acc] of map) {
    const nWith = acc.count;
    const nWithout = totalThemed - nWith;
    const avgWith = nWith > 0 ? acc.ratingSum / nWith : null;
    const avgWithout = nWithout > 0 ? (totalRatingSum - acc.ratingSum) / nWithout : null;
    const p = prevAcc?.get(key) ?? null;
    rows.push({
      key,
      label: topOf(acc.labels, 1)[0] ?? key,
      count: acc.count,
      prevCount: prevAcc ? (p?.count ?? 0) : null,
      share: pct(acc.count, totalThemed),
      avgRating: avgWith == null ? null : round2(avgWith),
      negativeShare: pct(acc.neg, acc.count),
      positiveShare: pct(acc.pos, acc.count),
      prevNegativeShare: p && p.count >= 3 ? pct(p.neg, p.count) : null,
      ratingGap:
        nWith >= IMPACT_MIN_N && nWithout >= IMPACT_MIN_N && avgWith != null && avgWithout != null
          ? round2(avgWith - avgWithout)
          : null,
      nWith,
      nWithout,
      subThemes: topOf(acc.subs, 3),
    });
  }
  return rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr')).slice(0, MAX_THEMES);
}

/* ───────────────────────── Varlıklar ───────────────────────── */

export function computeEntities(rows: readonly InsightRow[]): EntityRow[] {
  const map = new Map<string, { names: Map<string, number>; type: EntityType; count: number; pos: number; neg: number }>();
  for (const r of rows) {
    for (const e of r.entities) {
      const key = `${e.type}:${normalizeKey(e.name)}`;
      let acc = map.get(key);
      if (!acc) {
        acc = { names: new Map(), type: e.type, count: 0, pos: 0, neg: 0 };
        map.set(key, acc);
      }
      acc.count += 1;
      acc.names.set(e.name, (acc.names.get(e.name) ?? 0) + 1);
      if (e.sentiment === 'positive') acc.pos += 1;
      else if (e.sentiment === 'negative') acc.neg += 1;
    }
  }
  return [...map.entries()]
    .map(([key, a]) => ({
      key,
      name: topOf(a.names, 1)[0] ?? key,
      type: a.type,
      count: a.count,
      negativeShare: pct(a.neg, a.count),
      positiveShare: pct(a.pos, a.count),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'))
    .slice(0, MAX_ENTITIES);
}

/* ───────────────────────── Sinyaller ───────────────────────── */

export function computeSignals(rows: readonly InsightRow[]): SignalSummary {
  const intents = Object.fromEntries(INTENT_KEYS.map((k) => [k, 0])) as Record<IntentKey, number>;
  const urgency = { high: 0, medium: 0, low: 0 };
  const churn = { high: 0, medium: 0, low: 0 };
  let highEffort = 0;
  const efforts: number[] = [];
  let toxic = 0;
  const emotions = new Map<string, number>();
  for (const r of rows) {
    const intent = (r.intent ?? '').toLowerCase();
    if ((INTENT_KEYS as readonly string[]).includes(intent)) intents[intent as IntentKey] += 1;
    if (r.urgency != null) {
      if (r.urgency >= URGENT_THRESHOLD) urgency.high += 1;
      else if (r.urgency >= MEDIUM_SIGNAL_THRESHOLD) urgency.medium += 1;
      else urgency.low += 1;
    }
    if (r.churnRisk != null) {
      if (r.churnRisk >= CHURN_THRESHOLD) churn.high += 1;
      else if (r.churnRisk >= MEDIUM_SIGNAL_THRESHOLD) churn.medium += 1;
      else churn.low += 1;
    }
    if (r.effort != null) {
      efforts.push(r.effort);
      if (r.effort >= HIGH_EFFORT_THRESHOLD) highEffort += 1;
    }
    if (r.isToxic) toxic += 1;
    for (const e of r.emotions) emotions.set(e, (emotions.get(e) ?? 0) + 1);
  }
  const avgEffort = avg(efforts);
  return {
    intents,
    urgency,
    churn,
    highEffort,
    avgEffort: avgEffort == null ? null : round2(avgEffort),
    effortN: efforts.length,
    toxic,
    emotions: [...emotions.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([key, count]) => ({ key, count })),
  };
}

/* ───────────────────────── Öneriler ───────────────────────── */

const PRIORITY_WEIGHT: Record<RecPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Kayıtların AI aksiyon önerilerini birleştirir. Aynı (normalize) öneri tek satır; öncelik en
 * yükseği; sıralama = kaynak kayıt sayısı × öncelik ağırlığı. `rows` en yeni önce gelmelidir.
 */
export function computeRecommendations(rows: readonly InsightRow[]): Recommendation[] {
  const map = new Map<
    string,
    { texts: Map<string, number>; priority: RecPriority; ids: string[]; themes: Map<string, number> }
  >();
  for (const r of rows) {
    for (const s of r.suggestions) {
      const id = recommendationId(s.text);
      let acc = map.get(id);
      if (!acc) {
        acc = { texts: new Map(), priority: s.priority, ids: [], themes: new Map() };
        map.set(id, acc);
      }
      acc.texts.set(s.text, (acc.texts.get(s.text) ?? 0) + 1);
      if (PRIORITY_WEIGHT[s.priority] > PRIORITY_WEIGHT[acc.priority]) acc.priority = s.priority;
      if (!acc.ids.includes(r.id)) acc.ids.push(r.id);
      for (const t of r.themes) {
        const k = normalizeKey(t.label);
        if (k) acc.themes.set(k, (acc.themes.get(k) ?? 0) + 1);
      }
    }
  }
  return [...map.entries()]
    .map(([id, a]) => ({
      id,
      text: topOf(a.texts, 1)[0] ?? '',
      priority: a.priority,
      count: a.ids.length,
      feedbackIds: a.ids.slice(0, 5),
      themeKeys: topOf(a.themes, 2),
      actionItemId: null,
      _score: a.ids.length * PRIORITY_WEIGHT[a.priority],
    }))
    .filter((r) => r.text)
    .sort((a, b) => b._score - a._score || b.count - a.count || a.text.localeCompare(b.text, 'tr'))
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ _score: _ignored, ...rest }) => rest);
}

/** Açık aksiyon maddeleriyle eşleştir (normalize metin özeti). */
export function attachActionItems(
  recs: readonly Recommendation[],
  openItems: ReadonlyArray<{ id: string; suggestionText: string }>
): Recommendation[] {
  const byId = new Map<string, string>();
  for (const it of openItems) {
    const rid = recommendationId(it.suggestionText);
    if (!byId.has(rid)) byId.set(rid, it.id);
  }
  return recs.map((r) => ({ ...r, actionItemId: byId.get(r.id) ?? null }));
}

/** ActionItem önceliği (şema: low/medium/high) — `critical` → `high` (eski sayfa `medium` yazıyordu). */
export function toActionPriority(p: RecPriority | 'high' | 'medium' | 'low'): 'high' | 'medium' | 'low' {
  return p === 'critical' || p === 'high' ? 'high' : p === 'low' ? 'low' : 'medium';
}

/* ───────────────────────── Kural tabanlı uyarılar ───────────────────────── */

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };

export function computeAlerts(input: {
  cur: readonly InsightRow[];
  prev: readonly InsightRow[] | null;
  themes: readonly ThemeRow[];
  sample: InsightsSample;
}): InsightAlert[] {
  const { cur, prev, themes, sample } = input;
  const alerts: InsightAlert[] = [];
  const c = baseStats(cur);
  const p = prev ? baseStats(prev) : null;

  // 1) Açık acil kayıtlar (yanıtsız, AI aciliyeti yüksek).
  const urgentOpen = cur.filter((r) => r.hasText && !r.replied && (r.urgency ?? 0) >= URGENT_THRESHOLD).length;
  if (urgentOpen > 0) {
    alerts.push({
      id: 'urgent_open',
      kind: 'urgent_open',
      severity: urgentOpen >= 3 ? 'critical' : 'high',
      params: { count: urgentOpen },
      target: { kind: 'inbox', query: { signal: 'urgent', status: 'new' } },
    });
  }

  // 2) Kayıp riski yüksek ve yanıtsız.
  const churnOpen = cur.filter((r) => !r.replied && (r.churnRisk ?? 0) >= CHURN_THRESHOLD).length;
  if (churnOpen > 0) {
    alerts.push({
      id: 'churn_high',
      kind: 'churn_high',
      severity: churnOpen >= 3 ? 'high' : 'medium',
      params: { count: churnOpen },
      target: { kind: 'inbox', query: { signal: 'churn', status: 'new' } },
    });
  }

  // 3) Olumsuz oranında sıçrama (önceki döneme göre ≥ 10 puan, en az 3 olumsuz kayıt).
  if (p && p.n >= 5 && c.negativeRate != null && p.negativeRate != null && c.negatives >= 3) {
    const diff = round1(c.negativeRate - p.negativeRate);
    if (diff >= 10) {
      alerts.push({
        id: 'negative_spike',
        kind: 'negative_spike',
        severity: diff >= 20 ? 'high' : 'medium',
        params: { rate: c.negativeRate, prevRate: p.negativeRate, count: c.negatives },
        target: { kind: 'inbox', query: { sentiment: 'negative' } },
      });
    }
  }

  // 4) Ortalama puan düşüşü (iki dönemde de ≥ 10 kayıt, ≥ 0,3 yıldız).
  if (p && c.n >= 10 && p.n >= 10 && c.avgRating != null && p.avgRating != null) {
    const drop = round2(c.avgRating - p.avgRating);
    if (drop <= -0.3) {
      alerts.push({
        id: 'rating_drop',
        kind: 'rating_drop',
        severity: drop <= -0.5 ? 'high' : 'medium',
        params: { value: c.avgRating, prev: p.avgRating, diff: drop },
        target: { kind: 'inbox', query: { sentiment: 'negative' } },
      });
    }
  }

  // 5) Kötüleşen tema (≥ 3 kayıt, olumsuz pay ≥ %50 ve önceki döneme göre ≥ 20 puan artış).
  const worsening = themes
    .filter((t) => t.count >= 3 && t.negativeShare >= 50 && t.prevNegativeShare != null && t.negativeShare - t.prevNegativeShare >= 20)
    .slice(0, 2);
  for (const t of worsening) {
    alerts.push({
      id: `theme_worsening:${t.key}`,
      kind: 'theme_worsening',
      severity: 'medium',
      params: { theme: t.label, share: t.negativeShare, prevShare: t.prevNegativeShare ?? 0, count: t.count },
      target: { kind: 'theme', key: t.key },
    });
  }

  // 6) Uygunsuz içerik.
  const toxic = cur.filter((r) => r.isToxic).length;
  if (toxic > 0) {
    alerts.push({
      id: 'toxic',
      kind: 'toxic',
      severity: 'medium',
      params: { count: toxic },
      target: { kind: 'inbox', query: { sentiment: 'negative' } },
    });
  }

  // 7) Analiz birikmesi (bilgi): bekleyenler otomatik hatta işlenir.
  if (sample.pending >= 5 && sample.withText > 0 && sample.pending / sample.withText >= 0.2) {
    alerts.push({
      id: 'analysis_backlog',
      kind: 'analysis_backlog',
      severity: 'info',
      params: { count: sample.pending, total: sample.withText },
      target: { kind: 'inbox', query: { sentiment: 'pending' } },
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/* ───────────────────────── Birleşik ───────────────────────── */

export function aggregateInsights(input: {
  cur: readonly InsightRow[];
  prev: readonly InsightRow[] | null;
  range: DayRange;
  truncated: boolean;
  asOf: string;
}): InsightsAggregates {
  const { cur, prev, range, truncated, asOf } = input;
  const sample = computeSample(cur, truncated);
  const themes = computeThemes(cur, prev);
  return {
    sample,
    compareTotal: prev ? prev.length : null,
    metrics: computeMetrics(cur, prev, range, asOf),
    sentiment: sentimentCounts(cur),
    ratingDist: ratingDistribution(cur),
    themes,
    entities: computeEntities(cur),
    signals: computeSignals(cur),
    alerts: computeAlerts({ cur, prev, themes, sample }),
    recommendations: computeRecommendations(cur),
    bucket: bucketFor(range),
  };
}
