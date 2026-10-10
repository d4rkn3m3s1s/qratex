/**
 * b-asistan — "verine sor" araçları (yalnız sunucu).
 *
 * Kural (yol haritası §4.4/3 ve /7):
 *  - Her araç YALNIZ çağıranın verdiği `dealerId` ile sorgular. Kiracı kimliği LLM argümanından
 *    asla okunmaz; argümanlar zod ile doğrulanır, bilinmeyen alan yok sayılır.
 *  - Sayılar sorgudan gelir. Toplu metrikler Analitik sayfasıyla AYNI yükleyiciden
 *    (`loadAnalyticsOverview` / `loadActivityHeatmap`; İstanbul saat kovaları, silinenler hariç,
 *    60 sn Redis) gelir → asistanın söylediği sayı ile Analitik ekranı birebir tutar.
 *  - Müşteri metni modele yalnız `sanitizeContextLine` süzgecinden geçerek gider; injection
 *    kalıplı yorum İSTEĞİ DÜŞÜRMEZ, yalnız o yorum atlanır (ask-analytics Bulgu 4).
 *  - Silinmiş (`deletedAt`), toksik ve güven bayraklı yorumlar alıntı/kaynak olarak kullanılmaz
 *    (sayımlarda Analitik ile aynı kural: silinen sayılmaz).
 */
import type OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { loadActivityHeatmap, loadAnalyticsOverview } from '@/lib/dealer-analytics/load';
import { normalizeTopic } from '@/lib/dealer-analytics/topics';
import type { AnalyticsOverview, AnalyticsQuery } from '@/lib/dealer-analytics/types';
import type { MetricValue } from '@/components/ds/data/metric-format';
import { compareRangeFor, istanbulDay, resolvePreset } from '@/components/ds/page/date-range';
import { toInstants } from '@/lib/dealer-analytics/params';

type MetricValueLike = Pick<MetricValue, 'value' | 'delta' | 'n'>;
import { sanitizeContextLine } from '@/lib/ai-prompt-safety';
import { findSimilarFeedback } from '@/lib/ai-learning';
import { periodLabel, sourceHref, topicLabel } from './labels';
import {
  ASSISTANT_PERIODS,
  type AssistantFact,
  type AssistantLocale,
  type AssistantPeriod,
  type AssistantSource,
  type AssistantToolName,
  type BusyTimesFact,
  type ChurnFact,
  type FactMetric,
  type LocationsFact,
  type OverviewFact,
  type SearchFact,
  type TopicsFact,
  type TrendFact,
} from './types';

/* ───────────────────────── Dönem → analitik sorgusu ───────────────────────── */

export function analyticsQueryFor(period: AssistantPeriod, today: string = istanbulDay()): AnalyticsQuery {
  const range = resolvePreset(period, today);
  return { preset: period, range, compare: 'previous', compareRange: compareRangeFor(range, 'previous'), channel: 'all', location: null };
}

/* ───────────────────────── Kaynak kaydı (atıf numaraları) ───────────────────────── */

export class SourceRegistry {
  private readonly byKey = new Map<string, AssistantSource>();
  private counter = 0;

  constructor(private readonly max = 24) {}

  /** Aynı kayıt aynı turda tek numara alır. Sınır dolunca null. */
  add(src: Omit<AssistantSource, 'ref' | 'href'>): AssistantSource | null {
    const key = `${src.kind}:${src.id}`;
    const hit = this.byKey.get(key);
    if (hit) return hit;
    if (this.byKey.size >= this.max) return null;
    this.counter += 1;
    const full: AssistantSource = { ...src, ref: `K${this.counter}`, href: sourceHref(src.kind, src.id) };
    this.byKey.set(key, full);
    return full;
  }

  list(): AssistantSource[] {
    return [...this.byKey.values()];
  }
}

export interface ToolContext {
  dealerId: string;
  defaultPeriod: AssistantPeriod;
  locale: AssistantLocale;
  today: string;
  sources: SourceRegistry;
}

export interface ToolResult {
  /** Modele giden kısa JSON (araç mesajı içeriği). */
  forModel: Record<string, unknown>;
  fact: AssistantFact | null;
  sources: AssistantSource[];
}

/* ───────────────────────── Araç tanımları (LLM'e) ───────────────────────── */

const periodProp = {
  type: 'string',
  enum: [...ASSISTANT_PERIODS],
  description: 'Dönem. Kullanıcı belirtmediyse boş bırak (sohbetin varsayılan dönemi kullanılır).',
} as const;

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_overview',
      description: 'Dönemin özet metrikleri ve önceki eşit dönemle kıyas: yorum adedi, ortalama puan, olumlu oranı, yanıt oranı, NPS, duygu dağılımı.',
      parameters: { type: 'object', properties: { period: periodProp }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_topics',
      description: 'Müşterilerin en sık bahsettiği konular, her konunun olumlu/olumsuz sayısı ve önceki dönemdeki adedi. "En çok neden şikâyet ediyorlar", "güçlü yönlerim" soruları için.',
      parameters: { type: 'object', properties: { period: periodProp }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trend',
      description: 'Günlük yorum adedi ve ortalama puan serisi; olağan dışı günler (olumsuz yorum ya da hacim sıçraması). "Puanım ne zaman düştü", "trend" soruları için.',
      parameters: { type: 'object', properties: { period: periodProp }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_locations',
      description: 'QR kodu / şube bazında yorum adedi ve ortalama puan. "Hangi şubem/masam kötü" soruları için.',
      parameters: { type: 'object', properties: { period: periodProp }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_busy_times',
      description: 'En yoğun gün ve saat, puanın belirgin düştüğü gün-saat penceresi (İstanbul saati).',
      parameters: { type: 'object', properties: { period: periodProp }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_feedback',
      description:
        'Müşteri yorumlarında arama yapar ve kaynak yorumları [K1] gibi numaralarla döndürür. Bir konudaki şikâyetleri, örnek yorumları ya da düşük puanlı yorumları görmek için kullan.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Aranacak konu ya da ifade (ör. "bekleme süresi", "garson"). Yalnız süzgeç için boş bırak.' },
          period: periodProp,
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
          minRating: { type: 'integer', minimum: 1, maximum: 5 },
          maxRating: { type: 'integer', minimum: 1, maximum: 5 },
          limit: { type: 'integer', minimum: 1, maximum: 8 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_churn_risk',
      description: 'Kaybetme riski yüksek (AI churn ≥ 0,7) ve acil yorum sayıları, bu yorumlarda öne çıkan konular ve örnek yorumlar.',
      parameters: { type: 'object', properties: { period: periodProp }, additionalProperties: false },
    },
  },
];

const PeriodArg = z.enum(ASSISTANT_PERIODS).optional().catch(undefined);
const PeriodOnlyArgs = z.object({ period: PeriodArg }).passthrough();
const SearchArgs = z
  .object({
    query: z.string().trim().max(200).optional().catch(undefined),
    period: PeriodArg,
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional().catch(undefined),
    minRating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
    maxRating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
    limit: z.coerce.number().int().min(1).max(8).optional().catch(undefined),
  })
  .passthrough();

export function parseToolArgs(raw: string | undefined | null): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* ───────────────────────── Yardımcılar ───────────────────────── */

function r2(n: number | null | undefined, digits = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** `MetricValue` + delta → değer ve önceki dönem değeri. */
export function metricWithCompare(m: MetricValueLike, compareFallback: number | null = null): FactMetric {
  const value = m.value ?? null;
  let compare: number | null = compareFallback;
  const d = m.delta;
  if (value != null && d && (d.kind === 'absolute' || d.kind === 'points')) compare = r2(value - d.value);
  return { value: r2(value), compare: r2(compare), n: m.n ?? null };
}

function rangeText(range: { from: string; to: string } | null): string | null {
  return range ? `${range.from} – ${range.to}` : null;
}

function periodHeader(period: AssistantPeriod, q: AnalyticsQuery, locale: AssistantLocale) {
  return { period, label: periodLabel(period, locale), range: rangeText(q.range), compareRange: rangeText(q.compareRange) };
}

function excerptOf(text: string, max = 280): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

type SnippetRow = { kind: 'qr' | 'consumption'; id: string; text: string | null; rating: number | null; sentiment: string | null; createdAt: Date };

/** Satırları kaynak kaydına ekler; modele giden alıntıyı süzer (injection kalıbı → atlanır). */
function registerSnippets(rows: SnippetRow[], ctx: ToolContext, limit: number): { forModel: Array<Record<string, unknown>>; sources: AssistantSource[] } {
  const forModel: Array<Record<string, unknown>> = [];
  const sources: AssistantSource[] = [];
  for (const row of rows) {
    if (sources.length >= limit) break;
    if (!row.text || !row.text.trim()) continue;
    const safe = sanitizeContextLine(row.text, 280);
    if (!safe) continue;
    const src = ctx.sources.add({
      kind: row.kind,
      id: row.id,
      excerpt: excerptOf(row.text),
      rating: row.rating,
      sentiment: row.sentiment,
      createdAt: row.createdAt.toISOString(),
    });
    if (!src) break;
    sources.push(src);
    forModel.push({ ref: src.ref, rating: row.rating, sentiment: row.sentiment, day: istanbulDay(row.createdAt), channel: row.kind, text: safe });
  }
  return { forModel, sources };
}

/* ───────────────────────── Araç uygulamaları ───────────────────────── */

async function overviewFor(ctx: ToolContext, period: AssistantPeriod): Promise<{ q: AnalyticsQuery; data: AnalyticsOverview }> {
  const q = analyticsQueryFor(period, ctx.today);
  return { q, data: (await loadAnalyticsOverview(ctx.dealerId, q)) as AnalyticsOverview };
}

export function buildOverviewFact(period: AssistantPeriod, q: AnalyticsQuery, data: AnalyticsOverview): OverviewFact {
  const hasCompare = !!q.compareRange;
  const volumeCompare = hasCompare ? data.series.reduce((s, p) => s + (p.compareCount ?? 0), 0) : null;
  return {
    tool: 'get_overview',
    period,
    range: q.range,
    compareRange: q.compareRange,
    volume: { value: data.kpis.volume.value ?? 0, compare: volumeCompare, n: null },
    avgRating: metricWithCompare(data.kpis.avgRating),
    positiveShare: metricWithCompare(data.kpis.positiveShare),
    responseRate: metricWithCompare(data.kpis.responseRate),
    nps: metricWithCompare(data.kpis.nps),
    sentiment: data.sentiment,
    hasAnyData: data.hasAnyData,
  };
}

export function overviewForModel(fact: OverviewFact, q: AnalyticsQuery, locale: AssistantLocale): Record<string, unknown> {
  return {
    ...periodHeader(fact.period, q, locale),
    feedbackCount: fact.volume,
    avgRating5: fact.avgRating,
    positiveSharePct: fact.positiveShare,
    replyRatePct: fact.responseRate,
    nps: fact.nps,
    sentiment: fact.sentiment,
    note: fact.hasAnyData ? undefined : 'Bu işletmede henüz hiç yorum yok.',
  };
}

async function runOverview(ctx: ToolContext, period: AssistantPeriod): Promise<ToolResult> {
  const { q, data } = await overviewFor(ctx, period);
  const fact = buildOverviewFact(period, q, data);
  return { forModel: overviewForModel(fact, q, ctx.locale), fact, sources: [] };
}

async function runTopics(ctx: ToolContext, period: AssistantPeriod): Promise<ToolResult> {
  const { q, data } = await overviewFor(ctx, period);
  const fact: TopicsFact = {
    tool: 'get_topics',
    period,
    range: q.range,
    base: data.topicsBase,
    topics: data.topics.map((t) => ({
      key: t.key,
      count: t.count,
      compareCount: t.compareCount,
      positive: t.positive,
      negative: t.negative,
      quadrant: t.quadrant,
    })),
  };
  return {
    forModel: {
      ...periodHeader(period, q, ctx.locale),
      analyzedQrFeedback: data.topicsBase,
      topics: fact.topics.map((t) => ({
        topic: topicLabel(t.key, ctx.locale),
        mentions: t.count,
        previousMentions: t.compareCount,
        positive: t.positive,
        negative: t.negative,
        verdict: t.quadrant === 'fix' ? 'düzeltilmeli' : t.quadrant === 'strength' ? 'güçlü yön' : 'izle',
      })),
      note: data.topicsBase === 0 ? 'Bu dönemde konu çıkarılmış (AI analizli) QR yorumu yok.' : undefined,
    },
    fact,
    sources: [],
  };
}

async function runTrend(ctx: ToolContext, period: AssistantPeriod): Promise<ToolResult> {
  const { q, data } = await overviewFor(ctx, period);
  const fact: TrendFact = {
    tool: 'get_trend',
    period,
    range: q.range,
    series: data.series.map((p) => ({ day: p.day, count: p.count, avgRating: r2(p.avgRating), negative: p.negative })),
    anomalies: data.anomalies.map((a) => ({ day: a.day, kind: a.kind, value: a.value, expected: r2(a.expected) ?? 0 })),
  };
  // Modele: 31 günü aşan serilerde haftalık özet (bağlam şişmesin).
  const series = fact.series;
  const compact =
    series.length > 31
      ? chunk(series, 7).map((w) => {
          const count = w.reduce((s, p) => s + p.count, 0);
          const rated = w.filter((p) => p.avgRating != null);
          const avg = rated.length ? rated.reduce((s, p) => s + (p.avgRating ?? 0) * p.count, 0) / Math.max(1, rated.reduce((s, p) => s + p.count, 0)) : null;
          return { week: `${w[0].day} – ${w[w.length - 1].day}`, count, avgRating: r2(avg), negative: w.reduce((s, p) => s + p.negative, 0) };
        })
      : series;
  return {
    forModel: { ...periodHeader(period, q, ctx.locale), granularity: series.length > 31 ? 'week' : 'day', series: compact, anomalies: fact.anomalies },
    fact,
    sources: [],
  };
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runLocations(ctx: ToolContext, period: AssistantPeriod): Promise<ToolResult> {
  const { q, data } = await overviewFor(ctx, period);
  const rows = [...data.qr]
    .filter((r) => r.feedbacks > 0 || (r.compareFeedbacks ?? 0) > 0)
    .sort((a, b) => b.feedbacks - a.feedbacks)
    .slice(0, 12);
  const fact: LocationsFact = {
    tool: 'get_locations',
    period,
    range: q.range,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      locationName: r.locationName,
      feedbacks: r.feedbacks,
      avgRating: r2(r.avgRating),
      bayesRating: r2(r.bayesRating),
      compareFeedbacks: r.compareFeedbacks,
    })),
  };
  return {
    forModel: {
      ...periodHeader(period, q, ctx.locale),
      note: 'bayesRating: az yorumlu QR’larda genel ortalamaya çekilmiş adil puan; sıralama için bunu kullan.',
      qrCodes: fact.rows.map((r) => ({
        name: sanitizeContextLine(r.name, 80) ?? '-',
        branch: r.locationName ? sanitizeContextLine(r.locationName, 80) : null,
        feedbacks: r.feedbacks,
        previousFeedbacks: r.compareFeedbacks,
        avgRating: r.avgRating,
        bayesRating: r.bayesRating,
      })),
    },
    fact,
    sources: [],
  };
}

async function runBusyTimes(ctx: ToolContext, period: AssistantPeriod): Promise<ToolResult> {
  const q = analyticsQueryFor(period, ctx.today);
  const heat = await loadActivityHeatmap(ctx.dealerId, { ...q, metric: 'feedback' });
  // Yoğun gün/saat: ızgaradan (n eşiğini Analitik `peaks` ile aynı tutmak için overview de okunur).
  const { data } = await overviewFor(ctx, period);
  const peaks = data.peaks;
  const dip = heat.insights.qualityDip;
  const fact: BusyTimesFact = {
    tool: 'get_busy_times',
    period,
    range: q.range,
    peakDay: peaks.day ? { day: peaks.day.day, count: peaks.day.count, share: r2(peaks.day.share) ?? 0 } : null,
    peakHour: peaks.hour ? { hour: peaks.hour.hour, count: peaks.hour.count, share: r2(peaks.hour.share) ?? 0 } : null,
    qualityDip: dip ? { day: dip.day, hour: dip.hour, avgRating: r2(dip.avgRating) ?? 0, n: dip.n, baseline: r2(dip.baseline) ?? 0 } : null,
    n: peaks.n,
  };
  return {
    forModel: {
      ...periodHeader(period, q, ctx.locale),
      timezone: 'Europe/Istanbul',
      sample: peaks.n,
      minSample: peaks.minN,
      busiestDay: fact.peakDay,
      busiestHour: fact.peakHour,
      lowRatingWindow: fact.qualityDip,
      note: fact.peakDay || fact.peakHour ? undefined : 'Örneklem yoğunluk analizi için yetersiz.',
    },
    fact,
    sources: [],
  };
}

async function runSearch(ctx: ToolContext, args: z.infer<typeof SearchArgs>): Promise<ToolResult> {
  const period = args.period ?? ctx.defaultPeriod;
  const q = analyticsQueryFor(period, ctx.today);
  const { from, to } = toInstants(q.range);
  const limit = args.limit ?? 6;
  let minRating = args.minRating ?? null;
  let maxRating = args.maxRating ?? null;
  if (minRating != null && maxRating != null && minRating > maxRating) [minRating, maxRating] = [maxRating, minRating];
  const sentiment = args.sentiment ?? null;
  const query = args.query && args.query.length >= 2 ? args.query : null;

  const ratingWhere = minRating != null || maxRating != null ? { rating: { ...(minRating != null ? { gte: minRating } : {}), ...(maxRating != null ? { lte: maxRating } : {}) } } : {};
  const fbWhere: Prisma.FeedbackWhereInput = {
    qrCode: { dealerId: ctx.dealerId },
    deletedAt: null,
    isToxic: false,
    trustFlagged: false,
    createdAt: { gte: from, lt: to },
    text: { not: null },
    ...(sentiment ? { sentiment } : {}),
    ...ratingWhere,
  };
  const crWhere: Prisma.ConsumptionReviewWhereInput = {
    consumption: { dealerId: ctx.dealerId },
    deletedAt: null,
    createdAt: { gte: from, lt: to },
    text: { not: null },
    ...(sentiment ? { sentiment } : {}),
    ...ratingWhere,
  };
  const order = maxRating != null && maxRating <= 3 ? [{ rating: 'asc' as const }, { createdAt: 'desc' as const }] : [{ createdAt: 'desc' as const }];
  const fbSelect = { id: true, text: true, rating: true, sentiment: true, createdAt: true } as const;

  let method: SearchFact['method'] = 'filter';
  let matched = 0;
  let rows: SnippetRow[] = [];

  if (query) {
    // 1) Anlamsal: embedding adayları → aynı dönem/kiracı/silinmemiş süzgeciyle doğrulanır.
    let semanticIds: string[] = [];
    try {
      const similar = await findSimilarFeedback({ dealerId: ctx.dealerId, text: query, limit: 30, minScore: 0.3 });
      semanticIds = similar.map((s) => s.feedbackId);
    } catch (err) {
      console.warn('[assistant] anlamsal arama atlandı:', err instanceof Error ? err.message : err);
    }
    if (semanticIds.length > 0) {
      const found = await prisma.feedback.findMany({ where: { ...fbWhere, id: { in: semanticIds } }, select: fbSelect });
      const rank = new Map(semanticIds.map((id, i) => [id, i]));
      rows = found
        .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
        .map((f) => ({ kind: 'qr' as const, ...f }));
      matched = found.length;
      if (rows.length > 0) method = 'semantic';
    }
    // 2) Anahtar kelime (QR + tüketim): anlamsal sonuç azsa tamamlar.
    if (rows.length < 3) {
      const terms = keywordTerms(query);
      if (terms.length > 0) {
        const textOr = terms.map((t) => ({ text: { contains: t, mode: 'insensitive' as const } }));
        const [fb, cr, fbCount, crCount] = await Promise.all([
          prisma.feedback.findMany({ where: { ...fbWhere, OR: textOr }, select: fbSelect, orderBy: order, take: limit }),
          prisma.consumptionReview.findMany({ where: { ...crWhere, OR: textOr }, select: fbSelect, orderBy: order, take: limit }),
          prisma.feedback.count({ where: { ...fbWhere, OR: textOr } }),
          prisma.consumptionReview.count({ where: { ...crWhere, OR: textOr } }),
        ]);
        const seen = new Set(rows.map((r) => r.id));
        const extra = mergeByDate(
          fb.map((f) => ({ kind: 'qr' as const, ...f })),
          cr.map((c) => ({ kind: 'consumption' as const, ...c })),
        ).filter((r) => !seen.has(r.id));
        if (extra.length > 0 && method !== 'semantic') method = 'keyword';
        rows = [...rows, ...extra];
        matched = Math.max(matched, fbCount + crCount + (method === 'semantic' ? matched : 0));
        if (method === 'keyword') matched = fbCount + crCount;
      }
    }
  } else {
    const [fb, cr, fbCount, crCount] = await Promise.all([
      prisma.feedback.findMany({ where: fbWhere, select: fbSelect, orderBy: order, take: limit }),
      prisma.consumptionReview.findMany({ where: crWhere, select: fbSelect, orderBy: order, take: limit }),
      prisma.feedback.count({ where: fbWhere }),
      prisma.consumptionReview.count({ where: crWhere }),
    ]);
    rows = mergeByDate(fb.map((f) => ({ kind: 'qr' as const, ...f })), cr.map((c) => ({ kind: 'consumption' as const, ...c })));
    if (maxRating != null && maxRating <= 3) rows.sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5) || b.createdAt.getTime() - a.createdAt.getTime());
    matched = fbCount + crCount;
  }

  const { forModel, sources } = registerSnippets(rows, ctx, limit);
  const fact: SearchFact = {
    tool: 'search_feedback',
    period,
    range: q.range,
    query,
    method,
    matched,
    returned: sources.length,
    filters: { sentiment, minRating, maxRating },
  };
  return {
    forModel: {
      ...periodHeader(period, q, ctx.locale),
      query,
      method,
      matchedTotal: matched,
      returned: sources.length,
      feedback: forModel,
      note:
        sources.length === 0
          ? 'Bu süzgeçle eşleşen yorum bulunamadı. Uydurma örnek verme.'
          : 'Alıntı ya da yorum temelli iddiada ref numarasını [K1] biçiminde belirt.',
    },
    fact,
    sources,
  };
}

const STOP_WORDS = new Set(['ve', 'ile', 'bir', 'bu', 'şu', 'için', 'çok', 'daha', 'gibi', 'olan', 'neden', 'nasıl', 'the', 'and', 'for', 'with']);

/** Arama ifadesinden en çok 4 anlamlı kelime (≥ 3 harf). */
export function keywordTerms(query: string): string[] {
  const words = query
    .toLocaleLowerCase('tr-TR')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 4);
}

function mergeByDate(a: SnippetRow[], b: SnippetRow[]): SnippetRow[] {
  return [...a, ...b].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
}

async function runChurn(ctx: ToolContext, period: AssistantPeriod): Promise<ToolResult> {
  const q = analyticsQueryFor(period, ctx.today);
  const { from, to } = toInstants(q.range);
  const fbBase: Prisma.FeedbackWhereInput = { qrCode: { dealerId: ctx.dealerId }, deletedAt: null, createdAt: { gte: from, lt: to } };
  const crBase: Prisma.ConsumptionReviewWhereInput = { consumption: { dealerId: ctx.dealerId }, deletedAt: null, createdAt: { gte: from, lt: to } };
  const TOPIC_SAMPLE = 300;
  const [fbHigh, crHigh, urgent, fbAnalyzed, crAnalyzed, topicRows, fbSnips, crSnips] = await Promise.all([
    prisma.feedback.count({ where: { ...fbBase, churnRisk: { gte: 0.7 } } }),
    prisma.consumptionReview.count({ where: { ...crBase, churnRisk: { gte: 0.7 } } }),
    prisma.feedback.count({ where: { ...fbBase, urgency: { gte: 0.7 } } }),
    prisma.feedback.count({ where: { ...fbBase, churnRisk: { not: null } } }),
    prisma.consumptionReview.count({ where: { ...crBase, churnRisk: { not: null } } }),
    prisma.feedback.findMany({
      where: { ...fbBase, churnRisk: { gte: 0.7 }, topics: { not: Prisma.AnyNull } },
      select: { topics: true },
      orderBy: { createdAt: 'desc' },
      take: TOPIC_SAMPLE,
    }),
    prisma.feedback.findMany({
      where: { ...fbBase, churnRisk: { gte: 0.7 }, isToxic: false, trustFlagged: false, text: { not: null } },
      select: { id: true, text: true, rating: true, sentiment: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    }),
    prisma.consumptionReview.findMany({
      where: { ...crBase, churnRisk: { gte: 0.7 }, text: { not: null } },
      select: { id: true, text: true, rating: true, sentiment: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2,
    }),
  ]);

  const counts = new Map<string, number>();
  for (const row of topicRows) {
    const arr = Array.isArray(row.topics) ? (row.topics as unknown[]) : [];
    const seen = new Set<string>();
    for (const t of arr) {
      const norm = normalizeTopic(t);
      if (!norm || seen.has(norm.key)) continue;
      seen.add(norm.key);
      counts.set(norm.key, (counts.get(norm.key) ?? 0) + 1);
    }
  }
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([key, count]) => ({ key, count }));

  const snippets = registerSnippets(
    mergeByDate(fbSnips.map((f) => ({ kind: 'qr' as const, ...f })), crSnips.map((c) => ({ kind: 'consumption' as const, ...c }))),
    ctx,
    4,
  );

  const fact: ChurnFact = {
    tool: 'get_churn_risk',
    period,
    range: q.range,
    highRisk: fbHigh + crHigh,
    urgent,
    analyzed: fbAnalyzed + crAnalyzed,
    topics,
    topicSample: topicRows.length,
  };
  return {
    forModel: {
      ...periodHeader(period, q, ctx.locale),
      highChurnRisk: fact.highRisk,
      urgent: fact.urgent,
      aiAnalyzedFeedback: fact.analyzed,
      topTopicsAmongHighRisk: topics.map((t) => ({ topic: topicLabel(t.key, ctx.locale), count: t.count })),
      topicSample: fact.topicSample,
      examples: snippets.forModel,
      note: fact.analyzed === 0 ? 'Bu dönemde AI ile analiz edilmiş yorum yok; kayıp riski hesaplanamaz.' : undefined,
    },
    fact,
    sources: snippets.sources,
  };
}

/* ───────────────────────── Dağıtıcı ───────────────────────── */

export function isToolName(v: unknown): v is AssistantToolName {
  return typeof v === 'string' && TOOL_DEFINITIONS.some((t) => t.function.name === v);
}

/** Aracı çalıştırır. Bilinmeyen araç / hata → modele açıklayıcı hata nesnesi (istek düşmez). */
export async function executeTool(name: string, rawArgs: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (!isToolName(name)) return { forModel: { error: 'Bilinmeyen araç.' }, fact: null, sources: [] };
  if (name === 'search_feedback') return runSearch(ctx, SearchArgs.parse(rawArgs));
  const period = PeriodOnlyArgs.parse(rawArgs).period ?? ctx.defaultPeriod;
  switch (name) {
    case 'get_overview':
      return runOverview(ctx, period);
    case 'get_topics':
      return runTopics(ctx, period);
    case 'get_trend':
      return runTrend(ctx, period);
    case 'get_locations':
      return runLocations(ctx, period);
    case 'get_busy_times':
      return runBusyTimes(ctx, period);
    case 'get_churn_risk':
      return runChurn(ctx, period);
    default:
      return { forModel: { error: 'Bilinmeyen araç.' }, fact: null, sources: [] };
  }
}
