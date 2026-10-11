/**
 * AI Kalite (/admin/ai/quality) — istemci + sunucu ortak sözleşme.
 *
 * İki kaynak tek tezgâhta:
 *  1. İnceleme kuyruğu: `AIQualitySample` (geri bildirim AI analizinden haftalık katmanlı örnek).
 *     Değerlendirme birimi tek bir 0–100 sayı DEĞİL; alan bazlı karar (doğru/kısmen/yanlış),
 *     skor kararlardan türetilir (sunucu otoriter).
 *  2. QRA sohbet denetimi: `QraChatLog` (PII maskeli önizleme, tam metin yalnız detayda ve
 *     denetim kaydıyla; ham metin yalnız gerekçeli "maskeyi kaldır" ile).
 *
 * Bu dosya saf: Prisma/Next içe aktarmaz, istemci paketine girer.
 */
import { z } from 'zod';

/* ───────────────────────── İnceleme kuyruğu ───────────────────────── */

export const SAMPLE_STATUSES = ['pending', 'reviewed', 'skipped', 'void'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export const SAMPLE_STATUS_LABEL: Record<SampleStatus, string> = {
  pending: 'Bekliyor',
  reviewed: 'İncelendi',
  skipped: 'Atlandı',
  void: 'Geçersiz',
};

/** Değerlendirilen AI alanları (AIFeedbackCorrection.field sözlüğüyle uyumlu adlar). */
export const VERDICT_FIELDS = ['sentiment', 'intent', 'themes', 'urgency', 'action'] as const;
export type VerdictField = (typeof VERDICT_FIELDS)[number];

export const VERDICT_FIELD_LABEL: Record<VerdictField, string> = {
  sentiment: 'Duygu',
  intent: 'Niyet',
  themes: 'Konu ve temalar',
  urgency: 'Aciliyet ve kayıp riski',
  action: 'Önerilen aksiyon',
};

export const VERDICTS = ['correct', 'partial', 'wrong', 'na'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  correct: 'Doğru',
  partial: 'Kısmen',
  wrong: 'Yanlış',
  na: 'Değerlendirilemez',
};

const VERDICT_WEIGHT: Record<Exclude<Verdict, 'na'>, number> = { correct: 1, partial: 0.5, wrong: 0 };

/**
 * Alan kararlarından 0–100 doğruluk skoru. "Değerlendirilemez" alanlar paydaya girmez;
 * hiç değerlendirilebilir alan yoksa `null` (skor uydurulmaz).
 */
export function scoreFromVerdicts(verdicts: Partial<Record<VerdictField, Verdict>>): number | null {
  let sum = 0;
  let n = 0;
  for (const f of VERDICT_FIELDS) {
    const v = verdicts[f];
    if (!v || v === 'na') continue;
    sum += VERDICT_WEIGHT[v];
    n += 1;
  }
  if (n === 0) return null;
  return Math.round((sum / n) * 1000) / 10;
}

export const SENTIMENT_LABEL: Record<string, string> = {
  positive: 'Olumlu',
  negative: 'Olumsuz',
  neutral: 'Nötr',
  mixed: 'Karışık',
};

export const INTENT_LABEL: Record<string, string> = {
  complaint: 'Şikâyet',
  suggestion: 'Öneri',
  praise: 'Övgü',
  question: 'Soru',
  general: 'Genel',
};

export const sentimentLabel = (v: string | null | undefined) => (v ? SENTIMENT_LABEL[v] ?? v : '—');
export const intentLabel = (v: string | null | undefined) => (v ? INTENT_LABEL[v] ?? v : '—');

/** Gerçek LLM çıktısı olmayan analiz kaynakları: örneklem havuzuna ve metriğe girmez. */
export const NON_LLM_MODELS = ['bootstrap-heuristic', 'local-fallback'] as const;

export const QUALITY_PAGE_SIZE = 20;
/** Bu ortalamanın altındaki hafta uyarı alır (en az `QUALITY_ALERT_MIN_N` örnekle). */
export const QUALITY_ALERT_THRESHOLD = 70;
export const QUALITY_ALERT_MIN_N = 10;

const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const sampleListQuerySchema = z.object({
  status: z.enum([...SAMPLE_STATUSES, 'all']).catch('pending').default('pending'),
  model: optStr(120),
  sentiment: optStr(40),
  intent: optStr(40),
  q: optStr(120).transform((v) => (v && v.length >= 2 ? v : undefined)),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(5).max(50).catch(QUALITY_PAGE_SIZE).default(QUALITY_PAGE_SIZE),
});
export type SampleListQuery = z.infer<typeof sampleListQuerySchema>;

const verdict = z.enum(VERDICTS);
const correction = z.string().trim().max(300).optional();
const verdictsSchema = z
  .object({ sentiment: verdict, intent: verdict, themes: verdict, urgency: verdict, action: verdict })
  .strict();
const correctionsSchema = z
  .object({ sentiment: correction, intent: correction, themes: correction, urgency: correction, action: correction })
  .strict()
  .optional();

const concurrency = {
  /** İyimser kilit: okunan durum + reviewedAt değişmişse 409. */
  expectedStatus: z.enum(SAMPLE_STATUSES),
  expectedReviewedAt: z.string().datetime().nullable(),
};

export const sampleActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('review'),
    verdicts: verdictsSchema,
    corrections: correctionsSchema,
    notes: z.string().trim().max(1000).optional().nullable(),
    ...concurrency,
  }),
  z.object({ action: z.literal('skip'), reason: z.string().trim().max(300).optional().nullable(), ...concurrency }),
  z.object({ action: z.literal('void'), reason: z.string().trim().min(3, 'Gerekçe en az 3 karakter olmalı.').max(300), ...concurrency }),
  z.object({ action: z.literal('reopen'), ...concurrency }),
]);
export type SampleActionInput = z.infer<typeof sampleActionSchema>;

export const sampleRunSchema = z.object({
  size: z.coerce.number().int().min(10).max(200).default(50),
  days: z.coerce.number().int().min(1).max(30).default(7),
});
export type SampleRunInput = z.infer<typeof sampleRunSchema>;

export type ReviewerRef = { id: string; name: string | null } | null;

export interface SampleListItem {
  id: string;
  status: SampleStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewer: ReviewerRef;
  accuracyScore: number | null;
  isDemo: boolean;
  feedback: {
    id: string;
    preview: string;
    rating: number;
    sentiment: string | null;
    intent: string | null;
    model: string | null;
    version: string | null;
    dealerName: string | null;
    qrName: string | null;
    createdAt: string;
    deleted: boolean;
  };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface SampleHistoryEvent {
  id: string;
  at: string;
  action: string;
  actorName: string | null;
  score: number | null;
  note: string | null;
}

export interface SampleDetail extends SampleListItem {
  notes: string | null;
  verdicts: Partial<Record<VerdictField, Verdict>> | null;
  corrections: Partial<Record<VerdictField, string>> | null;
  feedbackDetail: {
    text: string;
    aiProcessedAt: string | null;
    intentScore: number | null;
    urgency: number | null;
    churnRisk: number | null;
    effortScore: number | null;
    topics: string[];
    themes: { theme: string; subTheme?: string | null; sentiment?: string | null }[];
    actions: { action: string; priority?: string | null }[];
    emotions: { label: string; score?: number | null }[];
    rawAnalysis: string | null;
  };
  history: SampleHistoryEvent[];
}

export interface WeeklyPoint {
  /** Haftanın Pazartesi günü (İstanbul, YYYY-MM-DD). */
  week: string;
  avg: number | null;
  n: number;
}

export interface QualityMetrics {
  asOf: string;
  counts: Record<SampleStatus, number>;
  /** Son 4 haftada açılan örneklerden incelenen/atlanan/geçersiz oranı (yüzde). */
  reviewRate: { value: number | null; n: number };
  current: { avg: number | null; n: number };
  previous: { avg: number | null; n: number };
  weekly: WeeklyPoint[];
  byModel: { model: string; avg: number | null; n: number }[];
  byField: { field: VerdictField; label: string; accuracy: number | null; n: number }[];
  weakest: { field: VerdictField; label: string; accuracy: number } | null;
  lastRun: { at: string; created: number; actor: string | null } | null;
  models: string[];
  alert: { avg: number; n: number } | null;
}

export interface SampleRunResult {
  candidates: number;
  created: number;
  voided: number;
  strata: number;
}

/* ───────────────────────── QRA sohbet denetimi ───────────────────────── */

export const CHAT_OUTCOMES = ['ok', 'blocked', 'maintenance', 'error'] as const;
export type ChatOutcome = (typeof CHAT_OUTCOMES)[number];

export const CHAT_OUTCOME_LABEL: Record<ChatOutcome, string> = {
  ok: 'Yanıtlandı',
  blocked: 'Güvenlik engeli',
  maintenance: 'Bakım yanıtı',
  error: 'Model hatası',
};

export const CHAT_ROLES = ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN', 'ANON'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];
export const CHAT_ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Müşteri',
  DEALER: 'Bayi',
  STAFF: 'Personel',
  ADMIN: 'Yönetici',
  ANON: 'Ziyaretçi',
};
export const chatRoleLabel = (v: string | null | undefined) => (v ? CHAT_ROLE_LABEL[v] ?? v : '—');

export const CHAT_PERIODS = ['24h', '7d', '30d', 'all'] as const;
export type ChatPeriod = (typeof CHAT_PERIODS)[number];
export const CHAT_PERIOD_LABEL: Record<ChatPeriod, string> = {
  '24h': 'Son 24 saat',
  '7d': 'Son 7 gün',
  '30d': 'Son 30 gün',
  all: 'Tüm saklama süresi',
};
export const CHAT_PERIOD_MS: Record<Exclude<ChatPeriod, 'all'>, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
};

/** "Yavaş yanıt" eşiği (ms). */
export const CHAT_SLOW_MS = 5000;
export const CHAT_PAGE_SIZE = 25;
export const CHAT_EXPORT_MAX = 5000;

export const chatListQuerySchema = z.object({
  q: optStr(120).transform((v) => (v && v.length >= 2 ? v : undefined)),
  role: z.enum(CHAT_ROLES).optional().catch(undefined),
  outcome: z.enum(CHAT_OUTCOMES).optional().catch(undefined),
  slow: z
    .enum(['1', '0'])
    .optional()
    .catch(undefined)
    .transform((v) => v === '1'),
  period: z.enum(CHAT_PERIODS).catch('7d').default('7d'),
  user: optStr(64),
  fp: optStr(64),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(10).max(50).catch(CHAT_PAGE_SIZE).default(CHAT_PAGE_SIZE),
});
export type ChatListQuery = z.infer<typeof chatListQuerySchema>;

export const chatStatsQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d']).catch('7d').default('7d'),
});
export type ChatStatsQuery = z.infer<typeof chatStatsQuerySchema>;

export const chatRevealSchema = z.object({
  reason: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı.').max(300),
});

export interface ChatActor {
  kind: 'user' | 'anon' | 'deleted';
  userId: string | null;
  name: string | null;
  email: string | null;
  fingerprint: string | null;
  currentRole: string | null;
}

export interface ChatListItem {
  id: string;
  createdAt: string;
  actor: ChatActor;
  roleSnapshot: string | null;
  userPreview: string;
  assistantPreview: string;
  model: string;
  /** Bakım/güvenlik engelinde model hiç çağrılmaz. */
  modelCalled: boolean;
  latencyMs: number | null;
  outcome: ChatOutcome;
}

export interface ChatTurn {
  id: string;
  createdAt: string;
  userMessage: string;
  assistantMessage: string;
  outcome: ChatOutcome;
  current: boolean;
}

export interface ChatDetail extends ChatListItem {
  userMessage: string;
  assistantMessage: string;
  masked: boolean;
  /** Aynı aktörün ±30 dk içindeki turları (maskeli). */
  conversation: ChatTurn[];
}

export interface ChatStats {
  asOf: string;
  period: ChatStatsQuery['period'];
  total: number;
  previousTotal: number;
  outcomes: Record<ChatOutcome, number>;
  errorRate: number | null;
  latency: { p50: number | null; p95: number | null; n: number };
  series: { day: string; total: number; problems: number }[];
  topActors: { key: string; kind: 'user' | 'anon'; label: string; count: number; userId: string | null; fingerprint: string | null }[];
  retention: { days: number | null; oldestAt: string | null };
  limits: Record<string, number>;
}

/* ───────────────────────── Sorgu dizesi (istemci ↔ sunucu ön yükleme aynı anahtar) ───────────────────────── */

/** Boş/varsayılan değerleri atlayarak sorgu dizesi üretir (önbellek anahtarı kararlı kalsın). */
export function buildQs(obj: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  return sp.toString();
}

/** Sayfa URL'si (inceleme sekmesi) → `/samples` API sorgu dizesi. */
export function sampleQsFromUrl(get: (k: string) => string | null | undefined): string {
  const status = get('status') || 'pending';
  const q = (get('q') ?? '').trim();
  const page = Number(get('page'));
  const size = Number(get('size'));
  return buildQs({
    status: status !== 'pending' ? status : null,
    model: get('model') || null,
    sentiment: get('sentiment') || null,
    intent: get('intent') || null,
    q: q.length >= 2 ? q : null,
    page: page > 1 ? page : null,
    size: size > 0 && size !== QUALITY_PAGE_SIZE ? size : null,
  });
}

/** Sayfa URL'si (sohbet sekmesi; arama `cq`, sayfa `cpage`) → `/chats` API sorgu dizesi (sayfasız). */
export function chatFilterQsFromUrl(get: (k: string) => string | null | undefined): string {
  const q = (get('cq') ?? '').trim();
  const period = get('period') || '7d';
  return buildQs({
    q: q.length >= 2 ? q : null,
    period: period !== '7d' ? period : null,
    outcome: get('outcome') || null,
    role: get('role') || null,
    slow: get('slow') === '1' ? true : null,
    user: get('user') || null,
    fp: get('fp') || null,
  });
}

export function chatQsFromUrl(get: (k: string) => string | null | undefined): string {
  const page = Number(get('cpage'));
  const size = Number(get('csize'));
  const base = chatFilterQsFromUrl(get);
  const extra = buildQs({ page: page > 1 ? page : null, size: size > 0 && size !== CHAT_PAGE_SIZE ? size : null });
  return [base, extra].filter(Boolean).join('&');
}
