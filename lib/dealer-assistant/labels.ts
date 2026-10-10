/**
 * b-asistan — saf etiket ve derin link yardımcıları (sunucu + istemci; React'siz).
 *
 * Konu anahtarları `lib/dealer-analytics/topics.ts` taksonomisiyle aynıdır (`service`, `waiting` …).
 * Sunucu LLM'e yerel etiketi verir ki model İngilizce ham anahtar yazmasın (ask-analytics Bulgu 8).
 */
import type { AssistantLocale, AssistantPeriod, AssistantSource } from './types';

const TOPICS: Record<AssistantLocale, Record<string, string>> = {
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

export function localeTag(locale: AssistantLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

/** Konu anahtarı → yerel etiket (bilinmeyen konu ilk harfi büyütülmüş hâliyle). */
export function topicLabel(key: string, locale: AssistantLocale): string {
  const hit = TOPICS[locale][key];
  if (hit) return hit;
  return key ? key.charAt(0).toLocaleUpperCase(localeTag(locale)) + key.slice(1) : key;
}

const PERIOD_LABELS: Record<AssistantLocale, Record<AssistantPeriod, string>> = {
  tr: { last7: 'Son 7 gün', last30: 'Son 30 gün', last90: 'Son 90 gün', thisMonth: 'Bu ay', lastMonth: 'Geçen ay' },
  en: { last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days', thisMonth: 'This month', lastMonth: 'Last month' },
};

export function periodLabel(period: AssistantPeriod, locale: AssistantLocale): string {
  return PERIOD_LABELS[locale][period];
}

/** Gelen Kutusu kayıt derin linki. */
export function sourceHref(kind: AssistantSource['kind'], id: string): string {
  return `/dealer/inbox?id=${kind === 'qr' ? 'qr' : 'cr'}-${encodeURIComponent(id)}`;
}

/** Dönem → Gelen Kutusu `range` süzgeci (7/30/90; aylık dönemler en yakın üst pencereye). */
export function inboxRangeFor(period: AssistantPeriod): '7' | '30' | '90' {
  if (period === 'last7') return '7';
  if (period === 'last90' || period === 'lastMonth') return '90';
  return '30';
}

/** Analitik sayfası derin linki (aynı dönem, önceki dönemle kıyas). */
export function analyticsHref(period: AssistantPeriod): string {
  return `/dealer/analytics?period=${period}&compare=previous`;
}

/** Gelen Kutusu süzgeç derin linki. */
export function inboxHref(period: AssistantPeriod, extra: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams({ status: 'all', range: inboxRangeFor(period) });
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  return `/dealer/inbox?${sp.toString()}`;
}
