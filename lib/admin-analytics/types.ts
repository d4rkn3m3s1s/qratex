/**
 * Admin Platform Analitiği (a-analitik) — paylaşılan sözleşme tipleri.
 *
 * Sunucu sayıyı hesaplar, istemci yalnız biçimler. Bütün yanıtlar JSON'a serileşebilir
 * (Redis önbelleği + React Query hidrasyonu aynı nesneyi taşır). Etiket değil KOD döner;
 * metinler istemcideki `copy.ts`'te (TR/EN).
 */
import type { CompareMode, DateRangePreset, DayRange } from '@/components/ds/page/date-range';
import type { PlaceCategory } from '@/lib/places/categories';

export const ANALYTICS_TZ = 'Europe/Istanbul' as const;

/** Sekmeler = BFF bölümleri (her biri ayrı uç, ayrı önbellek anahtarı). */
export const ADMIN_ANALYTICS_SECTIONS = ['overview', 'dealers', 'sectors', 'root-cause', 'cards'] as const;
export type AdminAnalyticsSection = (typeof ADMIN_ANALYTICS_SECTIONS)[number];

/** Değerlendirme kaynağı: QR geri bildirimi, tüketim (ziyaret) yorumu ya da ikisi. */
export const REVIEW_SOURCES = ['all', 'qr', 'consumption'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

/** Sektör süzgeci: sözlük slug'ı ya da `none` (kategorisi türetilemeyen bayiler). */
export type SectorFilter = PlaceCategory | 'none';

export interface AdminAnalyticsQuery {
  preset: DateRangePreset;
  range: DayRange;
  compare: CompareMode;
  compareRange: DayRange | null;
  source: ReviewSource;
  /** Temiz veri: güven işaretli yorumlar, gölge yasaklı ve demo hesaplar hariç (varsayılan açık). */
  clean: boolean;
  sector: SectorFilter | null;
}

/** Tek karşılaştırma sözleşmesi (rapor B-2): KPI ve kıyas kartları aynı nesneyi kullanır. */
export interface Comparison {
  current: number | null;
  previous: number | null;
  /** current − previous (karşılaştırma yoksa null). */
  deltaAbs: number | null;
  /** Göreli değişim % (önceki 0 ya da yoksa null — "sabit %100" yok). */
  deltaPct: number | null;
}

export interface OverviewSeriesPoint {
  day: string;
  reviews: number;
  avgRating: number | null;
  newUsers: number;
  scans: number;
  negative: number;
  /** Karşılaştırma döneminde aynı sıradaki gün ve değeri. */
  compareDay: string | null;
  compareReviews: number | null;
}

export interface SentimentCounts {
  positive: number;
  neutral: number;
  negative: number;
  /** Metinli ama AI analizi bekleyen kayıtlar (nötre katılmaz — rapor B-8). */
  pending: number;
  total: number;
}

export type RoleKey = 'CUSTOMER' | 'DEALER' | 'STAFF' | 'ADMIN';

export interface AttentionDealer {
  id: string;
  name: string;
  sector: PlaceCategory | null;
  avgRating: number;
  segmentAvg: number;
  z: number;
  n: number;
}

export interface AttentionTopic {
  key: string;
  count: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface AdminOverview {
  query: AdminAnalyticsQuery;
  generatedAt: string;
  tz: typeof ANALYTICS_TZ;
  kpis: {
    reviews: Comparison;
    avgRating: Comparison;
    negativeShare: Comparison;
    activeCustomers: Comparison;
    newUsers: Comparison;
    scans: Comparison;
    /** Dönemde kayıt olan müşterilerden aynı dönemde ilk etkileşimini yapanların %'si. */
    activation: Comparison;
  };
  /** Rating örneklemi (ortalama puanın n'i). */
  ratingN: number;
  /** Tarama olayları 90 günlük saklama süresine tabi; aralık bunu aşıyorsa kısmi. */
  scansPartial: boolean;
  series: OverviewSeriesPoint[];
  sentiment: SentimentCounts;
  /** 1..5 yıldız adetleri (indeks 0 = 1 yıldız). */
  ratings: [number, number, number, number, number];
  /** Pazartesi başlangıçlı 7 × 24 ızgara (İstanbul saati). */
  heatmap: { cells: number[][]; max: number; total: number };
  /** Tüm zamanlar: rol kırılımı (toplam = rollerin toplamı). */
  userBase: { total: number; byRole: Record<RoleKey, number> };
  attention: { dealers: AttentionDealer[]; topics: AttentionTopic[] };
  hasAnyData: boolean;
}

/** `insufficient`: n < minN (kıyasa girmez); `no-peers`: kıyaslanacak en az 3 akran yok. */
export type BenchmarkStatus = 'low' | 'high' | 'normal' | 'no-peers' | 'insufficient';

export interface DealerRow {
  id: string;
  name: string;
  sector: PlaceCategory | null;
  n: number;
  avgRating: number | null;
  /** Bayes düzeltmeli ortalama (az örneklemli bayi listeyi ele geçirmesin). */
  bayesRating: number | null;
  positiveShare: number | null;
  negativeShare: number | null;
  previousN: number | null;
  deltaPct: number | null;
  /** Bayinin KENDİSİ hariç segment ortalaması (leave-one-out). */
  segmentAvg: number | null;
  segmentPeers: number;
  /** Kıyas grubu: aynı sektör ya da (sektör yok / akran yetersiz) platform geneli. */
  segmentScope: 'sector' | 'platform';
  z: number | null;
  status: BenchmarkStatus;
}

export interface AdminDealers {
  query: AdminAnalyticsQuery;
  generatedAt: string;
  platformAvg: number | null;
  minN: number;
  bayesPrior: number;
  thresholds: { low: number; high: number; minPeers: number };
  rows: DealerRow[];
  /** Dönemde değerlendirmesi olan ama `minN` altındaki bayi sayısı (kıyasa girmez). */
  insufficient: number;
  /** Dönemde hiç değerlendirmesi olmayan bayi sayısı. */
  silent: number;
  totalDealers: number;
}

export interface SectorRow {
  sector: SectorFilter;
  dealerCount: number;
  activeDealers: number;
  n: number;
  avgRating: number | null;
  /** Bayi ağırlıklı ortalama (her bayi tek oy; minN'i geçen bayiler). */
  dealerAvgRating: number | null;
  scans: number;
  previousN: number | null;
  previousAvg: number | null;
  deltaPct: number | null;
  deltaAvg: number | null;
  /** Platformun geri kalanına göre standart hata cinsinden fark. */
  z: number | null;
  /** k-anonimlik: bayi sayısı eşiğin altında (dışa açılmaz, soluk gösterilir). */
  lowSample: boolean;
}

export interface SectorFocus {
  sector: SectorFilter;
  avgRating: number;
  platformAvg: number;
  n: number;
  dealers: number;
  z: number;
}

export interface AdminSectors {
  query: AdminAnalyticsQuery;
  generatedAt: string;
  kMin: number;
  rows: SectorRow[];
  totalDealers: number;
  uncategorized: number;
  /** Kategorisi türetilebilen bayilerin %'si. */
  categorizedShare: number | null;
  platformAvg: number | null;
  focus: SectorFocus | null;
}

export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening';
export const DAY_PARTS: readonly DayPart[] = ['night', 'morning', 'afternoon', 'evening'];

export interface RootCauseTopic {
  key: string;
  count: number;
  /** Konulu olumsuz QR geri bildirimleri içindeki payı (%). */
  share: number;
  previous: number | null;
  deltaPct: number | null;
  dayParts: Record<DayPart, number>;
  dealers: Array<{ id: string; name: string; count: number }>;
}

export interface AdminRootCause {
  query: AdminAnalyticsQuery;
  generatedAt: string;
  negative: Comparison;
  /** Konusu olan olumsuz QR geri bildirimi (payların paydası). */
  topicBase: number;
  topics: RootCauseTopic[];
}

export interface AdminCards {
  query: AdminAnalyticsQuery;
  generatedAt: string;
  allTime: { total: number; unused: number; activated: number; blocked: number; archived: number };
  period: {
    activated: Comparison;
    blocked: Comparison;
    consumptions: Comparison;
    reviews: Comparison;
    /** Tüketimlerin yorumlanma oranı (%). */
    reviewRate: Comparison;
  };
}

export type SectionData = {
  overview: AdminOverview;
  dealers: AdminDealers;
  sectors: AdminSectors;
  'root-cause': AdminRootCause;
  cards: AdminCards;
};

/** React Query anahtarı: SSR ön-yükleme ve istemci aynı anahtarı üretir. */
export function sectionQueryKey(section: AdminAnalyticsSection, cacheKey: string): readonly unknown[] {
  return ['admin', 'analytics', 'v2', section, cacheKey] as const;
}
