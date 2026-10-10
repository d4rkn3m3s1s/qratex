/**
 * Bayi Kıyas (b-kiyas-etki) — paylaşılan yanıt sözleşmesi (sunucu + istemci; Prisma'ya bağımlı değil).
 *
 * Sunucu sayıyı hesaplar, istemci yalnız biçimler (yol haritası §4.4/7). Metin YOK: metrik
 * anahtarı, kategori slug'ı, şehir anahtarı ve durum kodları döner; kopya istemcide.
 *
 * Gizlilik sözleşmesi (k-anonimlik): akran istatistiği yalnız seçili segmentte bayinin KENDİSİ
 * HARİÇ en az `K_ANON_MIN` katkı veren (dönemde yeterli örneklemi olan) işletme varsa döner.
 * Uç değeri ele verebilecek üst/alt %10 eşiği için `K_ANON_DECILE_MIN` aranır. Ham akran hacmi,
 * akran kimliği ya da tekil akran değeri hiçbir alanda yoktur.
 */
import type { DayRange } from '@/components/ds/page/date-range';
import type { PlaceCategory } from '@/lib/places/categories';

export const BENCHMARK_TZ = 'Europe/Istanbul' as const;

/** Akran grubu: tüm platform, aynı sektör, aynı şehir. */
export type PeerGroup = 'platform' | 'category' | 'city';
export const PEER_GROUPS: readonly PeerGroup[] = ['platform', 'category', 'city'];

/** Kıyas dönemi (yalnız eşit uzunlukta, karşılaştırılabilir pencereler). */
export type BenchmarkPreset = 'last7' | 'last30' | 'last90';
export const BENCHMARK_PRESETS: readonly BenchmarkPreset[] = ['last7', 'last30', 'last90'];
export const BENCHMARK_DEFAULT_PRESET: BenchmarkPreset = 'last30';

/** k-anonimlik: segment istatistiği için en az bu kadar BAŞKA katkı veren işletme. */
export const K_ANON_MIN = 5;
/** Üst/alt %10 eşiği (uç değere yakın) için daha geniş havuz. */
export const K_ANON_DECILE_MIN = 10;

export type BenchmarkMetricKey = 'rating' | 'negativeShare' | 'replyRate' | 'replyTime' | 'actionClose';
export const BENCHMARK_METRICS: readonly BenchmarkMetricKey[] = ['rating', 'negativeShare', 'replyRate', 'replyTime', 'actionClose'];

/** Hangi yön iyi? (`up`: yüksek iyi). */
export const METRIC_DIRECTION: Readonly<Record<BenchmarkMetricKey, 'up' | 'down'>> = {
  rating: 'up',
  negativeShare: 'down',
  replyRate: 'up',
  replyTime: 'down',
  actionClose: 'up',
};

/** Değer birimi: puan (1–5), yüzde (0–100), saniye. */
export const METRIC_UNIT: Readonly<Record<BenchmarkMetricKey, 'rating' | 'percent' | 'seconds'>> = {
  rating: 'rating',
  negativeShare: 'percent',
  replyRate: 'percent',
  replyTime: 'seconds',
  actionClose: 'percent',
};

/** Segmentteki dağılım (bayi HARİÇ). Yetersiz havuzda alanın kendisi null döner. */
export interface PeerDistribution {
  contributors: number;
  p25: number;
  p50: number;
  p75: number;
  /** İyi yöndeki %10 eşiği (yüksek-iyi metrikte p90, düşük-iyi metrikte p10); havuz < K_ANON_DECILE_MIN ise null. */
  top: number | null;
}

export type Standing = 'top' | 'above' | 'below' | 'bottom';

export interface MetricRail {
  key: BenchmarkMetricKey;
  direction: 'up' | 'down';
  unit: 'rating' | 'percent' | 'seconds';
  /** Bayinin değeri (örneklemi yetersizse null). */
  you: number | null;
  /** Değerin dayandığı örneklem (geri bildirim / yanıt / aksiyon adedi). */
  youN: number;
  /** Bu metrikte bayinin değer alması için gereken en az örneklem. */
  minN: number;
  /** Önceki eşit uzunlukta dönemdeki değer. */
  prev: number | null;
  peer: PeerDistribution | null;
  /** Akranların yüzde kaçından iyi (orta sıra; eşitlik yarım sayılır). */
  betterThanPercent: number | null;
  /** İyi yöndeki %10 eşiğine kalan fark (eşiğin üstündeyse 0). */
  gapToTop: number | null;
  standing: Standing | null;
}

export type RankStatus = 'ok' | 'insufficient_data' | 'too_few_peers';

export interface RankInfo {
  status: RankStatus;
  /** 1 = en iyi. Eşitlikte aynı sıra. */
  position: number | null;
  outOf: number | null;
  /** "Üst %X" (küçük = iyi). */
  topPercent: number | null;
  /** Halka doluluğu (büyük = iyi). */
  betterThanPercent: number | null;
  /** Önceki dönemdeki sıra (aynı grup, aynı kural). */
  prevPosition: number | null;
  prevOutOf: number | null;
}

export interface SeriesPoint {
  /** Kova başlangıcı (İstanbul günü `YYYY-MM-DD`; haftalıkta Pazartesi). */
  start: string;
  you: number | null;
  /** Bayinin bu kovadaki örneklemi. */
  n: number;
  /** Akran bandı (25.–75. yüzdelik) ve medyan; havuz yetersizse null. */
  peerP25: number | null;
  peerP50: number | null;
  peerP75: number | null;
}

export type SeriesMetricKey = 'rating' | 'replyRate' | 'negativeShare';
export const SERIES_METRICS: readonly SeriesMetricKey[] = ['rating', 'replyRate', 'negativeShare'];

export interface TopicGap {
  /** Normalize edilmiş konu (AI etiketinden). */
  topic: string;
  /** Olumsuz yorumlarınızın yüzde kaçı bu konuyu anıyor. */
  youShare: number;
  youMentions: number;
  /** Akranlarda aynı oranın medyanı. */
  peerShare: number;
}

export interface LocationRow {
  /** null = şubeye bağlı olmayan QR kodları. */
  id: string | null;
  name: string | null;
  feedback: number;
  avgRating: number | null;
  replyRate: number | null;
  negativeShare: number | null;
  medianReplySec: number | null;
}

export type RecommendationKind = BenchmarkMetricKey | 'topic' | 'more_feedback' | 'set_category';

export interface Recommendation {
  kind: RecommendationKind;
  /** İlgili metrik değerleri (kopya üretimi için). */
  you: number | null;
  target: number | null;
  topic?: string;
  href: string;
  /** Göreli açık (sıralama için; 0..∞). */
  weight: number;
}

export type SegmentReason = 'ok' | 'not_set' | 'too_few';

export interface SegmentInfo {
  group: PeerGroup;
  /** Kategori slug'ı ya da şehir anahtarı (platformda null). */
  key: string | null;
  /** Katkı veren BAŞKA işletme sayısı (k-anon eşiğinin altındaysa yine sayı verilir ama veri dönmez). */
  contributors: number;
  reason: SegmentReason;
}

export interface BenchmarkProfile {
  category: PlaceCategory | null;
  /** Kategori kaynağı: bayinin seçtiği/kayıtlı kategori ya da ürün kategorilerinden türetilmiş. */
  categorySource: 'profile' | 'products' | null;
  city: string | null;
  /** Şehir adresten türetilir (kayıtlı alan yok). */
  citySource: 'address' | null;
}

export type BenchmarkStatus = 'ready' | 'insufficient_data';

export interface BenchmarkData {
  generatedAt: string;
  tz: typeof BENCHMARK_TZ;
  period: { preset: BenchmarkPreset; range: DayRange; compareRange: DayRange; bucket: 'day' | 'week' };
  group: PeerGroup;
  segments: SegmentInfo[];
  profile: BenchmarkProfile;
  /** Bayinin dönemdeki toplam değerlendirme sayısı ve sıralamaya girme eşiği. */
  self: { feedback: number; minFeedback: number; status: BenchmarkStatus };
  rank: RankInfo;
  metrics: MetricRail[];
  series: Record<SeriesMetricKey, SeriesPoint[]>;
  topics: TopicGap[];
  locations: LocationRow[];
  recommendations: Recommendation[];
}

export interface BenchmarkQuery {
  preset: BenchmarkPreset;
  /** null → sunucu seçer (kategori uygunsa kategori, değilse platform). */
  group: PeerGroup | null;
}

export function benchmarkQueryKey(q: BenchmarkQuery): readonly unknown[] {
  return ['dealer-benchmark', q.preset, q.group ?? 'auto'] as const;
}
