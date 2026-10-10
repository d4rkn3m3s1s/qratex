/**
 * İçgörü anlatısı — "sayıyı kod hesaplar, LLM anlatır" (§4.4/7).
 *
 *  - LLM'e yalnız deterministik OLGULAR gider (`buildFacts`): metrikler, tema satırları, kural
 *    uyarıları, birleşik öneriler — her biri kısa bir kaynak kimliğiyle (`M1`, `T3`, `A1`, `R2`).
 *    Müşteri metni ve kimliği GİTMEZ.
 *  - Çıktı JSON'u zod ile doğrulanır; her cümle en az bir geçerli kaynağa bağlanmak ZORUNDA.
 *    Olgularda geçmeyen bir SAYI içeren cümle atılır (uydurma sayı yapısal olarak gösterilemez).
 *  - Üretim yalnız POST ile (kullanıcı ister); mevcut AI geçidi `runChatCompletion`: bayi AI ana
 *    anahtarı, dakikalık + günlük tavan, prompt-injection denetimi ve kullanım kaydı oradan.
 *  - Sonuç `AIInsightReport` satırına yazılır (dönem anahtarı + dil); GET yalnız okur.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import { isAIConfigured, runChatCompletion } from '@/lib/ai-engine';
import { isDealerAiEnabled } from '@/lib/ai-policy';
import { UNTRUSTED_DATA_RULE, sanitizeContextLine } from '@/lib/ai-prompt-safety';
import { narrativePeriodKey } from './params';
import type {
  AiAvailability,
  InsightsAggregates,
  InsightsMetrics,
  InsightsQuery,
  NarrativeLine,
  NarrativeRef,
  NarrativeView,
} from './types';

/** Aynı dönem için yeniden üretim soğuması (veri değişmediyse). */
export const NARRATIVE_COOLDOWN_MS = 10 * 60_000;
export const NARRATIVE_MIN_SAMPLE = 3;
const MAX_LINE_CHARS = 360;
const REPORT_TYPE_PREFIX = 'insights_v2_';

export class NarrativeUnavailableError extends Error {
  readonly reason: 'ai_off' | 'insufficient' | 'invalid_output';
  constructor(reason: NarrativeUnavailableError['reason'], message: string) {
    super(message);
    this.name = 'NarrativeUnavailableError';
    this.reason = reason;
  }
}

export class NarrativeCooldownError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super('Anlatı az önce üretildi; veri değişmedi. Biraz sonra tekrar deneyin.');
    this.name = 'NarrativeCooldownError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function reportType(locale: 'tr' | 'en'): string {
  return `${REPORT_TYPE_PREFIX}${locale}`;
}

/* ───────────────────────── AI erişilebilirliği ───────────────────────── */

/** Sağlayıcı + modül + bayinin AI ana anahtarı (fail-closed). */
export async function aiAvailability(dealerId: string): Promise<AiAvailability> {
  if (!isAIConfigured()) return 'not_configured';
  try {
    const controls = (await getModuleControls()) as Record<string, boolean | undefined>;
    if (controls.ai_features === false) return 'module_off';
  } catch {
    return 'module_off';
  }
  try {
    return (await isDealerAiEnabled(dealerId)) ? 'ok' : 'dealer_off';
  } catch {
    return 'dealer_off';
  }
}

/* ───────────────────────── Olgular ───────────────────────── */

export interface Facts {
  text: string;
  /** Kısa kimlik → kaynak. */
  refs: Map<string, NarrativeRef>;
  /** Olgulardaki bütün sayılar (normalize). */
  numbers: Set<string>;
}

const METRIC_NAMES: Record<keyof InsightsMetrics, string> = {
  volume: 'Geri bildirim sayısı',
  avgRating: 'Ortalama puan (5 üzerinden)',
  csat: 'Memnuniyet oranı (4-5 yıldız, %)',
  negativeRate: 'Olumsuz oranı (%)',
  responseRate: 'Yanıtlanma oranı (metinli kayıtlarda, %)',
  highChurn: 'Kayıp riski yüksek kayıt sayısı',
  nps: 'NPS (gerçek 0-10 tavsiye yanıtlarından)',
};

const METRIC_NAMES_EN: Record<keyof InsightsMetrics, string> = {
  volume: 'Feedback count',
  avgRating: 'Average rating (out of 5)',
  csat: 'Satisfaction rate (4-5 stars, %)',
  negativeRate: 'Negative rate (%)',
  responseRate: 'Reply rate (text feedback, %)',
  highChurn: 'High churn-risk records',
  nps: 'NPS (real 0-10 recommendation answers)',
};

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function normalizeNumber(raw: string): string {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return raw;
  return String(Math.abs(Math.round(n * 100) / 100));
}

export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(normalizeNumber);
}

/** Deterministik olgu metni + kaynak eşlemesi. Saf (test edilir). */
export function buildFacts(agg: InsightsAggregates, query: InsightsQuery, locale: 'tr' | 'en'): Facts {
  const refs = new Map<string, NarrativeRef>();
  const lines: string[] = [];
  const names = locale === 'en' ? METRIC_NAMES_EN : METRIC_NAMES;
  lines.push(
    `Dönem: ${query.range.from} – ${query.range.to}` +
      (query.compareRange ? ` (karşılaştırma: ${query.compareRange.from} – ${query.compareRange.to})` : ' (karşılaştırma yok)')
  );
  lines.push(
    `Örneklem: ${agg.sample.total} kayıt (QR ${agg.sample.qr}, tüketim yorumu ${agg.sample.consumption}); metinli ${agg.sample.withText}, AI analizli ${agg.sample.analyzed}`
  );

  let i = 0;
  for (const key of Object.keys(names) as Array<keyof InsightsMetrics>) {
    const m = agg.metrics[key];
    if (!m || m.value == null) continue;
    const id = `M${++i}`;
    refs.set(id, { kind: 'metric', key, label: names[key] });
    const delta = m.delta ? `; önceki döneme göre değişim ${m.delta.value > 0 ? '+' : ''}${fmt(m.delta.value)}${m.delta.kind === 'points' ? ' puan' : m.delta.kind === 'percent' ? '%' : ''}` : '';
    const n = m.n != null ? `; n=${m.n}` : '';
    lines.push(`[${id}] ${names[key]}: ${fmt(m.value)}${delta}${n}`);
  }

  i = 0;
  for (const t of agg.themes.slice(0, 10)) {
    const label = sanitizeContextLine(t.label, 60);
    if (!label) continue;
    const id = `T${++i}`;
    refs.set(id, { kind: 'theme', key: t.key, label: t.label });
    const parts = [
      `${t.count} kayıt${t.prevCount != null ? ` (önceki dönem ${t.prevCount})` : ''}`,
      t.avgRating != null ? `bahsedenlerin ort. puanı ${fmt(t.avgRating)}` : null,
      `olumsuz %${fmt(t.negativeShare)}, olumlu %${fmt(t.positiveShare)}`,
      t.ratingGap != null ? `puan farkı ${t.ratingGap > 0 ? '+' : ''}${fmt(t.ratingGap)} (ilişki, neden değil)` : null,
    ].filter(Boolean);
    lines.push(`[${id}] Tema "${label}": ${parts.join(', ')}`);
  }

  i = 0;
  for (const a of agg.alerts.slice(0, 6)) {
    const id = `A${++i}`;
    refs.set(id, { kind: 'alert', key: a.id, label: a.kind });
    const params = Object.entries(a.params)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? fmt(v) : sanitizeContextLine(v, 60) ?? '-'}`)
      .join(', ');
    lines.push(`[${id}] Kural uyarısı ${a.kind} (önem ${a.severity}): ${params}`);
  }

  i = 0;
  for (const r of agg.recommendations.slice(0, 6)) {
    const text = sanitizeContextLine(r.text, 160);
    if (!text) continue;
    const id = `R${++i}`;
    refs.set(id, { kind: 'rec', key: r.id, label: r.text });
    lines.push(`[${id}] Kayıtlardan çıkan öneri (öncelik ${r.priority}, ${r.count} kayıtta): "${text}"`);
  }

  const text = lines.join('\n');
  // Yuvarlanmış yazımlar da geçerli ("%57,1" → "%57", "4,21" → "4,2").
  const numbers = new Set<string>();
  for (const n of numbersIn(text)) {
    numbers.add(n);
    const v = Number(n);
    if (Number.isFinite(v)) {
      numbers.add(String(Math.round(v)));
      numbers.add(String(Math.round(v * 10) / 10));
    }
  }
  return { text, refs, numbers };
}

/* ───────────────────────── Prompt + doğrulama ───────────────────────── */

export function systemPrompt(locale: 'tr' | 'en'): string {
  const lang = locale === 'en' ? 'İngilizce (English)' : 'Türkçe';
  return `Sen bir kafe/restoran işletmesine müşteri deneyimi özeti yazan bir analistsin.
Sana kaynak kimlikli OLGULAR verilecek: [M#] metrik, [T#] tema, [A#] kural uyarısı, [R#] kayıtlardan çıkan öneri.
Kurallar:
- YALNIZ olgulardaki sayıları ve adları kullan. Yeni sayı, yüzde, skor, tahmin ya da neden-sonuç iddiası UYDURMA.
- "Puan farkı" bir ilişkidir; "neden olur" deme.
- Her cümle, dayandığı olguların kimliklerini "refs" alanında listelemeli (ör. ["T1","M2"]).
- Veri azsa (örneklem 10'dan küçükse) bunu açıkça söyle ve kesin yargıdan kaçın.
- Dil: ${lang}. Düz metin; markdown, emoji, başlık yok.
Çıktı YALNIZ şu JSON:
{"summary":{"text":"2-3 cümle genel durum","refs":["M1"]},
 "highlights":[{"text":"tek cümle önemli bulgu","refs":["T1"]}],
 "actions":[{"text":"tek cümle somut adım","refs":["R1","T1"],"priority":"high|medium|low"}]}
En çok 3 highlight ve 3 action.
${UNTRUSTED_DATA_RULE}`;
}

const LineSchema = z.object({ text: z.string().min(1).max(2000), refs: z.array(z.string().max(8)).max(8).default([]) });
const OutputSchema = z.object({
  summary: LineSchema,
  highlights: z.array(LineSchema).max(6).default([]),
  actions: z.array(LineSchema.extend({ priority: z.enum(['high', 'medium', 'low']).catch('medium') })).max(6).default([]),
});

export function sanitizeLineText(raw: string): string {
  const s = raw
    .replace(/<[^>]*>/g, '')
    .replace(/[*_#`>|]+/g, '')
    .replace(/\[(?:[MTAR]\d+)\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > MAX_LINE_CHARS ? `${s.slice(0, MAX_LINE_CHARS - 1).trimEnd()}…` : s;
}

/** Küçük sayma kelimeleri ("3 adım") serbest; geri kalan her sayı olgularda geçmeli. */
function numbersGrounded(text: string, facts: Facts): boolean {
  return numbersIn(text).every((n) => facts.numbers.has(n) || /^[1-5]$/.test(n));
}

function groundLine(raw: { text: string; refs: string[] }, facts: Facts): NarrativeLine | null {
  const text = sanitizeLineText(raw.text);
  if (!text) return null;
  const refs: NarrativeRef[] = [];
  const seen = new Set<string>();
  for (const id of raw.refs) {
    const ref = facts.refs.get(id.trim().toUpperCase());
    if (!ref) continue;
    const k = `${ref.kind}:${ref.key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    refs.push(ref);
  }
  if (refs.length === 0) return null;
  if (!numbersGrounded(text, facts)) return null;
  return { text, refs };
}

/** LLM çıktısını doğrular ve kaynaklara bağlar. Özet geçersizse null. Saf (test edilir). */
export function parseNarrativeOutput(
  content: string,
  facts: Facts
): Pick<NarrativeView, 'summary' | 'highlights' | 'actions'> | null {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    const m = /\{[\s\S]*\}/.exec(content);
    if (!m) return null;
    try {
      json = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  const parsed = OutputSchema.safeParse(json);
  if (!parsed.success) return null;
  const summary = groundLine(parsed.data.summary, facts);
  if (!summary) return null;
  const highlights = parsed.data.highlights
    .map((l) => groundLine(l, facts))
    .filter((l): l is NarrativeLine => !!l)
    .slice(0, 3);
  const actions = parsed.data.actions
    .map((l) => {
      const g = groundLine(l, facts);
      return g ? { ...g, priority: l.priority } : null;
    })
    .filter((l): l is NarrativeLine & { priority: 'high' | 'medium' | 'low' } => !!l)
    .slice(0, 3);
  return { summary, highlights, actions };
}

/* ───────────────────────── Saklama ───────────────────────── */

interface StoredNarrative {
  v: 2;
  summary: NarrativeLine;
  highlights: NarrativeLine[];
  actions: Array<NarrativeLine & { priority: 'high' | 'medium' | 'low' }>;
  basedOn: number;
  model: string | null;
}

const RefSchema = z.object({ kind: z.enum(['metric', 'theme', 'alert', 'rec']), key: z.string(), label: z.string() });
const StoredLine = z.object({ text: z.string(), refs: z.array(RefSchema) });
const StoredSchema = z.object({
  v: z.literal(2),
  summary: StoredLine,
  highlights: z.array(StoredLine),
  actions: z.array(StoredLine.extend({ priority: z.enum(['high', 'medium', 'low']) })),
  basedOn: z.number(),
  model: z.string().nullable().optional(),
});

function toView(
  stored: z.infer<typeof StoredSchema>,
  generatedAt: Date,
  currentTotal: number,
  locale: 'tr' | 'en',
  now: number
): NarrativeView {
  const stale = stored.basedOn !== currentTotal;
  const until = generatedAt.getTime() + NARRATIVE_COOLDOWN_MS;
  return {
    summary: stored.summary,
    highlights: stored.highlights,
    actions: stored.actions,
    generatedAt: generatedAt.toISOString(),
    basedOn: stored.basedOn,
    stale,
    cooldownUntil: !stale && until > now ? new Date(until).toISOString() : null,
    locale,
  };
}

export async function readNarrative(
  dealerId: string,
  query: InsightsQuery,
  locale: 'tr' | 'en',
  currentTotal: number,
  now: number = Date.now()
): Promise<NarrativeView | null> {
  const row = await prisma.aIInsightReport.findUnique({
    where: { dealerId_period_type: { dealerId, period: narrativePeriodKey(query), type: reportType(locale) } },
    select: { keyMetrics: true, generatedAt: true },
  });
  if (!row) return null;
  const parsed = StoredSchema.safeParse(row.keyMetrics);
  if (!parsed.success) return null;
  return toView(parsed.data, row.generatedAt, currentTotal, locale, now);
}

/**
 * Anlatıyı üretir ve saklar. `regenerate` yoksa saklı anlatı döner (aynı dönem için tekrar
 * token yakılmaz). Veri değişmeden soğuma içinde yeniden üretim → `NarrativeCooldownError`.
 */
export async function generateNarrative(input: {
  dealerId: string;
  query: InsightsQuery;
  agg: InsightsAggregates;
  locale: 'tr' | 'en';
  regenerate?: boolean;
  now?: number;
}): Promise<NarrativeView> {
  const { dealerId, query, agg, locale } = input;
  const now = input.now ?? Date.now();
  const existing = await readNarrative(dealerId, query, locale, agg.sample.total, now);
  if (existing && !input.regenerate) return existing;
  if (existing && existing.cooldownUntil) {
    throw new NarrativeCooldownError(new Date(existing.cooldownUntil).getTime() - now);
  }
  if (agg.sample.total < NARRATIVE_MIN_SAMPLE) {
    throw new NarrativeUnavailableError('insufficient', `Anlatı için dönemde en az ${NARRATIVE_MIN_SAMPLE} geri bildirim gerekir.`);
  }
  if ((await aiAvailability(dealerId)) !== 'ok') {
    throw new NarrativeUnavailableError('ai_off', 'AI özellikleri şu an bu işletme için kullanılamıyor.');
  }

  const facts = buildFacts(agg, query, locale);
  const result = await runChatCompletion({
    system: systemPrompt(locale),
    user: `OLGULAR:\n${facts.text}`,
    dealerId,
    task: 'insights',
    temperature: 0.2,
    maxTokens: 700,
    jsonMode: true,
  });
  const out = result ? parseNarrativeOutput(result.content, facts) : null;
  if (!out) throw new NarrativeUnavailableError('invalid_output', 'AI bu kez kaynaklara dayalı bir anlatı üretemedi. Tekrar deneyin.');

  const stored: StoredNarrative = { v: 2, ...out, basedOn: agg.sample.total, model: result?.modelUsed ?? null };
  const avgDelta = agg.metrics.avgRating.delta?.value ?? 0;
  const generatedAt = new Date(now);
  const data = {
    overallScore: agg.metrics.csat.value ?? 0,
    trend: avgDelta > 0.05 ? 'up' : avgDelta < -0.05 ? 'down' : 'stable',
    trendValue: avgDelta,
    totalFeedbacks: agg.sample.total,
    summary: out.summary.text,
    strengths: out.highlights as unknown as object,
    weaknesses: [] as unknown as object,
    recommendations: out.actions as unknown as object,
    keyMetrics: stored as unknown as object,
    generatedAt,
  };
  const period = narrativePeriodKey(query);
  const type = reportType(locale);
  await prisma.aIInsightReport.upsert({
    where: { dealerId_period_type: { dealerId, period, type } },
    create: { dealerId, period, type, ...data },
    update: data,
  });
  return toView(StoredSchema.parse(stored), generatedAt, agg.sample.total, locale, now);
}
