'use client';

/**
 * b-analitik metinleri (TR/EN). API etiket değil kod döner (rapor B-13); gün adları
 * `Intl.DateTimeFormat` ile, konu adları taksonomi anahtarıyla burada çevrilir.
 */
import { useDsLocale, type DsLocale } from '@/components/ds/a11y/copy';
import type { AnalyticsChannel, HeatmapMetric, Weekday } from '@/lib/dealer-analytics/types';

const tr = {
  shellTitle: 'Analitik',
  shellDescription: 'Geri bildirim, ziyaret ve memnuniyet eğilimleri; tüm saatler İstanbul saatine göre.',
  tabsLabel: 'Analitik bölümleri',

  overviewTitle: 'Genel bakış',
  heatmapTitle: 'Yoğunluk',
  heatmapDescription: 'Hangi gün ve saatte yoğunsunuz, o saatlerde kalite tutuyor mu, hangi şube dikkat istiyor?',

  period: 'Dönem',
  channel: 'Kanal',
  location: 'Şube',
  metric: 'Metrik',
  allLocations: 'Tüm şubeler',
  noLocation: 'Şubesiz QR kodları',
  channels: { all: 'Tüm kanallar', qr: 'QR geri bildirimi', consumption: 'Ziyaret yorumu' } satisfies Record<AnalyticsChannel, string>,
  metrics: { feedback: 'Geri bildirim', visits: 'Ziyaret', revenue: 'Ciro', rating: 'Ortalama puan' } satisfies Record<HeatmapMetric, string>,
  filtersLabel: 'Analitik süzgeçleri',
  locationOnlyQr: 'Şube seçiliyken yalnız QR geri bildirimleri sayılır (ziyaret yorumları şubeye bağlı değil).',

  updatedAgo: (rel: string) => `${rel} güncellendi`,
  refresh: 'Yenile',
  refreshing: 'Yenileniyor…',
  refreshFailed: 'Veriler yenilenemedi.',
  updating: 'Güncelleniyor…',
  tzNote: 'Saatler: Europe/Istanbul (GMT+3)',

  export: 'Dışa aktar',
  exportCsvSeries: 'Günlük seri (CSV)',
  exportCsvQr: 'QR performansı (CSV)',
  exportCsvTopics: 'Konular (CSV)',
  exportCsvGrid: 'Gün × saat ızgarası (CSV)',
  exportCsvLocations: 'Şube kırılımı (CSV)',
  exportPrint: 'Yazdır / PDF',
  exportDone: 'Dosya indirildi.',

  vsPrevious: 'önceki döneme göre',
  vsYoy: 'geçen yılın aynı dönemine göre',
  noCompare: 'Karşılaştırma kapalı',
  newInPeriod: 'Önceki dönemde kayıt yok',

  kpiVolume: 'Geri bildirim',
  kpiVolumeHint: 'QR geri bildirimi + ziyaret yorumu',
  kpiAvg: 'Ortalama puan',
  kpiPositive: 'Olumlu oran',
  kpiPositiveHint: 'Analiz bekleyenler hariç',
  kpiResponse: 'Yanıt oranı',
  kpiReplyTime: 'Medyan yanıt süresi',
  kpiConversion: 'Tarama → geri bildirim',
  kpiConversionHint: 'Aynı cihazdan 30 dk içindeki tekrar taramalar tek sayılır',
  kpiConversionNoScans: 'Bu dönemde kayıtlı tarama yok',
  kpiConversionIncomplete: 'Tarama kaydı bu dönemi tam kapsamıyor',
  kpiConversionNA: 'Ziyaret yorumlarında tarama yok',
  kpiNps: 'NPS',
  kpiNpsHint: 'Tavsiye (0–10) sorusunu yanıtlayanlar',
  kpiNpsNone: 'NPS sorusu yanıtlanmamış',
  sparkVolume: (n: number) => `Günlük geri bildirim eğilimi, ${n} gün`,
  sparkAvg: (n: number) => `Günlük ortalama puan eğilimi, ${n} gün`,

  trendTitle: 'Geri bildirim eğilimi',
  trendDescription: 'Sütun günlük adet, çizgi ortalama puan; kaydı olmayan günde puan çizilmez.',
  trendTabs: { volume: 'Hacim ve puan', sentiment: 'Duygu' },
  trendTabsLabel: 'Grafik görünümü',
  trendSummary: (total: string, days: number, peak: string | null) =>
    `Son ${days} günde ${total} geri bildirim${peak ? `; en yüksek gün ${peak}` : ''}.`,
  colDay: 'Gün',
  colCount: 'Adet',
  colAvg: 'Ort. puan',
  colCompare: 'Önceki dönem',
  colPositive: 'Olumlu',
  colNeutral: 'Nötr',
  colNegative: 'Olumsuz',
  colPending: 'Analiz bekliyor',
  compareSeries: 'Önceki dönem (adet)',
  anomalyLegend: 'Olağan dışı gün',

  sentimentTitle: 'Duygu dağılımı',
  sentimentDescription: 'AI duygusu; metinsiz yorumlarda puan eşiği. Analiz kuyruğundakiler ayrı gösterilir.',
  sentiments: { positive: 'Olumlu', neutral: 'Nötr', negative: 'Olumsuz', pending: 'Analiz bekliyor' },
  pendingNote: (n: string) => `${n} kayıt AI analiz kuyruğunda.`,
  openInInbox: 'Gelen kutusunda gör',
  ratingTitle: 'Puan dağılımı',
  ratingRow: (star: number) => `${star} yıldız`,

  topicsTitle: 'Konular',
  topicsDescription: (n: string) => `AI analizli ${n} QR yorumundan; sık geçen ve duygusu belirgin konular.`,
  topicsEmpty: 'Bu dönemde konu çıkarılmış QR yorumu yok.',
  topicsConsumption: 'Konu analizi yalnız QR yorumlarında yapılır.',
  quadrants: { fix: 'Öncelikli düzelt', strength: 'Güçlü yan', watch: 'İzle' },
  mentions: (n: string) => `${n} bahis`,
  net: 'Net duygu',

  qrTitle: 'QR performansı',
  qrDescription: 'Dönem içi geri bildirim, puan ve tarama; satıra tıklayınca o QR\'ın yorumları açılır.',
  qrEmpty: 'Bu süzgeçte QR kodu yok.',
  qrName: 'QR kodu',
  qrLocation: 'Şube',
  qrFeedbacks: 'Geri bildirim',
  qrAvg: 'Ort. puan',
  qrPositive: 'Olumlu',
  qrScans: 'Tarama',
  qrConversion: 'Dönüşüm',
  qrDelta: 'Değişim',
  archived: 'Arşivli',
  qrConsumption: 'Ziyaret yorumu kanalında QR tablosu yok.',

  insightsTitle: 'Öne çıkanlar',
  peakHour: 'En yoğun saat',
  peakDay: 'En yoğun gün',
  bestQr: 'En iyi QR',
  bestQrHint: (n: string) => `Bayes düzeltilmiş, ${n} geri bildirim`,
  needsData: (min: number) => `En az ${min} kayıt gerekiyor`,
  shareOf: (pct: string) => `toplamın ${pct}'i`,
  openHeatmap: 'Yoğunluk haritası',
  attentionTitle: 'Dikkat',
  anomalyNegative: (day: string, v: string, e: string) => `${day}: ${v} olumsuz (beklenen ~${e})`,
  anomalyVolume: (day: string, v: string, e: string) => `${day}: ${v} geri bildirim (ortalama ~${e})`,
  noAnomaly: 'Bu dönemde olağan dışı gün yok.',
  attentionTopics: 'Düzeltilecek konular',

  emptyTitle: 'Henüz geri bildirim yok',
  emptyDescription: 'QR kodunuzu masalara ve kasaya yerleştirin; ilk yorumlar geldiğinde analitik burada oluşur.',
  emptyAction: 'QR kodlarına git',
  emptyPeriodTitle: 'Bu dönemde kayıt yok',
  emptyPeriodDescription: 'Dönemi genişletin ya da süzgeçleri temizleyin.',

  // Isı haritası
  gridTitle: (metric: string) => `Gün × saat — ${metric}`,
  gridDescription: 'Pazartesi başlangıçlı hafta, İstanbul saati. Hücreye dokunun ya da ok tuşlarıyla gezin.',
  gridLabel: (metric: string) => `Gün ve saate göre ${metric} ısı haritası`,
  gridLegendLess: 'Az',
  gridLegendMore: 'Çok',
  gridLegendLow: 'Düşük puan',
  gridLegendHigh: 'Yüksek puan',
  gridLowN: (n: number) => `Taralı hücre: ${n} kayıttan az (puan güvenilir değil)`,
  cellAria: (day: string, hour: string, value: string) => `${day} ${hour}, ${value}`,
  cellTitle: (day: string, hour: string) => `${day} ${hour}`,
  cellFeedback: 'Geri bildirim',
  cellVisits: 'Ziyaret',
  cellRevenue: 'Ciro',
  cellAvg: 'Ortalama puan',
  cellNegative: 'Olumsuz',
  cellCompare: 'Önceki dönem',
  cellShare: 'Haftalık paya oranı',
  noVisits: 'Şube seçiliyken ziyaret ve ciro gösterilemez (tüketim kaydı şubeye bağlı değil).',
  noRevenue: 'Ciro yalnız tutarı girilmiş ziyaretlerden hesaplanır; bu dönemde tutar kaydı yok.',
  metricFallback: 'Seçilen metrik bu süzgeçte yok; geri bildirim gösteriliyor.',
  peakWindow: 'En yoğun an',
  qualityDip: 'Kalite düşen pencere',
  qualityDipBody: (avg: string, base: string, n: string) => `Ort. ${avg} (genel ${base}), ${n} kayıt`,
  noQualityDip: 'Belirgin bir puan düşüşü yok.',
  attentionLocation: 'Dikkat gerektiren şube',
  attentionLocationBody: (avg: string, n: string) => `Ort. ${avg}, ${n} geri bildirim (Bayes düzeltilmiş)`,
  noAttentionLocation: 'Kıyas için en az iki şubede yeterli veri gerekiyor.',
  vsPrevShort: 'önceki dönem',
  locationsTitle: 'Şube ve QR kırılımı',
  locationsDescription: 'Şubeye bağlı QR kodları; memnuniyet = 4–5 yıldız ya da AI olumlu.',
  locationsEmpty: 'Bu dönemde QR geri bildirimi yok.',
  unassigned: 'Şubesiz',
  satisfaction: 'Memnuniyet',
  showQr: (n: number) => `${n} QR kodunu göster`,
  hideQr: 'QR kodlarını gizle',
  noData: 'Veri yok',
  moduleOff: 'Yoğunluk modülü yönetici tarafından kapatıldı.',
  hourShort: (h: number) => `${String(h).padStart(2, '0')}:00`,
  hourRange: (h: number) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`,
};

type Copy = typeof tr;

const en: Copy = {
  shellTitle: 'Analytics',
  shellDescription: 'Feedback, visit and satisfaction trends; all times in Istanbul time.',
  tabsLabel: 'Analytics sections',

  overviewTitle: 'Overview',
  heatmapTitle: 'Activity',
  heatmapDescription: 'When are you busiest, does quality hold at those hours, which branch needs attention?',

  period: 'Period',
  channel: 'Channel',
  location: 'Branch',
  metric: 'Metric',
  allLocations: 'All branches',
  noLocation: 'QR codes without branch',
  channels: { all: 'All channels', qr: 'QR feedback', consumption: 'Visit review' },
  metrics: { feedback: 'Feedback', visits: 'Visits', revenue: 'Revenue', rating: 'Average rating' },
  filtersLabel: 'Analytics filters',
  locationOnlyQr: 'With a branch selected only QR feedback is counted (visit reviews are not tied to a branch).',

  updatedAgo: (rel) => `Updated ${rel}`,
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  refreshFailed: 'Could not refresh data.',
  updating: 'Updating…',
  tzNote: 'Times: Europe/Istanbul (GMT+3)',

  export: 'Export',
  exportCsvSeries: 'Daily series (CSV)',
  exportCsvQr: 'QR performance (CSV)',
  exportCsvTopics: 'Topics (CSV)',
  exportCsvGrid: 'Day × hour grid (CSV)',
  exportCsvLocations: 'Branch breakdown (CSV)',
  exportPrint: 'Print / PDF',
  exportDone: 'File downloaded.',

  vsPrevious: 'vs previous period',
  vsYoy: 'vs same period last year',
  noCompare: 'Comparison off',
  newInPeriod: 'No records in previous period',

  kpiVolume: 'Feedback',
  kpiVolumeHint: 'QR feedback + visit reviews',
  kpiAvg: 'Average rating',
  kpiPositive: 'Positive share',
  kpiPositiveHint: 'Excluding pending analysis',
  kpiResponse: 'Response rate',
  kpiReplyTime: 'Median reply time',
  kpiConversion: 'Scan → feedback',
  kpiConversionHint: 'Repeat scans from the same device within 30 min count once',
  kpiConversionNoScans: 'No recorded scans in this period',
  kpiConversionIncomplete: 'Scan tracking does not fully cover this period',
  kpiConversionNA: 'Visit reviews have no scans',
  kpiNps: 'NPS',
  kpiNpsHint: 'Answers to the 0–10 recommend question',
  kpiNpsNone: 'NPS question not answered',
  sparkVolume: (n) => `Daily feedback trend, ${n} days`,
  sparkAvg: (n) => `Daily average rating trend, ${n} days`,

  trendTitle: 'Feedback trend',
  trendDescription: 'Bars show daily count, the line average rating; days without records have no rating point.',
  trendTabs: { volume: 'Volume & rating', sentiment: 'Sentiment' },
  trendTabsLabel: 'Chart view',
  trendSummary: (total, days, peak) => `${total} feedback in the last ${days} days${peak ? `; busiest day ${peak}` : ''}.`,
  colDay: 'Day',
  colCount: 'Count',
  colAvg: 'Avg rating',
  colCompare: 'Previous period',
  colPositive: 'Positive',
  colNeutral: 'Neutral',
  colNegative: 'Negative',
  colPending: 'Pending analysis',
  compareSeries: 'Previous period (count)',
  anomalyLegend: 'Unusual day',

  sentimentTitle: 'Sentiment',
  sentimentDescription: 'AI sentiment; rating threshold for reviews without text. Items in the analysis queue shown separately.',
  sentiments: { positive: 'Positive', neutral: 'Neutral', negative: 'Negative', pending: 'Pending analysis' },
  pendingNote: (n) => `${n} records are in the AI analysis queue.`,
  openInInbox: 'Open in inbox',
  ratingTitle: 'Rating distribution',
  ratingRow: (star) => `${star} star${star === 1 ? '' : 's'}`,

  topicsTitle: 'Topics',
  topicsDescription: (n) => `From ${n} AI-analysed QR reviews; frequent topics with clear sentiment.`,
  topicsEmpty: 'No QR reviews with extracted topics in this period.',
  topicsConsumption: 'Topic analysis runs on QR reviews only.',
  quadrants: { fix: 'Fix first', strength: 'Strength', watch: 'Watch' },
  mentions: (n) => `${n} mentions`,
  net: 'Net sentiment',

  qrTitle: 'QR performance',
  qrDescription: 'Feedback, rating and scans in the period; click a row to open that QR\'s reviews.',
  qrEmpty: 'No QR codes for this filter.',
  qrName: 'QR code',
  qrLocation: 'Branch',
  qrFeedbacks: 'Feedback',
  qrAvg: 'Avg rating',
  qrPositive: 'Positive',
  qrScans: 'Scans',
  qrConversion: 'Conversion',
  qrDelta: 'Change',
  archived: 'Archived',
  qrConsumption: 'No QR table for the visit review channel.',

  insightsTitle: 'Highlights',
  peakHour: 'Busiest hour',
  peakDay: 'Busiest day',
  bestQr: 'Best QR',
  bestQrHint: (n) => `Bayesian adjusted, ${n} feedback`,
  needsData: (min) => `At least ${min} records needed`,
  shareOf: (pct) => `${pct} of total`,
  openHeatmap: 'Activity heatmap',
  attentionTitle: 'Attention',
  anomalyNegative: (day, v, e) => `${day}: ${v} negative (expected ~${e})`,
  anomalyVolume: (day, v, e) => `${day}: ${v} feedback (average ~${e})`,
  noAnomaly: 'No unusual days in this period.',
  attentionTopics: 'Topics to fix',

  emptyTitle: 'No feedback yet',
  emptyDescription: 'Place your QR code on tables and at the till; analytics will build up here as reviews arrive.',
  emptyAction: 'Go to QR codes',
  emptyPeriodTitle: 'No records in this period',
  emptyPeriodDescription: 'Widen the period or clear filters.',

  gridTitle: (metric) => `Day × hour — ${metric}`,
  gridDescription: 'Week starts Monday, Istanbul time. Tap a cell or move with arrow keys.',
  gridLabel: (metric) => `${metric} heatmap by day and hour`,
  gridLegendLess: 'Less',
  gridLegendMore: 'More',
  gridLegendLow: 'Low rating',
  gridLegendHigh: 'High rating',
  gridLowN: (n) => `Hatched cell: fewer than ${n} records (rating not reliable)`,
  cellAria: (day, hour, value) => `${day} ${hour}, ${value}`,
  cellTitle: (day, hour) => `${day} ${hour}`,
  cellFeedback: 'Feedback',
  cellVisits: 'Visits',
  cellRevenue: 'Revenue',
  cellAvg: 'Average rating',
  cellNegative: 'Negative',
  cellCompare: 'Previous period',
  cellShare: 'Share of week',
  noVisits: 'Visits and revenue are unavailable with a branch selected (purchases are not tied to a branch).',
  noRevenue: 'Revenue comes from visits with an amount; none recorded in this period.',
  metricFallback: 'The selected metric is unavailable for this filter; showing feedback.',
  peakWindow: 'Busiest window',
  qualityDip: 'Quality dip',
  qualityDipBody: (avg, base, n) => `Avg ${avg} (overall ${base}), ${n} records`,
  noQualityDip: 'No notable rating dip.',
  attentionLocation: 'Branch needing attention',
  attentionLocationBody: (avg, n) => `Avg ${avg}, ${n} feedback (Bayesian adjusted)`,
  noAttentionLocation: 'Needs enough data in at least two branches.',
  vsPrevShort: 'previous period',
  locationsTitle: 'Branch and QR breakdown',
  locationsDescription: 'QR codes grouped by branch; satisfaction = 4–5 stars or AI positive.',
  locationsEmpty: 'No QR feedback in this period.',
  unassigned: 'No branch',
  satisfaction: 'Satisfaction',
  showQr: (n) => `Show ${n} QR codes`,
  hideQr: 'Hide QR codes',
  noData: 'No data',
  moduleOff: 'The activity module has been turned off by an administrator.',
  hourShort: (h) => `${String(h).padStart(2, '0')}:00`,
  hourRange: (h) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`,
};

const TOPICS: Record<DsLocale, Record<string, string>> = {
  tr: {
    service: 'Hizmet', quality: 'Kalite', price: 'Fiyat', atmosphere: 'Atmosfer', staff: 'Personel', food: 'Yemek',
    cleanliness: 'Temizlik', speed: 'Hız', location: 'Konum', parking: 'Otopark', menu: 'Menü', portion: 'Porsiyon',
    taste: 'Lezzet', temperature: 'Sıcaklık', presentation: 'Sunum', reservation: 'Rezervasyon', waiting: 'Bekleme süresi',
    delivery: 'Teslimat', packaging: 'Paketleme', payment: 'Ödeme',
  },
  en: {
    service: 'Service', quality: 'Quality', price: 'Price', atmosphere: 'Atmosphere', staff: 'Staff', food: 'Food',
    cleanliness: 'Cleanliness', speed: 'Speed', location: 'Location', parking: 'Parking', menu: 'Menu', portion: 'Portion',
    taste: 'Taste', temperature: 'Temperature', presentation: 'Presentation', reservation: 'Reservation', waiting: 'Waiting time',
    delivery: 'Delivery', packaging: 'Packaging', payment: 'Payment',
  },
};

export type AnalyticsCopy = Copy;

export function useAnalyticsLocale(): DsLocale {
  return useDsLocale();
}

export function useAnalyticsCopy(): Copy {
  return useDsLocale() === 'en' ? en : tr;
}

export function getAnalyticsCopy(locale: DsLocale): Copy {
  return locale === 'en' ? en : tr;
}

export function localeTag(locale: DsLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

export function topicLabel(key: string, locale: DsLocale): string {
  const hit = TOPICS[locale][key];
  if (hit) return hit;
  return key ? key.charAt(0).toLocaleUpperCase(localeTag(locale)) + key.slice(1) : key;
}

/** 2024-01-01 Pazartesi → gün adları `Intl` ile (sabit dizi/indeks kayması yok). */
const MONDAY_UTC = Date.UTC(2024, 0, 1);
const WEEKDAY_INDEX: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

export function weekdayLabel(day: Weekday, locale: DsLocale, style: 'short' | 'long' = 'long'): string {
  return new Intl.DateTimeFormat(localeTag(locale), { weekday: style, timeZone: 'UTC' }).format(
    new Date(MONDAY_UTC + WEEKDAY_INDEX[day] * 86_400_000),
  );
}

/** `YYYY-MM-DD` İstanbul gününü kısa etikete çevirir (UTC'de biçimlenir → kayma yok). */
export function dayLabel(day: string, locale: DsLocale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag(locale), { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatNumber(n: number, locale: DsLocale, digits = 0): string {
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function formatPercent(pct: number, locale: DsLocale, digits = 0): string {
  return new Intl.NumberFormat(localeTag(locale), { style: 'percent', maximumFractionDigits: digits }).format(pct / 100);
}

export function formatRating(r: number, locale: DsLocale): string {
  return new Intl.NumberFormat(localeTag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(r);
}

export function formatCurrency(n: number, locale: DsLocale): string {
  return new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
}

/** "3 dk önce" — göreli süre. */
export function relativeTime(iso: string, now: number, locale: DsLocale): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86_400), 'day');
}
