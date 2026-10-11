'use client';

/**
 * a-analitik metinleri (TR/EN). API kod döner (sektör slug'ı, konu anahtarı, durum kodu);
 * etiketler burada. Rapor B-15/B-9 (insights): "Root Cause Graph", "Tenant Benchmark",
 * "general", "Global Benchmarks" gibi karışık dilli başlıklar kaldırıldı.
 */
import { useDsLocale, type DsLocale } from '@/components/ds/a11y/copy';
import { categoryLabel, isPlaceCategory } from '@/lib/places/categories';
import { topicLabel as dealerTopicLabel } from '@/components/dealer/b-analitik/copy';
import type { BenchmarkStatus, DayPart, ReviewSource } from '@/lib/admin-analytics/types';

const tr = {
  title: 'Platform analitiği',
  description: 'Büyüme, deneyim kalitesi, bayi kıyası ve sektör kırılımı. Tüm saatler İstanbul saatine göre.',
  filtersLabel: 'Analitik süzgeçleri',
  period: 'Dönem',
  source: 'Kaynak',
  sources: { all: 'Tüm değerlendirmeler', qr: 'QR geri bildirimi', consumption: 'Ziyaret yorumu' } satisfies Record<ReviewSource, string>,
  sector: 'Sektör',
  allSectors: 'Tüm sektörler',
  noSector: 'Sektörü belirsiz',
  data: 'Veri',
  cleanOn: 'Temiz veri',
  cleanOff: 'Tüm kayıtlar',
  cleanNote: 'Temiz veri: güven işaretli yorumlar, gölge yasaklı ve demo hesaplar hariç.',
  updating: 'Güncelleniyor…',
  updatedAgo: (rel: string) => `${rel} güncellendi`,
  refresh: 'Yenile',
  refreshing: 'Yenileniyor…',
  refreshFailed: 'Veriler yenilenemedi.',
  export: 'Dışa aktar',
  exportDone: 'CSV indirildi.',
  exportPrint: 'Yazdır / PDF',
  tzNote: 'Saatler: Europe/Istanbul (GMT+3). Silinen kayıtlar hiçbir metriğe girmez.',
  tabsLabel: 'Analitik bölümleri',
  tabs: { overview: 'Genel bakış', dealers: 'Bayiler', sectors: 'Sektörler', 'root-cause': 'Kök neden', cards: 'Kart sistemi' },
  vsPrevious: 'önceki döneme göre',
  vsYoy: 'geçen yılın aynı dönemine göre',
  allTime: 'Tüm zamanlar',
  platformScope: 'Platform geneli; sektör ve kaynak süzgecinden etkilenmez',

  // Genel bakış
  kpiReviews: 'Değerlendirme',
  kpiReviewsHint: 'QR geri bildirimi + ziyaret yorumu',
  kpiAvg: 'Ortalama puan',
  kpiNegative: 'Olumsuz oranı',
  kpiActive: 'Aktif müşteri',
  kpiActiveHint: 'Dönemde değerlendirme bırakan tekil kişi',
  kpiNewUsers: 'Yeni kullanıcı',
  kpiScans: 'QR tarama',
  kpiScansPartial: 'Tarama olayları 90 gün saklanır; aralığın eski kısmı eksik.',
  kpiActivation: 'Aktivasyon',
  kpiActivationHint: 'Dönemde kaydolup ilk etkileşimini yapan müşteri oranı',
  trendTitle: 'Günlük değerlendirme',
  trendDescription: 'Sütun: değerlendirme adedi · çizgi: ortalama puan · kesikli: karşılaştırma dönemi',
  trendSummary: (total: string, days: number) => `${days} günde toplam ${total} değerlendirme.`,
  colDay: 'Gün',
  colReviews: 'Değerlendirme',
  colAvg: 'Ort. puan',
  colNegative: 'Olumsuz',
  colNewUsers: 'Yeni kullanıcı',
  colScans: 'Tarama',
  colCompare: 'Karşılaştırma',
  colCompareDay: 'Karşılaştırma günü',
  sentimentTitle: 'Duygu dağılımı',
  sentimentDescription: (n: string) => `${n} değerlendirme · analiz bekleyenler nötre katılmaz`,
  positive: 'Olumlu',
  neutral: 'Nötr',
  negative: 'Olumsuz',
  pending: 'Analiz bekliyor',
  ratingTitle: 'Puan dağılımı',
  stars: (n: number) => `${n} yıldız`,
  heatTitle: 'Etkinlik saatleri',
  heatDescription: 'Gün × saat değerlendirme yoğunluğu (İstanbul saati)',
  heatCell: (day: string, hour: number, n: string) => `${day} ${String(hour).padStart(2, '0')}:00 — ${n} değerlendirme`,
  heatLess: 'Az',
  heatMore: 'Çok',
  heatEmpty: 'Bu dönemde saatlik dağılım için kayıt yok.',
  showTable: 'Tabloyu göster',
  hideTable: 'Tabloyu gizle',
  userBaseTitle: 'Kullanıcı tabanı',
  roles: { CUSTOMER: 'Müşteri', DEALER: 'Bayi', STAFF: 'Personel', ADMIN: 'Yönetici' },
  total: 'Toplam',
  attentionTitle: 'Dikkat gerektirenler',
  attentionDescription: 'Kıyas grubunun belirgin altında kalan bayiler ve yükselen olumsuz konular',
  attentionNone: 'Bu dönemde belirgin bir sapma yok.',
  attentionDealer: (avg: string, seg: string) => `Ort. ${avg} · grup ${seg}`,
  attentionTopic: (n: string, prev: string) => `${n} olumsuz · önceki ${prev}`,
  seeDealers: 'Bayi kıyasına git',
  seeRootCause: 'Kök nedene git',
  emptyTitle: 'Henüz platform verisi yok',
  emptyDescription: 'Kullanıcılar kaydoldukça ve değerlendirme geldikçe burası dolacak.',
  emptyPeriodTitle: 'Bu dönemde değerlendirme yok',
  emptyPeriodDescription: 'Dönemi genişletin ya da süzgeçleri temizleyin.',
  activityMoved: 'Canlı etkinlik akışı Platform Nabzı sayfasında.',
  activityLink: 'Platform Nabzı',

  // Bayiler
  dealersTitle: 'Bayi kıyası',
  dealersDescription: (minN: string, peers: string) =>
    `Bayes düzeltmeli puana göre sıralı. En az ${minN} değerlendirmesi olan bayiler, kendisi hariç en az ${peers} akranlı grupla kıyaslanır.`,
  dealersThresholds: (low: string, high: string) => `Sapma eşikleri: z ≤ ${low} düşük, z ≥ ${high} yüksek.`,
  dealersInsufficient: (n: string) => `${n} bayi yetersiz veri (kıyas dışı)`,
  dealersSilent: (n: string) => `${n} bayi dönemde değerlendirme almadı`,
  dealersEmpty: 'Bu dönemde değerlendirme alan bayi yok.',
  colDealer: 'Bayi',
  colSector: 'Sektör',
  colN: 'Değerlendirme',
  colBayes: 'Düzeltilmiş puan',
  colPositive: 'Olumlu %',
  colNegativeShare: 'Olumsuz %',
  colChange: 'Değişim',
  colSegment: 'Grup ort.',
  colZ: 'Sapma (z)',
  colStatus: 'Durum',
  segmentSector: 'sektör',
  segmentPlatform: 'platform',
  status: {
    low: 'Grubun altında',
    high: 'Grubun üstünde',
    normal: 'Olağan',
    'no-peers': 'Akran yetersiz',
    insufficient: 'Yetersiz veri',
  } satisfies Record<BenchmarkStatus, string>,
  searchDealers: 'Bayi ara',
  openFeedbacks: (name: string) => `${name} geri bildirimlerini aç`,
  unnamed: 'Adsız işletme',

  // Sektörler
  sectorsTitle: 'Sektör karşılaştırması',
  sectorsDescription: 'Sektör, işletme kategorisinden ya da ürün kategorisi adlarından türetilir; demo etiketleri yok sayılır.',
  sectorsModuleOff: 'Sektör karşılaştırması modülü kapalı.',
  sectorsUncategorized: 'Sektörü belirsiz bayi',
  sectorsCategorized: 'Sektörü belirli bayi oranı',
  sectorsPlatformAvg: 'Platform ortalaması',
  sectorsNoFilter: 'Bu sekme sektör kırılımının kendisidir; sektör süzgeci uygulanmaz.',
  sectorsEmpty: 'Henüz bayi yok.',
  colDealers: 'Bayi',
  colActiveDealers: 'Aktif bayi',
  colDealerAvg: 'Bayi ağırlıklı ort.',
  colAvgDelta: 'Puan farkı',
  lowSample: 'Örneklem küçük',
  lowSampleHint: (k: string) => `${k} bayiden az: anonimlik için dışa açılmaz`,
  focusTitle: 'Odak önerisi',
  focusText: (sector: string, avg: string, platform: string, n: string, dealers: string) =>
    `${sector} sektörünün ortalaması ${avg}; platformun geri kalanı ${platform}. ${n} değerlendirme, ${dealers} aktif bayi — fark istatistiksel olarak anlamlı.`,
  focusNone: 'Platformun belirgin altında kalan, yeterli örneklemli bir sektör yok.',
  focusAction: 'Aksiyon planı oluştur',
  assignHint: 'Sektör, bayinin işletme kategorisi ya da ürün kategorileri girildikçe belirlenir.',

  // Kök neden
  rootTitle: 'Olumsuz konular',
  rootDescription: 'Olumsuz QR geri bildirimlerinde geçen konular; gün dilimi ve en çok geçtiği bayilerle döküm.',
  rootNegative: 'Olumsuz değerlendirme',
  rootBase: (n: string) => `Payların paydası: konusu belirlenmiş ${n} olumsuz geri bildirim.`,
  rootOnlyQr: 'Konular yalnız QR geri bildirimlerinde var; ziyaret yorumu kaynağında döküm yapılamaz.',
  rootEmpty: 'Bu dönemde konusu belirlenmiş olumsuz geri bildirim yok.',
  colTopic: 'Konu',
  colShare: 'Pay',
  colTopDealers: 'En çok geçtiği bayiler',
  dayParts: { night: 'Gece (00–06)', morning: 'Sabah (06–12)', afternoon: 'Öğleden sonra (12–17)', evening: 'Akşam (17–24)' } satisfies Record<DayPart, string>,

  // Kart sistemi
  cardsTitle: 'Kart sistemi',
  cardsPeriod: 'Dönem içi',
  cardsActivated: 'Aktive edilen kart',
  cardsBlocked: 'Bloke edilen kart',
  cardsConsumptions: 'Tüketim',
  cardsReviews: 'Tüketim yorumu',
  cardsReviewRate: 'Yorumlanma oranı',
  cardsAllTime: 'Kart envanteri (tüm zamanlar)',
  cardsUnused: 'Kullanılmamış',
  cardsArchived: 'Arşivli',
  cardsEmpty: 'Henüz fiziksel kart üretilmemiş.',
  cardsNote: 'Kart aktivasyon ve blokları sektör süzgecinden etkilenmez; tüketim ve yorumlar etkilenir.',
};

type Copy = typeof tr;

const en: Copy = {
  ...tr,
  title: 'Platform analytics',
  description: 'Growth, experience quality, dealer benchmark and sector breakdown. All times in Istanbul time.',
  filtersLabel: 'Analytics filters',
  period: 'Period',
  source: 'Source',
  sources: { all: 'All reviews', qr: 'QR feedback', consumption: 'Visit review' },
  sector: 'Sector',
  allSectors: 'All sectors',
  noSector: 'Unknown sector',
  data: 'Data',
  cleanOn: 'Clean data',
  cleanOff: 'All records',
  cleanNote: 'Clean data excludes trust-flagged reviews, shadow-banned and demo accounts.',
  updating: 'Updating…',
  updatedAgo: (rel: string) => `updated ${rel}`,
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  refreshFailed: 'Could not refresh data.',
  export: 'Export',
  exportDone: 'CSV downloaded.',
  exportPrint: 'Print / PDF',
  tzNote: 'Times: Europe/Istanbul (GMT+3). Deleted records never count.',
  tabsLabel: 'Analytics sections',
  tabs: { overview: 'Overview', dealers: 'Dealers', sectors: 'Sectors', 'root-cause': 'Root cause', cards: 'Card system' },
  vsPrevious: 'vs previous period',
  vsYoy: 'vs same period last year',
  allTime: 'All time',
  platformScope: 'Platform-wide; not affected by sector and source filters',
  kpiReviews: 'Reviews',
  kpiReviewsHint: 'QR feedback + visit reviews',
  kpiAvg: 'Average rating',
  kpiNegative: 'Negative share',
  kpiActive: 'Active customers',
  kpiActiveHint: 'Unique people who left a review in the period',
  kpiNewUsers: 'New users',
  kpiScans: 'QR scans',
  kpiScansPartial: 'Scan events are kept for 90 days; older part of the range is incomplete.',
  kpiActivation: 'Activation',
  kpiActivationHint: 'Share of customers who signed up and interacted in the period',
  trendTitle: 'Daily reviews',
  trendDescription: 'Bars: review count · line: average rating · dashed: comparison period',
  trendSummary: (total: string, days: number) => `${total} reviews over ${days} days.`,
  colDay: 'Day',
  colReviews: 'Reviews',
  colAvg: 'Avg rating',
  colNegative: 'Negative',
  colNewUsers: 'New users',
  colScans: 'Scans',
  colCompare: 'Comparison',
  colCompareDay: 'Comparison day',
  sentimentTitle: 'Sentiment',
  sentimentDescription: (n: string) => `${n} reviews · pending analysis is not counted as neutral`,
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  pending: 'Pending analysis',
  ratingTitle: 'Rating distribution',
  stars: (n: number) => `${n} star${n === 1 ? '' : 's'}`,
  heatTitle: 'Activity hours',
  heatDescription: 'Review density by weekday × hour (Istanbul time)',
  heatCell: (day: string, hour: number, n: string) => `${day} ${String(hour).padStart(2, '0')}:00 — ${n} reviews`,
  heatLess: 'Less',
  heatMore: 'More',
  heatEmpty: 'No records for an hourly breakdown in this period.',
  showTable: 'Show table',
  hideTable: 'Hide table',
  userBaseTitle: 'User base',
  roles: { CUSTOMER: 'Customer', DEALER: 'Dealer', STAFF: 'Staff', ADMIN: 'Admin' },
  total: 'Total',
  attentionTitle: 'Needs attention',
  attentionDescription: 'Dealers clearly below their peer group and rising negative topics',
  attentionNone: 'No notable deviation in this period.',
  attentionDealer: (avg: string, seg: string) => `Avg ${avg} · group ${seg}`,
  attentionTopic: (n: string, prev: string) => `${n} negative · previously ${prev}`,
  seeDealers: 'Open dealer benchmark',
  seeRootCause: 'Open root cause',
  emptyTitle: 'No platform data yet',
  emptyDescription: 'This fills up as users sign up and reviews arrive.',
  emptyPeriodTitle: 'No reviews in this period',
  emptyPeriodDescription: 'Widen the period or clear the filters.',
  activityMoved: 'The live activity feed lives on Platform Pulse.',
  activityLink: 'Platform Pulse',
  dealersTitle: 'Dealer benchmark',
  dealersDescription: (minN: string, peers: string) =>
    `Sorted by Bayesian-adjusted rating. Dealers with at least ${minN} reviews are compared with a peer group of at least ${peers} (excluding themselves).`,
  dealersThresholds: (low: string, high: string) => `Deviation thresholds: z ≤ ${low} low, z ≥ ${high} high.`,
  dealersInsufficient: (n: string) => `${n} dealers with insufficient data (not benchmarked)`,
  dealersSilent: (n: string) => `${n} dealers received no reviews`,
  dealersEmpty: 'No dealer received reviews in this period.',
  colDealer: 'Dealer',
  colSector: 'Sector',
  colN: 'Reviews',
  colBayes: 'Adjusted rating',
  colPositive: 'Positive %',
  colNegativeShare: 'Negative %',
  colChange: 'Change',
  colSegment: 'Group avg',
  colZ: 'Deviation (z)',
  colStatus: 'Status',
  segmentSector: 'sector',
  segmentPlatform: 'platform',
  status: { low: 'Below group', high: 'Above group', normal: 'Typical', 'no-peers': 'Too few peers', insufficient: 'Insufficient data' },
  searchDealers: 'Search dealers',
  openFeedbacks: (name: string) => `Open feedback of ${name}`,
  unnamed: 'Unnamed business',
  sectorsTitle: 'Sector comparison',
  sectorsDescription: 'Sector is derived from the business category or product category names; demo labels are ignored.',
  sectorsModuleOff: 'The sector comparison module is turned off.',
  sectorsUncategorized: 'Dealers without sector',
  sectorsCategorized: 'Share of dealers with sector',
  sectorsPlatformAvg: 'Platform average',
  sectorsNoFilter: 'This tab is the sector breakdown itself; the sector filter is not applied.',
  sectorsEmpty: 'No dealers yet.',
  colDealers: 'Dealers',
  colActiveDealers: 'Active dealers',
  colDealerAvg: 'Dealer-weighted avg',
  colAvgDelta: 'Rating change',
  lowSample: 'Small sample',
  lowSampleHint: (k: string) => `Fewer than ${k} dealers: never shared externally`,
  focusTitle: 'Focus suggestion',
  focusText: (sector: string, avg: string, platform: string, n: string, dealers: string) =>
    `${sector} averages ${avg} vs ${platform} for the rest of the platform. ${n} reviews, ${dealers} active dealers — the gap is statistically significant.`,
  focusNone: 'No sector with enough data is clearly below the platform.',
  focusAction: 'Create an action plan',
  assignHint: 'A sector is determined as dealers enter a business category or product categories.',
  rootTitle: 'Negative topics',
  rootDescription: 'Topics in negative QR feedback, broken down by time of day and the dealers where they occur most.',
  rootNegative: 'Negative reviews',
  rootBase: (n: string) => `Share base: ${n} negative feedback items with a detected topic.`,
  rootOnlyQr: 'Topics exist only on QR feedback; no breakdown for the visit-review source.',
  rootEmpty: 'No negative feedback with a detected topic in this period.',
  colTopic: 'Topic',
  colShare: 'Share',
  colTopDealers: 'Top dealers',
  dayParts: { night: 'Night (00–06)', morning: 'Morning (06–12)', afternoon: 'Afternoon (12–17)', evening: 'Evening (17–24)' },
  cardsTitle: 'Card system',
  cardsPeriod: 'In period',
  cardsActivated: 'Cards activated',
  cardsBlocked: 'Cards blocked',
  cardsConsumptions: 'Consumptions',
  cardsReviews: 'Consumption reviews',
  cardsReviewRate: 'Review rate',
  cardsAllTime: 'Card inventory (all time)',
  cardsUnused: 'Unused',
  cardsArchived: 'Archived',
  cardsEmpty: 'No physical cards have been produced yet.',
  cardsNote: 'Card activations and blocks ignore the sector filter; consumptions and reviews respect it.',
};

const COPY: Record<DsLocale, Copy> = { tr, en };

export type AdminAnalyticsCopy = Copy;

export function useAdminAnalyticsLocale(): DsLocale {
  return useDsLocale();
}

export function useAdminAnalyticsCopy(): Copy {
  return COPY[useDsLocale()];
}

export function localeTag(locale: DsLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

export function sectorLabel(sector: string | null | undefined, locale: DsLocale): string {
  if (sector && isPlaceCategory(sector)) return categoryLabel(sector, locale);
  return COPY[locale].noSector;
}

export function topicLabel(key: string, locale: DsLocale): string {
  return dealerTopicLabel(key, locale);
}

export function fmtNumber(n: number | null | undefined, locale: DsLocale, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: digits }).format(n);
}

export function fmtPercent(pct: number | null | undefined, locale: DsLocale, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return new Intl.NumberFormat(localeTag(locale), { style: 'percent', maximumFractionDigits: digits }).format(pct / 100);
}

export function fmtRating(r: number | null | undefined, locale: DsLocale): string {
  if (r == null || !Number.isFinite(r)) return '—';
  return new Intl.NumberFormat(localeTag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(r);
}

export function fmtSigned(n: number | null | undefined, locale: DsLocale, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: digits, signDisplay: 'exceptZero' }).format(n);
  return s.replace('-', '−');
}

/** `YYYY-MM-DD` İstanbul gününü kısa etikete çevirir (UTC'de biçimlenir → kayma yok). */
export function dayLabel(day: string, locale: DsLocale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag(locale), { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)));
}

const MONDAY_UTC = Date.UTC(2024, 0, 1);
/** 0 = Pazartesi. */
export function weekdayName(index: number, locale: DsLocale, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(localeTag(locale), { weekday: style, timeZone: 'UTC' }).format(new Date(MONDAY_UTC + index * 86_400_000));
}

export function relativeTime(iso: string, now: number, locale: DsLocale): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86_400), 'day');
}
