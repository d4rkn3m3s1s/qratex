/**
 * Bayi Analitik (b-analitik) — paylaşılan yanıt sözleşmesi.
 *
 * Sunucu sayıyı hesaplar, istemci yalnız biçimler (yol haritası §4.4/7). Tüm alanlar JSON'a
 * kayıpsız serileşir (SSR → HydrationBoundary → istemci). Etiket/metin YOK: gün anahtarı,
 * konu anahtarı ve kodlar döner, istemci `Intl` + kopya dosyasıyla çevirir (rapor B-13).
 */
import type { MetricValue } from '@/components/ds/data/metric-format';
import type { CompareMode, DateRangePreset, DayRange } from '@/components/ds/page/date-range';

export const ANALYTICS_TZ = 'Europe/Istanbul' as const;

/** Kanal: QR geri bildirimi, tüketim (ziyaret) yorumu ya da ikisi. */
export type AnalyticsChannel = 'all' | 'qr' | 'consumption';
export const ANALYTICS_CHANNELS: readonly AnalyticsChannel[] = ['all', 'qr', 'consumption'];

/** Isı haritası metriği. */
export type HeatmapMetric = 'feedback' | 'visits' | 'revenue' | 'rating';
export const HEATMAP_METRICS: readonly HeatmapMetric[] = ['feedback', 'visits', 'revenue', 'rating'];

/** Tek duygu tanımı (Gelen Kutusu ile aynı): AI duygusu; metinli + analizsiz → bekliyor; yoksa puan. */
export type SentimentKey = 'positive' | 'neutral' | 'negative' | 'pending';

/** Pazartesi başlangıçlı hafta (TR iş haftası). Dizin = ISO gün − 1. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Çözülmüş sorgu (URL ↔ sunucu ↔ önbellek anahtarı aynı kaynaktan). */
export interface AnalyticsQuery {
  preset: DateRangePreset;
  /** İstanbul takvim günleri, uçlar dahil. */
  range: DayRange;
  compare: CompareMode;
  compareRange: DayRange | null;
  channel: AnalyticsChannel;
  /** Şube kimliği, `'none'` (şubesiz QR'lar) ya da null (tümü). Yalnız QR kanalını süzer. */
  location: string | null;
}

export interface HeatmapQuery extends AnalyticsQuery {
  metric: HeatmapMetric;
}

export interface LocationOption {
  id: string;
  name: string;
}

export interface AnalyticsFiltersInfo {
  channel: AnalyticsChannel;
  location: string | null;
  /** Etkin kanal (şube seçiliyse yalnız QR). */
  effectiveChannel: AnalyticsChannel;
  locations: LocationOption[];
}

export interface OverviewKpis {
  volume: MetricValue;
  avgRating: MetricValue;
  positiveShare: MetricValue;
  responseRate: MetricValue;
  medianReply: MetricValue;
  /** Tarama → geri bildirim (yalnız QR). `value: null` → tarama verisi yok/eksik. */
  conversion: MetricValue;
  nps: MetricValue;
}

export type ConversionStatus = 'ok' | 'no_scans' | 'incomplete' | 'not_applicable';

export interface SeriesPoint {
  /** İstanbul günü `YYYY-MM-DD`. */
  day: string;
  count: number;
  /** O gün kayıt yoksa null (grafikte boşluk; 0'a çakılmaz — rapor #18). */
  avgRating: number | null;
  positive: number;
  neutral: number;
  negative: number;
  pending: number;
  /** Karşılaştırma döneminin aynı sıradaki günü (yoksa null). */
  compareDay: string | null;
  compareCount: number | null;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  pending: number;
  total: number;
}

export interface TopicRow {
  /** Kanonik anahtar (`service`, `waiting` …) ya da normalize edilmiş ham konu. */
  key: string;
  known: boolean;
  count: number;
  positive: number;
  negative: number;
  /** (olumlu − olumsuz) / adet, −1..1. */
  net: number;
  compareCount: number | null;
  /** `fix`: sık + olumsuz · `strength`: sık + olumlu · `watch`: diğer. */
  quadrant: 'fix' | 'strength' | 'watch';
}

export interface QrRow {
  id: string;
  name: string;
  code: string;
  locationId: string | null;
  locationName: string | null;
  archived: boolean;
  feedbacks: number;
  avgRating: number | null;
  /** Bayes-düzeltilmiş puan (az örneklemde genel ortalamaya çekilir). */
  bayesRating: number | null;
  positiveShare: number | null;
  scans: number | null;
  conversion: number | null;
  compareFeedbacks: number | null;
  /** Geri bildirim adedinin göreli değişimi (%); önceki 0 ise null. */
  feedbackDelta: number | null;
}

export interface PeakInsight {
  /** En yoğun saat (İstanbul), örneklem eşiği altındaysa null (rapor B-4). */
  hour: { hour: number; count: number; share: number } | null;
  day: { day: Weekday; count: number; share: number } | null;
  n: number;
  minN: number;
}

export type AnomalyKind = 'negative_spike' | 'volume_spike';

export interface Anomaly {
  day: string;
  kind: AnomalyKind;
  value: number;
  /** Beklenen değer (dönem ortalamasından). */
  expected: number;
}

export interface BestQrInsight {
  id: string;
  name: string;
  avgRating: number;
  bayesRating: number;
  feedbacks: number;
}

export interface AnalyticsOverview {
  generatedAt: string;
  tz: typeof ANALYTICS_TZ;
  query: AnalyticsQuery;
  filters: AnalyticsFiltersInfo;
  kpis: OverviewKpis;
  conversionStatus: ConversionStatus;
  series: SeriesPoint[];
  sentiment: SentimentBreakdown;
  /** 5 → 1 yıldız, adet. */
  ratings: Array<{ star: 1 | 2 | 3 | 4 | 5; count: number }>;
  topics: TopicRow[];
  /** Konu analizi kapsamı: AI analizli QR yorumu sayısı. */
  topicsBase: number;
  qr: QrRow[];
  bestQr: BestQrInsight | null;
  peaks: PeakInsight;
  anomalies: Anomaly[];
  /** Hiç kayıt yok (dönemden bağımsız): onboarding boş durumu. */
  hasAnyData: boolean;
}

export interface HeatCell {
  hour: number;
  feedback: number;
  /** Hücredeki ortalama puan (kayıt yoksa null). */
  avgRating: number | null;
  negative: number;
  visits: number;
  revenue: number;
  compareFeedback: number | null;
  compareVisits: number | null;
  compareRevenue: number | null;
}

export interface HeatRow {
  day: Weekday;
  cells: HeatCell[];
}

export interface HeatWindow {
  day: Weekday;
  hour: number;
}

export interface HeatmapInsights {
  /** Seçili metrikte en yüksek hücre (n eşiği altındaysa null). */
  peak: (HeatWindow & { value: number; compareValue: number | null }) | null;
  /** Ortalama puanın genel ortalamanın belirgin altında kaldığı pencere (n ≥ minCellN). */
  qualityDip: (HeatWindow & { avgRating: number; n: number; baseline: number }) | null;
  /** Bayes puanı en düşük şube (en az iki şube ve yeterli örneklem). */
  attentionLocation: { id: string | null; name: string | null; bayesRating: number; avgRating: number; feedbacks: number } | null;
  minN: number;
  minCellN: number;
}

export interface LocationRow {
  /** null = şubesiz QR'lar. */
  id: string | null;
  name: string | null;
  feedbacks: number;
  avgRating: number | null;
  bayesRating: number | null;
  positive: number;
  neutral: number;
  negative: number;
  pending: number;
  qr: Array<Pick<QrRow, 'id' | 'name' | 'archived' | 'feedbacks' | 'avgRating' | 'positiveShare'> & {
    positive: number;
    neutral: number;
    negative: number;
    pending: number;
  }>;
}

export interface ActivityHeatmap {
  generatedAt: string;
  tz: typeof ANALYTICS_TZ;
  query: HeatmapQuery;
  filters: AnalyticsFiltersInfo & { metric: HeatmapMetric };
  /** Ziyaret ve ciro yalnız şube süzgeci yokken (tüketim şubeye bağlı değil). */
  availability: { visits: boolean; revenue: boolean };
  rows: HeatRow[];
  totals: {
    feedback: number;
    visits: number;
    revenue: number;
    compareFeedback: number | null;
    compareVisits: number | null;
    compareRevenue: number | null;
    avgRating: number | null;
  };
  insights: HeatmapInsights;
  locations: LocationRow[];
}

/** React Query anahtarları (sunucu ön-yükleme ile istemci aynı anahtarı kurar). */
export function overviewQueryKey(q: AnalyticsQuery): readonly unknown[] {
  return ['dealer-analytics', 'overview', q.range.from, q.range.to, q.compare, q.channel, q.location ?? ''] as const;
}

export function heatmapQueryKey(q: HeatmapQuery): readonly unknown[] {
  return ['dealer-analytics', 'heatmap', q.range.from, q.range.to, q.compare, q.location ?? '', q.metric] as const;
}
