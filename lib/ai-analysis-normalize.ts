/**
 * LLM analiz çıktısının şema doğrulaması + sıkıştırma (saf; denetim Y6).
 *
 * Model JSON modunda bile sözleşmeyi bozabilir: skor 0–1 dışına taşar ("85"), etiket sözlük
 * dışı gelir ("very_positive"), dizi yerine nesne/string döner, alanlar eksik kalır. Eski kod
 * `a.sentiment?.score || 0.5` ile GEÇERLİ 0'ı 0.5'e çeviriyor, aralık dışı skorları olduğu
 * gibi yazıyordu (aciliyet > 0.7 bildirimi, churn eşiği ve telafi otomasyonu bu sayılara
 * bakar). Burada her alan:
 *  - sözlüğe zorlanır (bilinmeyen etiket → güvenli varsayılan),
 *  - sayıysa sonlu ve [0,1] aralığına sıkıştırılır (yüzde gibi 1–100 gelen değer /100),
 *  - geçersizse ATLANIR (yazılmaz) — uydurma varsayılan değer üretilmez,
 *  - dizi ve metin uzunlukları tavanlanır (DB ve sonraki promptlar şişmesin).
 */
import type {
  AIActionSuggestion,
  AIAnalysisResult,
  AIEntity,
  AIStatementSentiment,
  AITheme,
} from '@/types';

const SENTIMENTS = ['positive', 'negative', 'neutral'] as const;
const THEME_SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'] as const;
const INTENTS = ['complaint', 'suggestion', 'praise', 'question', 'general'] as const;
const ENTITY_TYPES = ['product', 'person', 'location', 'service', 'facility', 'brand', 'other'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const TOXICITY_CATEGORIES = ['harassment', 'hate', 'profanity', 'threat', 'spam'] as const;

const LIMITS = {
  emotions: 6,
  topics: 10,
  entities: 10,
  themes: 8,
  statements: 12,
  actions: 5,
  label: 40,
  name: 80,
  text: 300,
  summary: 400,
} as const;

/** Sonlu sayıyı [0,1] aralığına indirir; 2–100 arası yüzde yazımını kabul eder. Geçersiz → null. */
export function clampScore(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  let v = n;
  // 2–100 arası değer yüzde yazımıdır ("85" → 0.85); 1 ile 2 arası taşma sayılır ve 1'e kırpılır.
  if (v >= 2 && v <= 100) v = v / 100;
  if (v < 0) v = 0;
  if (v > 1) v = 1;
  return Math.round(v * 1000) / 1000;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Ham LLM JSON'unu `AIAnalysisResult`'a çevirir. `modelUsed`/`version` çağıran tarafından
 * verilir. Duygu etiketi çözülemezse 'neutral' (ama skor uydurulmaz: 0.5 = "belirsiz").
 */
export function normalizeAnalysisPayload(
  raw: unknown,
  meta: { modelUsed: string; version: string }
): AIAnalysisResult {
  const a = obj(raw);
  const sentimentObj = obj(a.sentiment);
  const sentimentLabel =
    oneOf(sentimentObj.label, SENTIMENTS) ?? oneOf(a.sentiment, SENTIMENTS) ?? 'neutral';
  const sentimentScore = clampScore(sentimentObj.score) ?? 0.5;

  const emotions = arr(a.emotions)
    .map((e) => {
      if (typeof e === 'string') {
        const label = text(e, LIMITS.label);
        return label ? { label, score: 0.5 } : null;
      }
      const o = obj(e);
      const label = text(o.label, LIMITS.label);
      return label ? { label, score: clampScore(o.score) ?? 0.5 } : null;
    })
    .filter((e): e is { label: string; score: number } => e !== null)
    .slice(0, LIMITS.emotions);

  const topics = Array.from(
    new Set(
      arr(a.topics)
        .map((t) => {
          if (typeof t === 'string') return text(t, LIMITS.label);
          const o = obj(t);
          return text(o.topic ?? o.label ?? o.name, LIMITS.label);
        })
        .filter((t): t is string => !!t)
    )
  ).slice(0, LIMITS.topics);

  const tox = obj(a.toxicity);
  const toxicity = {
    isToxic: tox.isToxic === true || tox.isToxic === 'true',
    score: clampScore(tox.score) ?? 0,
    categories: Array.from(
      new Set(arr(tox.categories).map((c) => oneOf(c, TOXICITY_CATEGORIES)).filter((c): c is (typeof TOXICITY_CATEGORIES)[number] => !!c))
    ),
  };

  const intentObj = obj(a.intent);
  const intentLabel = oneOf(intentObj.label, INTENTS) ?? oneOf(a.intent, INTENTS);
  const intent = intentLabel ? { label: intentLabel, score: clampScore(intentObj.score) ?? 0.5 } : undefined;

  const entities: AIEntity[] = arr(a.entities)
    .map((e) => {
      const o = obj(e);
      const name = text(o.name, LIMITS.name);
      if (!name) return null;
      const sentiment = oneOf(o.sentiment, SENTIMENTS) ?? undefined;
      return { type: oneOf(o.type, ENTITY_TYPES) ?? 'other', name, ...(sentiment ? { sentiment } : {}) } as AIEntity;
    })
    .filter((e): e is AIEntity => e !== null)
    .slice(0, LIMITS.entities);

  const themes: AITheme[] = arr(a.themes)
    .map((t) => {
      const o = obj(t);
      const theme = text(o.theme, LIMITS.name);
      if (!theme) return null;
      const subTheme = text(o.subTheme, LIMITS.name) ?? undefined;
      return {
        theme,
        ...(subTheme ? { subTheme } : {}),
        sentiment: oneOf(o.sentiment, THEME_SENTIMENTS) ?? 'neutral',
        score: clampScore(o.score) ?? 0.5,
      } as AITheme;
    })
    .filter((t): t is AITheme => t !== null)
    .slice(0, LIMITS.themes);

  const statementSentiments: AIStatementSentiment[] = arr(a.statementSentiments)
    .map((s) => {
      const o = obj(s);
      const statement = text(o.statement, LIMITS.text);
      if (!statement) return null;
      return { statement, sentiment: oneOf(o.sentiment, SENTIMENTS) ?? 'neutral', score: clampScore(o.score) ?? 0.5 };
    })
    .filter((s): s is AIStatementSentiment => s !== null)
    .slice(0, LIMITS.statements);

  const actionSuggestions: AIActionSuggestion[] = arr(a.actionSuggestions)
    .map((s) => {
      const o = obj(s);
      const action = text(o.action, LIMITS.text);
      if (!action) return null;
      const impact = text(o.impact, LIMITS.text) ?? undefined;
      const category = text(o.category, LIMITS.label) ?? undefined;
      return {
        action,
        priority: oneOf(o.priority, PRIORITIES) ?? 'medium',
        ...(impact ? { impact } : {}),
        ...(category ? { category } : {}),
      } as AIActionSuggestion;
    })
    .filter((s): s is AIActionSuggestion => s !== null)
    .slice(0, LIMITS.actions);

  const urgency = clampScore(a.urgency);
  const effortScore = clampScore(a.effortScore);
  const churnRisk = clampScore(a.churnRisk);

  return {
    sentiment: { label: sentimentLabel, score: sentimentScore },
    emotions,
    topics,
    toxicity,
    summary: text(a.summary, LIMITS.summary) ?? undefined,
    intent,
    urgency: urgency ?? undefined,
    effortScore: effortScore ?? undefined,
    churnRisk: churnRisk ?? undefined,
    entities,
    themes,
    statementSentiments,
    actionSuggestions,
    modelUsed: meta.modelUsed,
    version: meta.version,
  };
}
