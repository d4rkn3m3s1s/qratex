/**
 * Bayi AI Asistan (b-asistan) — paylaşılan sözleşme (sunucu + istemci). Prisma'ya bağımlı değildir.
 *
 * İlke (yol haritası §4.4/7): SAYIYI KOD HESAPLAR, LLM ANLATIR. Asistanın her yanıtı, sunucuda
 * deterministik sorgularla hesaplanmış "dayanak" (fact) kartları ve atıflı müşteri yorumları
 * (source) taşır; arayüz sayıları bu kartlardan gösterir, LLM metninden değil.
 */

/** Asistanın sorgulayabildiği dönemler (İstanbul takvimi; uçlar dahil; önceki eşit dönemle kıyas). */
export const ASSISTANT_PERIODS = ['last7', 'last30', 'last90', 'thisMonth', 'lastMonth'] as const;
export type AssistantPeriod = (typeof ASSISTANT_PERIODS)[number];
export const DEFAULT_ASSISTANT_PERIOD: AssistantPeriod = 'last30';

export function isAssistantPeriod(v: unknown): v is AssistantPeriod {
  return typeof v === 'string' && (ASSISTANT_PERIODS as readonly string[]).includes(v);
}

/** Soru üst sınırı (karakter). İstemci sayaç gösterir, sunucu zod ile reddeder. */
export const QUESTION_MAX = 2000;
/** Sohbet başına saklanan en fazla mesaj (eski turlar kırpılır; satır sınırsız büyümez). */
export const MAX_STORED_MESSAGES = 200;
/** Liste sayfa boyutu. */
export const CONVERSATION_PAGE_SIZE = 20;
/** Başlık üst sınırı. */
export const TITLE_MAX = 100;

export type AssistantLocale = 'tr' | 'en';

export type AssistantToolName =
  | 'get_overview'
  | 'get_topics'
  | 'get_trend'
  | 'get_locations'
  | 'get_busy_times'
  | 'search_feedback'
  | 'get_churn_risk';

export const ASSISTANT_TOOL_NAMES: readonly AssistantToolName[] = [
  'get_overview',
  'get_topics',
  'get_trend',
  'get_locations',
  'get_busy_times',
  'search_feedback',
  'get_churn_risk',
];

/** Gün aralığı (İstanbul takvimi, uçlar dahil). */
export interface FactRange {
  from: string;
  to: string;
}

/** Değer + önceki dönem (yoksa null). Oranlar YÜZDE cinsindendir (12.5 → %12,5). */
export interface FactMetric {
  value: number | null;
  compare: number | null;
  /** Örneklem (puan ortalaması için yorum adedi vb.). */
  n?: number | null;
}

export interface OverviewFact {
  tool: 'get_overview';
  period: AssistantPeriod;
  range: FactRange;
  compareRange: FactRange | null;
  volume: FactMetric;
  avgRating: FactMetric;
  positiveShare: FactMetric;
  responseRate: FactMetric;
  nps: FactMetric;
  sentiment: { positive: number; neutral: number; negative: number; pending: number; total: number };
  /** Dönemden bağımsız hiç kayıt var mı (yoksa onboarding boş durumu). */
  hasAnyData: boolean;
}

export interface TopicsFact {
  tool: 'get_topics';
  period: AssistantPeriod;
  range: FactRange;
  /** AI analizli QR yorumu sayısı (konu analizinin kapsamı). */
  base: number;
  topics: Array<{ key: string; count: number; compareCount: number | null; positive: number; negative: number; quadrant: 'fix' | 'strength' | 'watch' }>;
}

export interface TrendFact {
  tool: 'get_trend';
  period: AssistantPeriod;
  range: FactRange;
  series: Array<{ day: string; count: number; avgRating: number | null; negative: number }>;
  anomalies: Array<{ day: string; kind: 'negative_spike' | 'volume_spike'; value: number; expected: number }>;
}

export interface LocationsFact {
  tool: 'get_locations';
  period: AssistantPeriod;
  range: FactRange;
  rows: Array<{ id: string; name: string; locationName: string | null; feedbacks: number; avgRating: number | null; bayesRating: number | null; compareFeedbacks: number | null }>;
}

export interface BusyTimesFact {
  tool: 'get_busy_times';
  period: AssistantPeriod;
  range: FactRange;
  /** ISO gün (1 = Pazartesi … 7 = Pazar) kodu yerine `mon…sun`. */
  peakDay: { day: string; count: number; share: number } | null;
  peakHour: { hour: number; count: number; share: number } | null;
  qualityDip: { day: string; hour: number; avgRating: number; n: number; baseline: number } | null;
  n: number;
}

export interface SearchFact {
  tool: 'search_feedback';
  period: AssistantPeriod;
  range: FactRange;
  query: string | null;
  /** Kullanılan yöntem: anlamsal (embedding), anahtar kelime ya da yalnız süzgeç. */
  method: 'semantic' | 'keyword' | 'filter';
  /** Süzgece uyan toplam kayıt (anahtar kelime/süzgeç modunda; anlamsalda bulunan aday sayısı). */
  matched: number;
  returned: number;
  filters: { sentiment: 'positive' | 'neutral' | 'negative' | null; minRating: number | null; maxRating: number | null };
}

export interface ChurnFact {
  tool: 'get_churn_risk';
  period: AssistantPeriod;
  range: FactRange;
  /** Kayıp riski ≥ 0,7 olarak analiz edilmiş yorum sayısı (QR + tüketim). */
  highRisk: number;
  /** Aciliyet ≥ 0,7 (yalnız QR). */
  urgent: number;
  /** AI analizli yorum sayısı (oranın paydası). */
  analyzed: number;
  topics: Array<{ key: string; count: number }>;
  /** Konu dağılımının hesaplandığı örneklem (en yeni N yüksek riskli QR yorumu). */
  topicSample: number;
}

export type AssistantFact = OverviewFact | TopicsFact | TrendFact | LocationsFact | BusyTimesFact | SearchFact | ChurnFact;

/** Atıflı müşteri yorumu. `ref` yanıt metnindeki `[K1]` işaretine karşılık gelir. */
export interface AssistantSource {
  ref: string;
  kind: 'qr' | 'consumption';
  id: string;
  excerpt: string;
  rating: number | null;
  sentiment: string | null;
  createdAt: string;
  /** Gelen Kutusu derin linki (`?id=qr-…` / `?id=cr-…`). */
  href: string;
}

export type MessageStatus = 'complete' | 'stopped' | 'error';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Yalnız asistan: tamamlandı / kullanıcı durdurdu (kısmi metin). */
  status?: MessageStatus;
  /** Sorunun sorulduğu dönem. */
  period?: AssistantPeriod;
  facts?: AssistantFact[];
  sources?: AssistantSource[];
  /** Bayinin değerlendirmesi: 1 faydalı, -1 faydasız. */
  rating?: 1 | -1 | null;
  model?: string | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  period: AssistantPeriod;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListPage {
  items: ConversationSummary[];
  /** Yalnız ilk sayfada ve arama yokken dolu. */
  pinned: ConversationSummary[];
  nextCursor: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages: AssistantMessage[];
  /** Eski turlar saklama sınırı nedeniyle kırpıldı mı. */
  truncated: boolean;
}

/** Sunucunun veriden türettiği soru önerisi (metin istemcide yerelleştirilir). */
export type SuggestionKind =
  | 'rating_drop'
  | 'rating_rise'
  | 'fix_topic'
  | 'rising_topic'
  | 'churn'
  | 'negative_spike'
  | 'weak_location'
  | 'busy_dip'
  | 'priorities'
  | 'strengths';

export interface AssistantSuggestion {
  id: string;
  kind: SuggestionKind;
  /** Biçimlenecek parametreler (konu anahtarı, puanlar, adetler, şube adı). */
  params: Record<string, string | number>;
  period: AssistantPeriod;
}

export type AssistantStatus = 'ready' | 'module_disabled' | 'ai_disabled' | 'unconfigured';

export interface AssistantQuota {
  usedTokens: number;
  limitTokens: number;
  /** Kota sıfırlanma anı (UTC gece yarısı; ISO). */
  resetsAt: string;
  exhausted: boolean;
}

export interface AssistantOverview {
  status: AssistantStatus;
  quota: AssistantQuota | null;
  data: { hasAnyData: boolean; periodCount: number };
  suggestions: AssistantSuggestion[];
  defaultPeriod: AssistantPeriod;
  generatedAt: string;
}

/** Akış olayları (NDJSON; her satır bir olay). */
export type AssistantStreamEvent =
  | { type: 'start'; conversationId: string | null; userMessageId: string; assistantMessageId: string; period: AssistantPeriod }
  | { type: 'tool'; tool: AssistantToolName }
  | { type: 'fact'; fact: AssistantFact }
  | { type: 'sources'; sources: AssistantSource[] }
  /** Araç çağıran turda yazılmış taslak metni temizle. */
  | { type: 'reset' }
  | { type: 'delta'; text: string }
  | { type: 'done'; conversationId: string; title: string; userMessage: AssistantMessage; message: AssistantMessage }
  | { type: 'error'; code: string; message: string; retryable: boolean };

/** Hata kodları (istemci yerelleştirir). */
export type AssistantErrorCode =
  | 'AI_UNCONFIGURED'
  | 'AI_DISABLED'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_RATE_LIMIT'
  | 'RATE_LIMITED'
  | 'INPUT_REJECTED'
  | 'PROVIDER_ERROR'
  | 'EMPTY_ANSWER'
  | 'MODULE_DISABLED'
  | 'NOT_FOUND'
  | 'NOTHING_TO_REGENERATE'
  | 'CONFLICT'
  | 'INTERNAL';

/** React Query anahtarları (sunucu ön-yüklemesi ile istemci aynı anahtarı kullanır). */
export const assistantKeys = {
  all: ['dealer', 'assistant'] as const,
  overview: () => ['dealer', 'assistant', 'overview'] as const,
  list: (q: string) => ['dealer', 'assistant', 'conversations', q] as const,
  lists: ['dealer', 'assistant', 'conversations'] as const,
  conversation: (id: string) => ['dealer', 'assistant', 'conversation', id] as const,
};
