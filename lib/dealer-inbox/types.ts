/**
 * Bayi Gelen Kutusu — paylaşılan tipler (sunucu + istemci). Prisma'ya bağımlı değildir.
 *
 * İki kaynak tek satır şemasında birleşir:
 *   - `qr`          → `Feedback` (QR geri bildirimi; anonim olabilir)
 *   - `consumption` → `ConsumptionReview` (kartlı tüketim yorumu; müşteri her zaman bilinir)
 *
 * Kayıt anahtarı: `qr-<feedbackId>` | `cr-<consumptionReviewId>` (`?id=` derin linki).
 * Müşteri e-postası ve ham müşteri kimliği bu sözleşmede YOKTUR (KVKK veri minimizasyonu).
 */

export type InboxSource = 'qr' | 'consumption';
export type InboxSourceFilter = 'all' | InboxSource;

/** Yeni = yanıtsız ve kapatılmamış; Yanıtlandı = yanıt var, kapatılmamış; Çözüldü = vaka kapandı. */
export type InboxStatus = 'new' | 'replied' | 'resolved';
export type InboxStatusFilter = 'all' | InboxStatus;

export type InboxSentiment = 'positive' | 'neutral' | 'negative' | 'pending';
export type InboxSentimentFilter = 'all' | InboxSentiment;
/** Duygunun dayanağı: AI analizi, puan eşiği (metinsiz/analizsiz), ya da analiz bekliyor. */
export type SentimentBasis = 'ai' | 'rating' | 'pending';

export type InboxSignalFilter = 'all' | 'urgent' | 'churn' | 'trust';
export type InboxAssignedFilter = 'all' | 'me' | 'unassigned';
export type InboxRangeFilter = 'all' | '7' | '30' | '90';
export type InboxSort = 'newest' | 'oldest';
export type InboxRatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';

export interface InboxFilters {
  source: InboxSourceFilter;
  status: InboxStatusFilter;
  rating: InboxRatingFilter;
  sentiment: InboxSentimentFilter;
  signal: InboxSignalFilter;
  assigned: InboxAssignedFilter;
  range: InboxRangeFilter;
  /** QR kodu kimliği (yalnız QR kaynağı). */
  qr: string | null;
  q: string;
  sort: InboxSort;
}

export type SlaState = 'done' | 'ok' | 'due_soon' | 'overdue';
export interface InboxSla {
  state: SlaState;
  /** Hedef yanıt anı (ISO). */
  dueAt: string;
  /** Hedef süre (saat). */
  targetHours: number;
}

export type InboxPriority = 'high' | 'medium' | 'low';

export interface InboxPerson {
  id: string;
  name: string;
}

export type InboxCaseStatus = 'open' | 'assigned' | 'in_progress' | 'resolved';
export interface InboxCase {
  id: string;
  status: InboxCaseStatus;
  assignee: InboxPerson | null;
  resolvedAt: string | null;
}

export type InboxRemedyStatus = 'awaiting_dealer_approval' | 'pending' | 'accepted' | 'expired' | 'rejected';

export interface InboxListItem {
  key: string;
  source: InboxSource;
  id: string;
  createdAt: string;
  rating: number;
  npsScore: number | null;
  textPreview: string | null;
  /** Görünen müşteri adı; anonim/isimsiz için null. */
  customerName: string | null;
  anonymous: boolean;
  /** QR adı (QR) ya da ürün adı (tüketim). */
  contextLabel: string | null;
  status: InboxStatus;
  repliedAt: string | null;
  /** Yalnız QR: bayi ilk açtığında. Tüketim yorumunda izlenmez (null). */
  viewedAt: string | null;
  sentiment: InboxSentiment;
  sentimentBasis: SentimentBasis;
  urgent: boolean;
  churnHigh: boolean;
  trustFlagged: boolean;
  toxic: boolean;
  topics: string[];
  hasMedia: boolean;
  priority: InboxPriority;
  sla: InboxSla;
  case: InboxCase | null;
  remedyStatus: InboxRemedyStatus | null;
}

export interface InboxListPage {
  items: InboxListItem[];
  nextCursor: string | null;
}

export interface InboxDimension {
  key: string;
  label: string;
  value: number;
}

export interface InboxRemedyBrief {
  id: string;
  status: InboxRemedyStatus;
  createdAt: string;
  acceptedAt: string | null;
  selectionLabel: string | null;
}

export interface InboxHistoryItem {
  key: string;
  source: InboxSource;
  createdAt: string;
  rating: number;
  textPreview: string | null;
}

export interface InboxCustomerContext {
  /** Bu işletmedeki kartlı tüketim sayısı. */
  visits: number;
  /** Bu işletmeye bıraktığı toplam yorum/geri bildirim (bu kayıt dahil). */
  voices: number;
  /** Bu işletmedeki ortalama puanı (tüm yorumları). */
  avgRating: number | null;
  firstSeenAt: string | null;
  /** Bu işletmedeki son diğer yorumları (en fazla 5). */
  recent: InboxHistoryItem[];
}

export interface InboxAutoReplyHint {
  ruleName: string;
}

export interface InboxDetail extends InboxListItem {
  text: string | null;
  reply: string | null;
  media: string[];
  dimensions: InboxDimension[];
  intent: string | null;
  urgency: number | null;
  churnRisk: number | null;
  trustReason: string | null;
  actionSuggestions: string[];
  analyzedAt: string | null;
  /** Tüketim: tutar (TL), kart son 4 hane. */
  amount: number | null;
  cardLast4: string | null;
  categoryName: string | null;
  customer: InboxCustomerContext | null;
  remedies: InboxRemedyBrief[];
  /** Telafi başlatılabilir mi + değilse neden (sunucu otoriter). */
  remedy: { allowed: boolean; reason: 'anonymous' | 'open_offer' | 'already_remedied' | 'module_off' | null };
  /** Bu kayıt yanıtsızken eşleşen etkin otomatik yanıt kuralı (çakışma uyarısı). */
  autoReply: InboxAutoReplyHint | null;
}

export interface InboxSummary {
  period: { from: string; to: string; compareFrom: string; compareTo: string };
  /** Yanıtsız + kapatılmamış (tüm zamanlar). */
  pending: number;
  /** Bekleyenlerden SLA'sı aşılanlar. */
  overdue: number;
  avgRating: { value: number | null; previous: number | null; n: number };
  replyRate: { value: number | null; previous: number | null; n: number };
  /** Medyan ilk yanıt süresi (saniye). */
  medianReplySeconds: { value: number | null; n: number };
  negativeShare: { value: number | null; previous: number | null; n: number };
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  statusCounts: Record<InboxStatus, number>;
  sources: Record<InboxSource, number>;
  asOf: string;
}

export interface InboxTemplate {
  id: string;
  label: string;
  body: string;
}

export interface InboxMeta {
  assignees: InboxPerson[];
  qrCodes: Array<{ id: string; name: string }>;
  templates: InboxTemplate[];
  sla: { negativeHours: number; defaultHours: number };
  remedyEnabled: boolean;
  aiEnabled: boolean;
  business: { name: string };
  /** Oturum sahibi (atama "ben" filtresi için). */
  me: InboxPerson;
}

export type InboxAction = 'resolve' | 'reopen' | 'assign' | 'unassign' | 'viewed';

export interface InboxActionResult {
  key: string;
  ok: boolean;
  /** Başarısızsa Türkçe neden. */
  error?: string;
}

export interface InboxReplyResult {
  key: string;
  reply: string;
  repliedAt: string;
  edited: boolean;
  notified: boolean;
}

export interface InboxSuggestResult {
  drafts: string[];
  source: 'ai' | 'unavailable';
  reason: 'ai_disabled' | 'not_configured' | 'no_result' | null;
}
