'use client';

import { useDsLocale } from '@/components/ds/a11y/copy';

/** SEO ve içerik sayfaları — arayüz metinleri (TR/EN). */
const tr = {
  viewLive: 'Canlı görüntüle',
  newTab: ' (yeni sekmede açılır)',
  googleView: 'Google’da görünüm',
  noindexWarn: 'Bu sayfa arama sonuçlarında görünmeyecek (noindex).',
  pagePreview: 'Sayfa önizlemesi',
  bodyPlaceholder: 'İçerik yazdıkça burada görünür.',
  searchSr: 'Başlık veya adreste ara',
  sort: 'Sırala',
  sortUpdated: 'Son güncellenen',
  sortTitle: 'Başlık (A–Z)',
  emptyBody: 'İçerik boş',
  openSite: 'Siteyi aç',
  newTabShort: ' (yeni sekmede)',
  cardLarge: 'Büyük görselli kart',
  cardSmall: 'Küçük kart',
  jsonLd: 'Ana sayfada yayınlanacak JSON-LD',
  robotsTxt: 'Yayınlanacak robots.txt',
  sitemapAuto:
    'Otomatik eklenenler: ana sayfa, giriş/kayıt, Güven, Neden QRateX, yasal belgeler, blog yazıları ve yayındaki içerik sayfaları. Buraya yalnız bunların dışındaki adresleri ekleyin.',
  indexing: 'İndeksleme',
  healthScore: 'Sağlık skoru',
  lastChange: 'Son değişiklik',
  healthCheck: 'Sağlık kontrolü',
  newTabSite: ' (yeni sekmede, kayıtlı site adresiyle)',
  importPreview: 'İçe aktarma önizlemesi',
  importSame: 'Dosya kayıtlı ayarlarla aynı.',
  cancel: 'Vazgeç',
  monthlyDefault: 'Aylık (varsayılan)',
  choose: 'Seçin…',
  historyDesc: 'Her kayıt bir sürümdür. Geri yükleme yeni bir kayıt olarak eklenir; hiçbir sürüm silinmez.',
  current: 'Şu anki',
  noFieldChange: 'Alan değişikliği yok.',
  noindexOn: 'Noindex açık: bu sonuç Google’da görünmez.',
  serpCaption: 'Arama sonucunda görünecek başlık ve açıklama',
  noImage: 'Görsel yok',
};

type Copy = typeof tr;

const en: Copy = {
  viewLive: 'View live',
  newTab: ' (opens in a new tab)',
  googleView: 'How it looks on Google',
  noindexWarn: 'This page won’t appear in search results (noindex).',
  pagePreview: 'Page preview',
  bodyPlaceholder: 'Your content shows up here as you type.',
  searchSr: 'Search titles or addresses',
  sort: 'Sort',
  sortUpdated: 'Recently updated',
  sortTitle: 'Title (A–Z)',
  emptyBody: 'No content',
  openSite: 'Open site',
  newTabShort: ' (new tab)',
  cardLarge: 'Card with large image',
  cardSmall: 'Small card',
  jsonLd: 'JSON-LD to publish on the home page',
  robotsTxt: 'robots.txt to publish',
  sitemapAuto:
    'Added automatically: home, sign-in/sign-up, Trust, Why QRateX, legal documents, blog posts and published content pages. Only add addresses beyond these.',
  indexing: 'Indexing',
  healthScore: 'Health score',
  lastChange: 'Last change',
  healthCheck: 'Health check',
  newTabSite: ' (new tab, using the saved site address)',
  importPreview: 'Import preview',
  importSame: 'The file matches the saved settings.',
  cancel: 'Cancel',
  monthlyDefault: 'Monthly (default)',
  choose: 'Choose…',
  historyDesc: 'Every save is a version. Restoring adds a new save; no version is ever deleted.',
  current: 'Current',
  noFieldChange: 'No field changes.',
  noindexOn: 'Noindex is on: this result won’t appear on Google.',
  serpCaption: 'Title and description shown in search results',
  noImage: 'No image',
};

export const SEO_COPY = { tr, en } as const;

export function useSeoCopy(): Copy {
  return SEO_COPY[useDsLocale()];
}
