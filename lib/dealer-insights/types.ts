/**
 * Bayi İçgörüler (b-icgoruler) — paylaşılan yanıt sözleşmesi.
 *
 * İlke (yol haritası §4.4/7): SAYIYI KOD HESAPLAR, LLM YALNIZ ANLATIR.
 *  - Bütün metrikler, tema tablosu, sinyal dağılımları, kural tabanlı uyarılar ve öneri
 *    sıralaması deterministiktir (`core.ts`, jest'li). LLM'e yalnız bu hesaplanmış "olgular"
 *    gider; çıktısındaki her cümle bir olguya (`ref`) bağlanır, bağlanamayan cümle atılır.
 *  - GET hiçbir zaman LLM çağırmaz; anlatı yalnız POST ("Anlatı üret") ile üretilir ve
 *    `AIInsightReport` tablosunda saklanır.
 *  - Metin yok: istemci kod + parametreyi kopya dosyasıyla çevirir (TR/EN).
 * Tüm alanlar JSON'a kayıpsız serileşir (SSR → HydrationBoundary → istemci).
 */
import type { MetricValue } from '@/components/ds/data/metric-format';
import type { CompareMode, DateRangePreset, DayRange } from '@/components/ds/page/date-range';

export const INSIGHTS_TZ = 'Europe/Istanbul' as const;

/** Çözülmüş sorgu (URL ↔ sunucu ↔ önbellek anahtarı aynı kaynaktan). */
export interface InsightsQuery {
  preset: DateRangePreset;
  /** İstanbul takvim günleri, uçlar dahil. */
  range: DayRange;
  compare: CompareMode;
  compareRange: DayRange | null;
  /** Şube kimliği, `'none'` (şubesiz QR'lar) ya da null (tümü). Seçiliyse yalnız QR kanalı. */
  location: string | null;
}

export type SentimentKey = 'positive' | 'neutral' | 'negative' | 'pending';
export type IntentKey = 'complaint' | 'suggestion' | 'praise' | 'question' | 'general';
export const INTENT_KEYS: readonly IntentKey[] = ['complaint', 'suggestion', 'praise', 'question', 'general'];

export type EmotionKey =
  | 'happy'
  | 'satisfied'
  | 'grateful'
  | 'excited'
  | 'disappointed'
  | 'angry'
  | 'frustrated'
  | 'sad'
  | 'confused'
  | 'neutral'
  | 'surprised'
  | 'worried';
export const EMOTION_KEYS: readonly EmotionKey[] = [
  'happy',
  'satisfied',
  'grateful',
  'excited',
  'disappointed',
  'angry',
  'frustrated',
  'sad',
  'confused',
  'neutral',
  'surprised',
  'worried',
];

export type EntityType = 'product' | 'person' | 'location' | 'service' | 'facility' | 'brand' | 'other';
export const ENTITY_TYPES: readonly EntityType[] = ['product', 'person', 'location', 'service', 'facility', 'brand', 'other'];

export type RecPriority = 'critical' | 'high' | 'medium' | 'low';

/** Örneklem özeti — her sayının hangi kümeden geldiği görünür olsun. */
export interface InsightsSample {
  /** Dönemdeki toplam kayıt (QR + tüketim yorumu). */
  total: number;
  qr: number;
  consumption: number;
  /** Metinli kayıt. */
  withText: number;
  /** AI analizi tamamlanmış metinli kayıt. */
  analyzed: number;
  /** Metinli ama analizi bekleyen kayıt (otomatik hat işler). */
  pending: number;
  /** Tema/öneri/sinyal üretilmiş (QR) kayıt — tema ve sinyal paydası. */
  withSignals: number;
  /** Kayıt tavanına takıldı mı (en yeni N kayıt kullanıldı). */
  truncated: boolean;
}

export interface InsightsMetrics {
  /** Ortalama puan (1-5), n = puanlı kayıt. */
  avgRating: MetricValue;
  /** CSAT = 4-5 yıldız oranı (%). */
  csat: MetricValue;
  /** Olumsuz oranı (1-2 yıldız ya da AI duygusu olumsuz) (%). */
  negativeRate: MetricValue;
  /** Yanıt oranı = yanıtlanan metinli kayıt / metinli kayıt (%). */
  responseRate: MetricValue;
  /** Geri bildirim hacmi. */
  volume: MetricValue;
  /** Kayıp riski yüksek (AI churn ≥ 0,7) kayıt sayısı. */
  highChurn: MetricValue;
  /** Gerçek 0-10 tavsiye sorusu yanıtı varsa NPS; yoksa null (kart gösterilmez). */
  nps: MetricValue | null;
}

export interface ThemeRow {
  /** Normalize anahtar (küçük harf, tek boşluk). */
  key: string;
  /** En sık görülen yazım. */
  label: string;
  /** Bu temadan bahseden kayıt sayısı. */
  count: number;
  /** Karşılaştırma dönemindeki sayı (karşılaştırma yoksa null). */
  prevCount: number | null;
  /** Temalı kayıtlar içindeki payı (%). */
  share: number;
  /** Bu temadan bahsedenlerin ortalama yıldızı (1-5). */
  avgRating: number | null;
  /** Tema düzeyinde olumsuz/olumlu payı (%). */
  negativeShare: number;
  positiveShare: number;
  /** Önceki dönem olumsuz payı (%), yoksa null. */
  prevNegativeShare: number | null;
  /**
   * Puan farkı: (bu temadan bahsedenlerin ort. yıldızı) − (temalı ama bu temadan bahsetmeyenlerin
   * ort. yıldızı). İLİŞKİDİR, NEDEN DEĞİL. Her iki grupta en az `IMPACT_MIN_N` kayıt yoksa null.
   */
  ratingGap: number | null;
  nWith: number;
  nWithout: number;
  /** En sık alt temalar (en çok 3). */
  subThemes: string[];
}

export interface EntityRow {
  key: string;
  name: string;
  type: EntityType;
  count: number;
  negativeShare: number;
  positiveShare: number;
}

export interface SignalSummary {
  intents: Record<IntentKey, number>;
  /** Aciliyet kovaları (AI 0-1): yüksek ≥ 0,7; orta 0,4-0,7; düşük < 0,4. */
  urgency: { high: number; medium: number; low: number };
  churn: { high: number; medium: number; low: number };
  /** Müşteri eforu (AI 0-1) yüksek ≥ 0,7 olan kayıt. */
  highEffort: number;
  /** Ortalama efor (0-1), n = efor ölçülen kayıt. */
  avgEffort: number | null;
  effortN: number;
  toxic: number;
  emotions: Array<{ key: string; count: number }>;
}

export type AlertKind =
  | 'negative_spike'
  | 'urgent_open'
  | 'churn_high'
  | 'theme_worsening'
  | 'toxic'
  | 'analysis_backlog'
  | 'rating_drop';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface InsightAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Kopya şablonunun parametreleri (yalnız sayı/etiket). */
  params: Record<string, number | string>;
  /** İlgili kayıtların listesi (Gelen Kutusu süzgeci ya da tema kanıtı). */
  target: { kind: 'inbox'; query: Record<string, string> } | { kind: 'theme'; key: string };
}

export interface Recommendation {
  /** Normalize metnin kararlı özeti (aksiyon listesi eşlemesi + React anahtarı). */
  id: string;
  text: string;
  priority: RecPriority;
  /** Bu öneriyi taşıyan kayıt sayısı. */
  count: number;
  /** Örnek kaynak kayıtlar (en çok 5, en yeni önce). */
  feedbackIds: string[];
  /** Kaynak kayıtlarda en sık geçen temalar (en çok 2). */
  themeKeys: string[];
  /** Açık aksiyon listesinde var mı (beklemede/atandı/sürüyor). */
  actionItemId: string | null;
}

export type NarrativeRefKind = 'metric' | 'theme' | 'alert' | 'rec';

export interface NarrativeRef {
  kind: NarrativeRefKind;
  /** Metrik adı, tema anahtarı, uyarı kimliği ya da öneri kimliği. */
  key: string;
  /** Üretim anındaki görünen ad (tema/öneri sonradan değişse de kaynak okunur kalsın). */
  label: string;
}

export interface NarrativeLine {
  text: string;
  refs: NarrativeRef[];
}

export interface NarrativeView {
  summary: NarrativeLine;
  highlights: NarrativeLine[];
  actions: Array<NarrativeLine & { priority: 'high' | 'medium' | 'low' }>;
  generatedAt: string;
  /** Üretildiğinde dönemdeki kayıt sayısı. */
  basedOn: number;
  /** O andan bu yana dönemde kayıt sayısı değişti mi. */
  stale: boolean;
  /** Yeniden üretim en erken ne zaman (soğuma). */
  cooldownUntil: string | null;
  locale: 'tr' | 'en';
}

export type AiAvailability = 'ok' | 'not_configured' | 'module_off' | 'dealer_off';

export interface InsightsAggregates {
  sample: InsightsSample;
  compareTotal: number | null;
  metrics: InsightsMetrics;
  sentiment: Record<SentimentKey, number>;
  /** 1..5 yıldız sayıları (dizin 0 = 1 yıldız). */
  ratingDist: [number, number, number, number, number];
  themes: ThemeRow[];
  entities: EntityRow[];
  signals: SignalSummary;
  alerts: InsightAlert[];
  recommendations: Recommendation[];
  /** Sparkline kovası: 'day' (≤ 31 gün) ya da 'week' (Pazartesi başlangıçlı). */
  bucket: 'day' | 'week';
}

export interface InsightsData extends InsightsAggregates {
  query: InsightsQuery;
  generatedAt: string;
  narrative: NarrativeView | null;
  ai: AiAvailability;
  locations: Array<{ id: string; name: string }>;
  /** Aksiyon ataması için kişiler (bayinin kendisi + aktif personel). E-posta yok. */
  assignees: Array<{ id: string; name: string; self: boolean }>;
  /** Yazma yetkisi (DEALER evet; ADMIN salt-okunur görüntüler). */
  canWrite: boolean;
}

/** Kanıt listesi (tema / öneri / duygu süzgeci). */
export interface EvidenceItem {
  /** Gelen Kutusu anahtarı: `qr-<id>` ya da `cr-<id>`. */
  key: string;
  source: 'qr' | 'consumption';
  rating: number;
  sentiment: SentimentKey;
  sentimentBasis: 'ai' | 'rating' | 'pending' | 'corrected';
  /** Metin önizlemesi (en çok 280 karakter). */
  preview: string | null;
  createdAt: string;
  replied: boolean;
  /** Bayi duyguyu düzeltti mi (yalnız QR). */
  corrected: boolean;
  canCorrect: boolean;
  qrName: string | null;
}

export interface EvidencePage {
  items: EvidenceItem[];
  nextCursor: string | null;
  /** Süzgece uyan toplam (tavan dahilinde). */
  total: number;
}

export const INSIGHTS_QUERY_KEY = 'dealer-insights' as const;

export function insightsQueryKey(search: string) {
  return [INSIGHTS_QUERY_KEY, search] as const;
}
