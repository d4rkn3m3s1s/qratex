'use client';

import { useAppLocale } from '@/lib/app-locale';
import type { CompareMode, DateRangePreset } from './date-range';

/**
 * `components/ds/page` varsayılan metinleri (TR/EN). Sayfalar kendi metnini
 * prop ile verebilir; vermezse buradaki bağlama uygun varsayılan kullanılır.
 */
const COPY = {
  tr: {
    breadcrumbNav: 'Sayfa konumu',
    back: 'Geri',
    hiddenCrumbs: 'Ara sayfaları göster',
    filters: 'Filtreler',
    filtersRegion: 'Filtreler',
    clearFilters: 'Filtreleri temizle',
    activeFilters: (n: number) => (n === 1 ? '1 etkin filtre' : `${n} etkin filtre`),
    search: 'Ara',
    clearSearch: 'Aramayı temizle',
    all: 'Tümü',
    selectedCount: (n: number) => `${n} seçili`,
    period: 'Dönem',
    compare: 'Karşılaştır',
    custom: 'Özel aralık',
    from: 'Başlangıç',
    to: 'Bitiş',
    apply: 'Uygula',
    cancel: 'Vazgeç',
    invalidRange: 'Bitiş tarihi başlangıçtan önce olamaz.',
    tzNote: 'Günler İstanbul saatine göre hesaplanır.',
    comparedWith: 'karşılaştırma',
    sections: 'Bölümler',
    aside: 'Yan panel',
    toolbar: 'Sayfa araçları',
    presets: {
      today: 'Bugün',
      yesterday: 'Dün',
      last7: 'Son 7 gün',
      last30: 'Son 30 gün',
      last90: 'Son 90 gün',
      thisMonth: 'Bu ay',
      lastMonth: 'Geçen ay',
      thisYear: 'Bu yıl',
      custom: 'Özel aralık',
    } satisfies Record<DateRangePreset, string>,
    compareModes: {
      none: 'Karşılaştırma yok',
      previous: 'Önceki dönem',
      yoy: 'Geçen yılın aynı dönemi',
    } satisfies Record<CompareMode, string>,
  },
  en: {
    breadcrumbNav: 'Breadcrumb',
    back: 'Back',
    hiddenCrumbs: 'Show intermediate pages',
    filters: 'Filters',
    filtersRegion: 'Filters',
    clearFilters: 'Clear filters',
    activeFilters: (n: number) => (n === 1 ? '1 active filter' : `${n} active filters`),
    search: 'Search',
    clearSearch: 'Clear search',
    all: 'All',
    selectedCount: (n: number) => `${n} selected`,
    period: 'Period',
    compare: 'Compare',
    custom: 'Custom range',
    from: 'Start',
    to: 'End',
    apply: 'Apply',
    cancel: 'Cancel',
    invalidRange: 'End date cannot be before the start date.',
    tzNote: 'Days are calculated in Istanbul time.',
    comparedWith: 'compared with',
    sections: 'Sections',
    aside: 'Side panel',
    toolbar: 'Page tools',
    presets: {
      today: 'Today',
      yesterday: 'Yesterday',
      last7: 'Last 7 days',
      last30: 'Last 30 days',
      last90: 'Last 90 days',
      thisMonth: 'This month',
      lastMonth: 'Last month',
      thisYear: 'This year',
      custom: 'Custom range',
    } satisfies Record<DateRangePreset, string>,
    compareModes: {
      none: 'No comparison',
      previous: 'Previous period',
      yoy: 'Same period last year',
    } satisfies Record<CompareMode, string>,
  },
};

export type PageCopy = (typeof COPY)['tr'];

export function usePageCopy(): PageCopy {
  const { locale } = useAppLocale();
  return COPY[locale === 'en' ? 'en' : 'tr'];
}

/** Intl yerel etiketi (tr-TR / en-US). */
export function useLocaleTag(): 'tr-TR' | 'en-US' {
  return useAppLocale().locale === 'en' ? 'en-US' : 'tr-TR';
}
