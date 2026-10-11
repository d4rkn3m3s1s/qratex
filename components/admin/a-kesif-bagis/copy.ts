'use client';

/**
 * a-kesif-bagis arayüz metinleri (TR/EN). Bileşenler `useAdminKesifBagisCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKesifBagisText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  clearFilter: 'Süzgeci temizle',
  fixBeforePublish: 'Yayınlamadan önce düzeltin:',
  liveVersion: 'Yayındaki sürüm',
  restored: '(geçmişten geri yüklendi)',
  jsonToDraft: 'JSON’dan taslağa al',
  jsonHint: 'Dosya seçin ya da içeriği yapıştırın. İçerik doğrulanır ve yalnız taslağı değiştirir; müşteriye ulaşması için ayrıca yayınlamanız gerekir.',
  jsonContent: 'JSON içeriği',
  draftChange: 'Taslak değişimi',
  business: 'İşletme',
  coordsOrMaps: 'Koordinat ya da Google Haritalar bağlantısı',
  filterKeys: 'Keşfet süzgeci “kahve”, “tatlı”, “yemek” anahtarlarını tanır; menü kategorileri de otomatik eklenir.',
  fallbackHours: 'Yedek çalışma saati (isteğe bağlı)',
  days: 'Günler',
  radiusKm: 'Yarıçap (km)',
  all: 'Tümü',
  dessert: 'Tatlı',
  noneInRadius: 'Bu yarıçapta konumu bilinen işletme yok.',
  noSponsored: 'Şu an yayında sponsorlu duyuru yok.',
  noMultiplier: 'Şu an bu bölgede canlı çarpan yok.',
  noFeedback30d: 'Son 30 günde geri bildirim yok.',
  dealerNotFound: 'Bayi bulunamadı',
  optional: '(isteğe bağlı)',
  linkHint: 'Bağlanırsa duyuru bağlantısı bu işletmenin sayfasını açar; boşsa Fırsatlar’ı.',
  imageHint: 'https:// adresi yapıştırın ya da PNG/SVG yükleyin (en çok 2 MB).',
  cardTitle: 'Kart başlığı',
  emptyCard: 'Son 7 günde bu boyutta değerlendirme yok; kart müşteride boş görünür.',
  allDonations: 'Bu kampanyanın tüm bağışları',
  customerView: 'Müşteri böyle görür',
  impactByAmount: 'Bağış tutarına göre etki',
  rateHint: 'Oran girilince etki tablosu görünür.',
  reasonMin5: 'Gerekçe (en az 5 karakter)',
  noDonations: 'Henüz bağış yok.',
  noPanelChanges: 'Bu panelde yapılmış değişiklik kaydı yok.',
  featured: 'Öne çıkan',
  never: 'Hiç',
  noLedgerRow: 'Bu bağışın puan defteri satırı yok (defter öncesi eski kayıt). Makbuz numarası yine geçerlidir.',
  donor: 'Bağışçı',
  allCampaigns: 'Tüm kampanyalar',
  selectedCampaign: 'Seçili kampanya',
  visibility: 'Görünürlük',
  public: 'Herkese açık',
  startDay: 'Başlangıç günü',
  endDay: 'Bitiş günü',
  csvNote: 'Tarihler İstanbul saatine göredir. CSV süzgece uyan tüm kayıtları (en çok 20.000) içerir ve Excel’de Türkçe karakterlerle açılır.',
};

export type AdminKesifBagisCopy = Record<keyof typeof tr, string>;

const en: AdminKesifBagisCopy = {
  clearFilter: 'Clear filter',
  fixBeforePublish: 'Fix before publishing:',
  liveVersion: 'Live version',
  restored: '(restored from history)',
  jsonToDraft: 'Load JSON into draft',
  jsonHint: 'Pick a file or paste the content. It\'s validated and only changes the draft; you still need to publish for customers to see it.',
  jsonContent: 'JSON content',
  draftChange: 'Draft changes',
  business: 'Business',
  coordsOrMaps: 'Coordinates or a Google Maps link',
  filterKeys: 'The Discover filter recognizes the “kahve”, “tatlı” and “yemek” keys; menu categories are added automatically.',
  fallbackHours: 'Fallback opening hours (optional)',
  days: 'Days',
  radiusKm: 'Radius (km)',
  all: 'All',
  dessert: 'Dessert',
  noneInRadius: 'No businesses with a known location in this radius.',
  noSponsored: 'No sponsored announcements are live right now.',
  noMultiplier: 'No live multiplier in this area right now.',
  noFeedback30d: 'No feedback in the last 30 days.',
  dealerNotFound: 'Dealer not found',
  optional: '(optional)',
  linkHint: 'If linked, the announcement opens this business\'s page; otherwise it opens Deals.',
  imageHint: 'Paste an https:// URL or upload a PNG/SVG (up to 2 MB).',
  cardTitle: 'Card title',
  emptyCard: 'No reviews of this size in the last 7 days; the card will look empty to customers.',
  allDonations: 'All donations to this campaign',
  customerView: 'What the customer sees',
  impactByAmount: 'Impact by donation amount',
  rateHint: 'Enter a rate to see the impact table.',
  reasonMin5: 'Reason (at least 5 characters)',
  noDonations: 'No donations yet.',
  noPanelChanges: 'No changes have been recorded from this panel.',
  featured: 'Featured',
  never: 'Never',
  noLedgerRow: 'This donation has no points ledger row (an older record from before the ledger). The receipt number is still valid.',
  donor: 'Donor',
  allCampaigns: 'All campaigns',
  selectedCampaign: 'Selected campaign',
  visibility: 'Visibility',
  public: 'Public',
  startDay: 'Start day',
  endDay: 'End day',
  csvNote: 'Dates are in Istanbul time. The CSV includes every record matching the filter (up to 20,000) and opens in Excel with Turkish characters intact.',
};

export function useAdminKesifBagisCopy(): AdminKesifBagisCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKesifBagisText({ k }: { k: keyof AdminKesifBagisCopy }): string {
  return useAdminKesifBagisCopy()[k];
}
