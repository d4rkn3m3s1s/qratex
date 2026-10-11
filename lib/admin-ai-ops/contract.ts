/**
 * /admin/ai — AI Operasyon Merkezi: istemci + sunucu ortak sözleşmesi (saf; prisma yok).
 *
 * Eski iki sayfanın (/admin/ai-dashboard, /admin/ai-detailed) yerine geçer. İlkeler:
 *  - Her sayı bir DÖNEME bağlıdır (`period`), tek sorgu katmanından gelir ve `deletedAt: null`.
 *  - Sayfa açılışında LLM çağrısı YOK (yalnız asistan, kullanıcı sorunca).
 *  - "Veri yok" `null` ile taşınır; asla varsayılan %100 / 0 gösterilmez.
 *  - Eşikler ve etiketler TEK yerde (bu dosya).
 */
import { z } from 'zod';

// ───────────────────────────── Dönem ─────────────────────────────

export const AI_OPS_PERIODS = ['24h', '7d', '30d', '90d'] as const;
export type AiOpsPeriod = (typeof AI_OPS_PERIODS)[number];
export const DEFAULT_AI_OPS_PERIOD: AiOpsPeriod = '7d';

export const PERIOD_LABEL: Record<AiOpsPeriod, string> = {
  '24h': 'Son 24 saat',
  '7d': 'Son 7 gün',
  '30d': 'Son 30 gün',
  '90d': 'Son 90 gün',
};

const PERIOD_MS: Record<AiOpsPeriod, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 86400_000,
  '30d': 30 * 86400_000,
  '90d': 90 * 86400_000,
};

export type PeriodWindow = {
  period: AiOpsPeriod;
  from: Date;
  to: Date;
  /** Önceki eşit uzunlukta dönem (delta için). */
  prevFrom: Date;
  prevTo: Date;
  /** Zaman serisi kovası: 24 saatte saatlik, diğerlerinde İstanbul günü. */
  bucket: 'hour' | 'day';
};

export function periodWindow(period: AiOpsPeriod, now: Date = new Date()): PeriodWindow {
  const len = PERIOD_MS[period];
  const to = new Date(now.getTime());
  const from = new Date(to.getTime() - len);
  return { period, from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, bucket: period === '24h' ? 'hour' : 'day' };
}

export const periodSchema = z.enum(AI_OPS_PERIODS).catch(DEFAULT_AI_OPS_PERIOD);
export const periodQuerySchema = z.object({ period: periodSchema.default(DEFAULT_AI_OPS_PERIOD) });

// ───────────────────────────── Eşikler (tek kaynak) ─────────────────────────────

/**
 * Aciliyet kovaları. Prompt çapaları 0.3=Düşük, 0.5=Orta, 0.7=Yüksek, 1.0=Kritik (lib/ai-engine).
 * Sınırlar çapaların ORTASINA konur; eski kod sınırı çapanın tam üstüne koyduğu için 0.7
 * "Kritik"e düşüyordu (ai-detailed Bulgu 2).
 */
export const URGENCY_BUCKETS = [
  { key: 'low', label: 'Düşük', min: 0, max: 0.4 },
  { key: 'medium', label: 'Orta', min: 0.4, max: 0.6 },
  { key: 'high', label: 'Yüksek', min: 0.6, max: 0.85 },
  { key: 'critical', label: 'Kritik', min: 0.85, max: Infinity },
] as const;
export type UrgencyBucket = (typeof URGENCY_BUCKETS)[number]['key'];

export const CHURN_BUCKETS = [
  { key: 'safe', label: 'Güvende', min: 0, max: 0.25 },
  { key: 'low', label: 'Düşük', min: 0.25, max: 0.5 },
  { key: 'medium', label: 'Orta', min: 0.5, max: 0.75 },
  { key: 'high', label: 'Yüksek', min: 0.75, max: Infinity },
] as const;
export type ChurnBucket = (typeof CHURN_BUCKETS)[number]['key'];

/** "Dikkat" sayaçları: yüksek + kritik aciliyet, yüksek kayıp riski. */
export const URGENT_MIN = 0.6;
export const CHURN_HIGH_MIN = 0.75;

export function urgencyBucket(v: number | null | undefined): UrgencyBucket | null {
  if (v == null || !Number.isFinite(v)) return null;
  return (URGENCY_BUCKETS.find((b) => v >= b.min && v < b.max) ?? URGENCY_BUCKETS[URGENCY_BUCKETS.length - 1]).key;
}

export function churnBucket(v: number | null | undefined): ChurnBucket | null {
  if (v == null || !Number.isFinite(v)) return null;
  return (CHURN_BUCKETS.find((b) => v >= b.min && v < b.max) ?? CHURN_BUCKETS[CHURN_BUCKETS.length - 1]).key;
}

/** Eski "Veri doldur" düğmesinin yazdığı sezgisel (gerçek AI olmayan) kayıtların model adı. */
export const SYNTHETIC_MODEL = 'bootstrap-heuristic';

// ───────────────────────────── Sağlık ─────────────────────────────

export type HealthLevel = 'ok' | 'degraded' | 'down' | 'idle' | 'unconfigured';

/**
 * AI motoru sağlık sınıfı. Çağrı yoksa "idle" — %100 başarı UYDURULMAZ (dashboard B3).
 * %20 üstü hata ya da tüm çağrılar başarısızsa "down"; %5 üstü ya da p95 > 8 sn "degraded".
 */
export function classifyHealth(input: { configured: boolean; calls: number; failures: number; p95Ms: number | null }): HealthLevel {
  if (!input.configured) return 'unconfigured';
  if (input.calls <= 0) return 'idle';
  const rate = input.failures / input.calls;
  if (input.failures === input.calls || rate > 0.2) return 'down';
  if (rate > 0.05 || (input.p95Ms != null && input.p95Ms > 8000)) return 'degraded';
  return 'ok';
}

export const HEALTH_META: Record<HealthLevel, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  ok: { label: 'Sağlıklı', tone: 'success' },
  degraded: { label: 'Yavaş / hatalı', tone: 'warning' },
  down: { label: 'Kesinti', tone: 'danger' },
  idle: { label: 'Bu dönemde çağrı yok', tone: 'neutral' },
  unconfigured: { label: 'Sağlayıcı yapılandırılmamış', tone: 'danger' },
};

/** Oran (yüzde, 1 ondalık); payda 0 ise null. */
export function pct(part: number, whole: number): number | null {
  if (!whole || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** Önceki döneme göre yüzde değişim; önceki 0 ise null (sonsuz artış gösterilmez). */
export function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** Model adından tür: gerçek LLM, yerel yedek, sezgisel (sahte) kayıt. */
export type ModelKind = 'llm' | 'fallback' | 'synthetic' | 'unknown';
export function modelKind(model: string | null | undefined): ModelKind {
  if (!model) return 'unknown';
  if (model === SYNTHETIC_MODEL) return 'synthetic';
  if (/fallback|local/i.test(model)) return 'fallback';
  return 'llm';
}
export const MODEL_KIND_LABEL: Record<ModelKind, string> = {
  llm: 'Yapay zekâ',
  fallback: 'Yerel yedek',
  synthetic: 'Sezgisel (sahte)',
  unknown: 'Bilinmiyor',
};

// ───────────────────────────── Etiket sözlükleri ─────────────────────────────

export const ACTION_LABEL: Record<string, string> = {
  analyze: 'Geri bildirim analizi',
  chat_completion: 'Sohbet',
  ask_ai: 'Asistan sorusu',
  insights: 'İçgörü raporu',
  theme_cluster: 'Tema kümeleme',
  suggest_reply: 'Yanıt önerisi',
  auto_reply: 'Otomatik yanıt',
  embedding: 'Vektör (embedding)',
  dealer_learning: 'Bayi öğrenmesi',
  system_learning: 'Sistem öğrenmesi',
  qra_chat: 'QRA sohbet',
  bulk_analyze: 'Toplu analiz',
  chat: 'Sohbet',
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;

export const SENTIMENT_LABEL: Record<string, string> = {
  positive: 'Olumlu',
  neutral: 'Nötr',
  negative: 'Olumsuz',
  mixed: 'Karışık',
};
export const INTENT_LABEL: Record<string, string> = {
  complaint: 'Şikâyet',
  suggestion: 'Öneri',
  praise: 'Övgü',
  question: 'Soru',
  general: 'Genel',
};
export const ENTITY_TYPE_LABEL: Record<string, string> = {
  product: 'Ürün',
  person: 'Kişi',
  location: 'Yer',
  service: 'Hizmet',
  brand: 'Marka',
  other: 'Diğer',
};
export const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Kritik',
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};
export const EMOTION_LABEL: Record<string, string> = {
  happy: 'Mutlu',
  joy: 'Neşeli',
  satisfied: 'Memnun',
  grateful: 'Minnettar',
  excited: 'Heyecanlı',
  surprised: 'Şaşkın',
  neutral: 'Nötr',
  frustrated: 'Hayal kırıklığı',
  disappointed: 'Hayal kırıklığı',
  angry: 'Kızgın',
  sad: 'Üzgün',
  confused: 'Kafası karışık',
  anxious: 'Endişeli',
  impatient: 'Sabırsız',
};
export const labelOf = (dict: Record<string, string>, key: string | null | undefined, fallback = '—') =>
  key ? dict[key] ?? key : fallback;

// ───────────────────────────── Yanıt tipleri ─────────────────────────────

export type SeriesPoint = { at: string; calls: number; failures: number; tokens: number };

export type UsageTotals = {
  calls: number;
  failures: number;
  /** Yüzde (0-100), çağrı yoksa null. */
  errorRate: number | null;
  inputTokens: number;
  outputTokens: number;
  /** Başarılı çağrılarda gecikme yüzdelikleri (ms); veri yoksa null. */
  p50Ms: number | null;
  p95Ms: number | null;
  fallbackCalls: number;
};

export type UsageRow = { key: string; label: string; calls: number; failures: number; errorRate: number | null; tokens: number; p95Ms: number | null };

export type BudgetGauge = { key: string; label: string; used: number; limit: number; percent: number };

export type UsageReport = {
  period: AiOpsPeriod;
  generatedAt: string;
  provider: { configured: boolean; provider: string; model: string | null };
  health: HealthLevel;
  totals: UsageTotals;
  previous: UsageTotals;
  series: SeriesPoint[];
  bucket: 'hour' | 'day';
  byAction: UsageRow[];
  byModel: UsageRow[];
};

export type BudgetReport = {
  generatedAt: string;
  /** Muhafızın gün sınırı (UTC gece yarısı = İstanbul 03:00). */
  dayStartsAt: string;
  platform: BudgetGauge[];
  dealerLimit: number;
  /** Bugün en çok token harcayan bayiler (kota yüzdesiyle). */
  topDealers: Array<{ dealerId: string; name: string; used: number; percent: number }>;
};

export type BacklogSummary = {
  generatedAt: string;
  /** Otomatik kuyruğun (ai-retry) seçebileceği bekleyenler. */
  eligible: number;
  oldestEligibleAt: string | null;
  /** Deneme hakkı bitmiş (MAX_AI_ATTEMPTS), hâlâ analizsiz. */
  exhausted: number;
  /** Bayisi AI'ı ya da otomatik analizi kapatmış olduğu için beklemeyenler. */
  blockedByPolicy: number;
  /** Kuyruk penceresinden (30 gün) eski, hiç analiz edilmemiş. */
  stale: number;
  /** Gerçek bayilerde sezgisel (sahte) sinyal taşıyan kayıtlar. */
  synthetic: number;
  maxAttempts: number;
  lookbackDays: number;
};

export const PENDING_STATES = ['eligible', 'exhausted', 'blocked', 'stale'] as const;
export type PendingState = (typeof PENDING_STATES)[number];
export const PENDING_STATE_LABEL: Record<PendingState, string> = {
  eligible: 'Kuyrukta',
  exhausted: 'Hak bitti',
  blocked: 'Bayi AI kapalı',
  stale: 'Pencere dışı',
};

export const pendingQuerySchema = z.object({
  state: z.enum(PENDING_STATES).catch('eligible').default('eligible'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(10).max(100).catch(25).default(25),
});
export type PendingQuery = z.infer<typeof pendingQuerySchema>;

export type PendingRow = {
  id: string;
  dealerId: string;
  dealerName: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  rating: number;
  preview: string;
};
export type PendingPage = { items: PendingRow[]; total: number; page: number; size: number };

export const backlogActionSchema = z.discriminatedUnion('action', [
  /** Kuyruktan en eski N kaydı şimdi işle (zaman bütçeli). */
  z.object({ action: z.literal('process'), limit: z.number().int().min(1).max(15).default(10) }),
  /** Tek kaydı yeniden dene (hakkı bittiyse bir hak daha verilir). */
  z.object({ action: z.literal('retry_one'), feedbackId: z.string().min(1).max(191) }),
  /** Hakkı bitmiş (pencere içi) kayıtların deneme sayacını sıfırla → kuyruğa geri dönerler. */
  z.object({ action: z.literal('requeue_exhausted'), reason: z.string().trim().min(5).max(300) }),
  /** Gerçek bayilerdeki sezgisel sinyalleri temizle → gerçek analiz kuyruğuna girerler. */
  z.object({ action: z.literal('clear_synthetic'), reason: z.string().trim().min(5).max(300) }),
]);
export type BacklogAction = z.infer<typeof backlogActionSchema>;

export type ProcessResult = {
  processed: number;
  upgraded: number;
  stillFallback: number;
  skipped: number;
  failed: number;
  timeouts: number;
  stoppedByBudget: boolean;
  tookMs: number;
};

export type BacklogActionResult =
  | { action: 'process'; result: ProcessResult }
  | { action: 'retry_one'; outcome: 'upgraded' | 'fallback' | 'skipped' | 'failed' | 'timeout'; reason?: string }
  | { action: 'requeue_exhausted'; count: number }
  | { action: 'clear_synthetic'; count: number };

// ── Hatalar ──

export const errorsQuerySchema = z.object({
  period: periodSchema.default(DEFAULT_AI_OPS_PERIOD),
  action: z.string().trim().max(40).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(10).max(100).catch(25).default(25),
});
export type ErrorsQuery = z.infer<typeof errorsQuerySchema>;
export type ErrorRow = { id: string; at: string; action: string; model: string; dealerId: string | null; dealerName: string | null; latencyMs: number; error: string };
export type ErrorsPage = { items: ErrorRow[]; total: number; page: number; size: number };

// ── Bayiler ──

export const DEALER_AI_FILTERS = ['all', 'off', 'auto_off', 'near_limit'] as const;
export type DealerAiFilter = (typeof DEALER_AI_FILTERS)[number];
export const DEALER_AI_FILTER_LABEL: Record<DealerAiFilter, string> = {
  all: 'Tüm bayiler',
  off: 'AI kapalı',
  auto_off: 'Otomatik analiz kapalı',
  near_limit: 'Kotanın %80’i üstü (bugün)',
};
export const DEALER_AI_SORTS = ['usage', 'name', 'failures', 'today'] as const;
export type DealerAiSort = (typeof DEALER_AI_SORTS)[number];

export const dealersQuerySchema = z.object({
  period: periodSchema.default(DEFAULT_AI_OPS_PERIOD),
  filter: z.enum(DEALER_AI_FILTERS).catch('all').default('all'),
  sort: z.enum(DEALER_AI_SORTS).catch('usage').default('usage'),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(10).max(100).catch(25).default(25),
});
export type DealersQuery = z.infer<typeof dealersQuerySchema>;

export type DealerAiRow = {
  id: string;
  name: string;
  isDemo: boolean;
  aiEnabled: boolean;
  autoAnalyze: boolean;
  /** Ayar satırı yoksa şema varsayılanı (ikisi de açık). */
  source: 'settings' | 'default';
  calls: number;
  failures: number;
  tokens: number;
  todayTokens: number;
  todayPercent: number;
  pending: number;
};
export type DealersPage = { items: DealerAiRow[]; total: number; page: number; size: number; dealerLimit: number; counts: { off: number; autoOff: number } };

export const dealerAiPatchSchema = z
  .object({
    dealerId: z.string().min(1).max(191),
    aiEnabled: z.boolean().optional(),
    autoAnalyze: z.boolean().optional(),
    reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(300),
  })
  .refine((v) => v.aiEnabled !== undefined || v.autoAnalyze !== undefined, { message: 'Değişecek bir alan seçin.', path: ['aiEnabled'] });
export type DealerAiPatch = z.infer<typeof dealerAiPatchSchema>;

// ── Sinyaller (müşteri sesi) ──

export type Dist = Array<{ key: string; label: string; count: number; percent: number | null }>;

export type SignalsReport = {
  period: AiOpsPeriod;
  generatedAt: string;
  coverage: { total: number; withText: number; analyzed: number; synthetic: number; pending: number; analyzedPercent: number | null };
  attention: { urgent: number; churnHigh: number; toxic: number; negative: number; prev: { urgent: number; churnHigh: number; toxic: number; negative: number } };
  averages: { urgency: number | null; effort: number | null; churn: number | null; rating: number | null; n: number };
  sentiment: Dist;
  intent: Dist;
  urgency: Dist;
  churn: Dist;
  rating: Array<{ rating: number; count: number; positive: number; neutral: number; negative: number }>;
  themes: Array<{ theme: string; count: number; positive: number | null; negative: number | null; avgRating: number | null; dealers: number }>;
  entities: Array<{ name: string; type: string; count: number; positive: number | null; negative: number | null }>;
  emotions: Array<{ emotion: string; label: string; count: number }>;
  actions: Array<{ category: string; count: number; dealers: number; topPriority: string; examples: string[] }>;
  riskyDealers: Array<{ dealerId: string; name: string; feedbacks: number; negativePercent: number | null; urgent: number; churnHigh: number; avgRating: number | null; risk: number }>;
  recent: Array<{ id: string; at: string; dealerName: string; rating: number; sentiment: string | null; intent: string | null; urgency: number | null; model: string | null; kind: ModelKind; preview: string }>;
};

/** Bayi risk skoru (0-100): olumsuz oran, acil ve kayıp riski yoğunluğu, düşük puan. Saf. */
export function dealerRiskScore(r: { feedbacks: number; negative: number; urgent: number; churnHigh: number; avgRating: number | null }): number {
  if (r.feedbacks <= 0) return 0;
  const neg = r.negative / r.feedbacks;
  const urg = r.urgent / r.feedbacks;
  const churn = r.churnHigh / r.feedbacks;
  const rating = r.avgRating == null ? 0 : Math.max(0, (5 - r.avgRating) / 4);
  // Hacim güveni: 20+ kayıtta tam ağırlık.
  const confidence = Math.min(1, r.feedbacks / 20);
  return Math.round((neg * 35 + urg * 25 + churn * 25 + rating * 15) * confidence);
}

export const SIGNAL_KINDS = ['urgent', 'churn', 'toxic', 'negative', 'intent', 'theme', 'entity', 'urgency', 'rating'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const signalFeedbacksQuerySchema = z
  .object({
    period: periodSchema.default(DEFAULT_AI_OPS_PERIOD),
    signal: z.enum(SIGNAL_KINDS),
    value: z.string().trim().max(160).optional(),
    dealerId: z.string().trim().max(191).optional(),
    page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
    size: z.coerce.number().int().min(10).max(50).catch(20).default(20),
  })
  .refine((v) => !['intent', 'theme', 'entity', 'urgency', 'rating'].includes(v.signal) || !!v.value, { message: 'Bu sinyal için değer gerekli.', path: ['value'] });
export type SignalFeedbacksQuery = z.infer<typeof signalFeedbacksQuerySchema>;

export type SignalFeedbackRow = {
  id: string;
  at: string;
  dealerId: string;
  dealerName: string;
  rating: number;
  sentiment: string | null;
  intent: string | null;
  urgency: number | null;
  churnRisk: number | null;
  isToxic: boolean;
  kind: ModelKind;
  preview: string;
};
export type SignalFeedbacksPage = { items: SignalFeedbackRow[]; total: number; page: number; size: number; title: string };

export function signalTitle(signal: SignalKind, value?: string): string {
  switch (signal) {
    case 'urgent':
      return 'Yüksek ve kritik aciliyet';
    case 'churn':
      return 'Yüksek kayıp riski';
    case 'toxic':
      return 'Toksik işaretli';
    case 'negative':
      return 'Olumsuz duygu';
    case 'intent':
      return `Niyet: ${labelOf(INTENT_LABEL, value)}`;
    case 'theme':
      return `Tema: ${value ?? ''}`;
    case 'entity':
      return `Varlık: ${value ?? ''}`;
    case 'urgency':
      return `Aciliyet: ${URGENCY_BUCKETS.find((b) => b.key === value)?.label ?? value ?? ''}`;
    case 'rating':
      return `${value ?? ''} yıldız`;
  }
}

// ── Asistan ──

export const assistantSchema = z.object({
  question: z.string().trim().min(2, 'Soru en az 2 karakter olmalı.').max(1000),
  period: periodSchema.default('30d'),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(12)
    .default([]),
});
export type AssistantInput = z.infer<typeof assistantSchema>;
export type AssistantAnswer = { answer: string; period: AiOpsPeriod; sources: string[]; generatedAt: string };

/** Bağlamın gerçekten karşılayabildiği sorular (bayi sıralaması bağlamda var). */
export const ASSISTANT_SUGGESTIONS = [
  'Bu dönem en çok olumsuz geri bildirim alan bayiler hangileri?',
  'Müşteriler en çok hangi konulardan şikâyet ediyor?',
  'Aciliyeti yüksek geri bildirimlerde ortak bir neden var mı?',
  'Kayıp riski taşıyan müşteriler için ne önerirsin?',
] as const;

/**
 * `askAI` hata/koruma durumlarında başarı gibi bilgi METNİ döndürür (çağıranlar metin
 * bekliyor). Bu metinler yanıt sayılmaz: istemciye hata olarak döner, geçmişe girmez.
 */
export const ASK_AI_FAILURE_TEXTS = [
  'AI asistanı şu anda kullanılamıyor.',
  'Bu mesaj güvenlik nedeniyle işlenemiyor.',
  'Bir hata oluştu. Lütfen tekrar deneyin.',
  'Günlük AI token limiti aşıldı. Lütfen yarın tekrar deneyin.',
  'Platformun günlük AI kotası doldu. Lütfen yarın tekrar deneyin.',
  'Çok sık AI isteği gönderildi. Lütfen biraz sonra tekrar deneyin.',
] as const;
export function isAskAiFailure(answer: string | null | undefined): boolean {
  if (!answer || !answer.trim()) return true;
  return (ASK_AI_FAILURE_TEXTS as readonly string[]).includes(answer.trim());
}

/** Metin önizlemesi (tek satır, kırpılmış). */
export function preview(text: string | null | undefined, max = 160): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** CSV hücresi (formül enjeksiyonuna karşı önek, tırnak kaçışı). */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header: string[], rows: unknown[][]): string {
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}`;
}
