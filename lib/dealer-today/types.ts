/**
 * Bayi "Bugün" yüzeyi (`/dealer`) — sunucu ↔ istemci sözleşmesi.
 *
 * Kural (yol haritası §4.4): sayıyı kod hesaplar, istemci yalnız biçimler. Metinler
 * API'de üretilmez; API yalnız kod + parametre döndürür (`kind`, `params`), Türkçe metin
 * `components/dealer/b-bugun/copy.ts`'tedir. Bütün zamanlar Europe/Istanbul takvimindedir.
 */
import type { MetricValue } from '@/components/ds/data/metric-format';
import type { Severity } from '@/components/ds/data/status-meta';

export const DEALER_TODAY_QUERY_KEY = ['dealer', 'today'] as const;
export const DEALER_WEEKLY_QUERY_KEY = (week: string | null) => ['dealer', 'today', 'weekly', week ?? 'latest'] as const;
export const DEALER_WEEKLY_ARCHIVE_QUERY_KEY = ['dealer', 'today', 'weekly-archive'] as const;

export type FeedbackSource = 'qr' | 'consumption';
export type Greeting = 'morning' | 'afternoon' | 'evening' | 'night';

// ───────────────────────────── Kurulum kartı ─────────────────────────────

export type SetupStepKey = 'profile' | 'location' | 'qr' | 'firstFeedback' | 'product';

export interface SetupStep {
  key: SetupStepKey;
  done: boolean;
  /** Zorunlu adımlar kartın görünürlüğünü belirler; önerilen adım kartı tek başına tutmaz. */
  required: boolean;
  href: string;
}

export interface SetupState {
  /** Zorunlu adımlardan biri eksikse true → kart görünür; hepsi tamamsa kart kaybolur. */
  visible: boolean;
  steps: SetupStep[];
  required: { done: number; total: number };
  /** İlk eksik zorunlu adım (kartın birincil CTA'sı). */
  nextKey: SetupStepKey | null;
}

// ───────────────────────────── Metrikler ─────────────────────────────

export interface TodayMetrics {
  /** Bugün gelen geri bildirim (QR + tüketim yorumu); delta = dün aynı saate kadar olana göre. */
  feedbackToday: MetricValue;
  /** Bugünkü işlem (tüketim kaydı); delta = dün aynı saate kadar. */
  consumptionsToday: MetricValue;
  /** Son 7 takvim günü ağırlıklı ortalama puan; delta = önceki 7 güne göre (puan farkı). */
  avgRating7d: MetricValue;
  /** Son 7 gün yanıt oranı (%); delta = önceki 7 güne göre (yüzde puanı). */
  responseRate7d: MetricValue;
  /** Son 7 günde yanıtlananların ilk yanıt süresi medyanı (saniye). */
  medianFirstResponseSec: number | null;
}

// ───────────────────────────── Sıradaki en iyi adımlar ─────────────────────────────

export type NextActionKind =
  | 'remedy_approval'
  | 'unanswered_negative'
  | 'open_incidents'
  | 'overdue_todos'
  | 'unanswered_recent'
  | 'rating_drop'
  | 'weak_qr'
  | 'quiet_week';

export interface NextActionParams {
  /** En eski kaydın yaşı (saat). */
  oldestHours?: number;
  /** En yüksek önem (olaylar). */
  maxSeverity?: Severity;
  /** Önceki / şimdiki ortalama puan. */
  from?: number;
  to?: number;
  /** Zayıf QR'ın adı ve ortalaması. */
  name?: string;
  avg?: number;
  n?: number;
}

export interface NextAction {
  kind: NextActionKind;
  severity: Severity;
  count: number;
  href: string;
  params: NextActionParams;
}

// ───────────────────────────── Yanıt bekleyenler ─────────────────────────────

export interface WaitingItem {
  id: string;
  source: FeedbackSource;
  rating: number;
  /** Müşteri metninden ilk ~140 karakter (bayinin kendi verisi). */
  excerpt: string | null;
  createdAt: string;
  /** QR adı ya da ürün adı. */
  place: string | null;
  href: string;
}

export interface WaitingSection {
  /** Son 30 günde yanıt bekleyen (QR + tüketim yorumu). */
  total: number;
  /** Bunların ≤2★ olanları. */
  negative: number;
  /** ≤2★ ve 24 saati aşmış olanlar (SLA). */
  overdueNegative: number;
  items: WaitingItem[];
}

// ───────────────────────────── Operasyon özeti ─────────────────────────────

export interface DailyPoint {
  day: string;
  feedback: number;
  consumptions: number;
  avgRating: number | null;
}

export interface OpsSummary {
  openTodos: number;
  overdueTodos: number;
  remedy: { awaitingApproval: number; pendingCustomer: number; oldestAwaitingAt: string | null };
  incidents: { open: number; maxSeverity: Severity | null };
  catalog: { activeQr: number; activeProducts: number; locations: number };
  /** Son 7 İstanbul günü (eski → yeni). */
  daily: DailyPoint[];
  /** Son 7 gün puan dağılımı: 4-5★ / 3★ / 1-2★. */
  distribution: { positive: number; neutral: number; negative: number; n: number };
  sources7d: Record<FeedbackSource, number>;
}

// ───────────────────────────── Yapılacaklar ─────────────────────────────

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: string;
  text: string;
  priority: TodoPriority;
  status: 'pending' | 'assigned' | 'in_progress';
  dueAt: string | null;
  overdue: boolean;
  assigneeName: string | null;
  feedbackId: string | null;
  createdAt: string;
}

export interface SuggestionItem {
  /** İstemci anahtarı: `${feedbackId}:${index}`. */
  key: string;
  feedbackId: string;
  text: string;
  priority: TodoPriority;
  rating: number;
  createdAt: string;
}

export interface TodosSection {
  open: TodoItem[];
  openTotal: number;
  /** AI'ın geri bildirimlere iliştirdiği, henüz listeye alınmamış öneriler (yinelenenler ayıklanmış). */
  suggestions: SuggestionItem[];
}

// ───────────────────────────── Tam yanıt ─────────────────────────────

export interface DealerTodayData {
  generatedAt: string;
  /** İstanbul günü (YYYY-MM-DD). */
  today: string;
  greeting: Greeting;
  dealer: { name: string | null };
  setup: SetupState;
  metrics: TodayMetrics;
  nextActions: NextAction[];
  waiting: WaitingSection;
  ops: OpsSummary;
  todos: TodosSection;
  /** Haftalık rapor sekmesinin varsayılan haftası (son tamamlanan hafta, Pazartesi). */
  latestCompletedWeek: string;
}

// ───────────────────────────── Haftalık rapor ─────────────────────────────

export interface WeeklyTheme {
  label: string;
  count: number;
  positive: number;
  negative: number;
  prevCount: number;
}

export interface WeeklyReport {
  /** Pazartesi (İstanbul, YYYY-MM-DD). */
  week: string;
  /** Pazar. */
  weekEnd: string;
  /** Hafta bitti mi (bugün bu haftanın içindeyse false). */
  isComplete: boolean;
  metrics: {
    feedback: MetricValue;
    avgRating: MetricValue;
    negativeRate: MetricValue;
    responseRate: MetricValue;
    consumptions: MetricValue;
  };
  sources: Record<FeedbackSource, number>;
  themes: WeeklyTheme[];
  /** Haftalık cron'un kural tabanlı önerisi (DealerWeeklyBrief) — AI DEĞİL, öyle etiketlenir. */
  autoRecommendation: { text: string; createdAt: string } | null;
  /** Bu hafta için daha önce yazdırılmış AI anlatısı (önbellekten; GET LLM çağırmaz). */
  narrative: { text: string; generatedAt: string } | null;
  /** AI anlatısı istenebilir mi (modül + bayi AI ayarı + sağlayıcı). */
  aiAvailable: boolean;
  prevWeek: string | null;
  nextWeek: string | null;
}

export interface WeeklyArchiveRow {
  week: string;
  feedback: number;
  avgRating: number | null;
  negative: number;
  responseRate: number | null;
  consumptions: number;
  hasBrief: boolean;
}

export interface WeeklyArchivePage {
  items: WeeklyArchiveRow[];
  /** Daha eski sayfa için `before` değeri (yoksa null). */
  nextBefore: string | null;
}

export interface WeeklyNarrative {
  week: string;
  text: string;
  generatedAt: string;
  cached: boolean;
}
