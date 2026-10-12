'use client';

import { useAppLocale } from '@/lib/app-locale';

/**
 * a11y bileşenlerinin varsayılan metinleri (TR/EN). Paylaşılan i18n kataloğuna
 * dokunmadan iki dilli çalışır; her metin prop ile ezilebilir.
 */
const COPY = {
  tr: {
    close: 'Kapat',
    closeEsc: 'Kapat (Esc)',
    skipToContent: 'Ana içeriğe atla',
    selected: 'seçili',
    // RatingInput
    ratingStar: (n: number, max: number) => `${n} / ${max} yıldız`,
    ratingNumber: (n: number) => `${n} puan`,
    ratingEmoji: ['Çok kötü', 'Kötü', 'İdare eder', 'İyi', 'Harika'] as readonly string[],
    npsLow: 'Hiç olası değil',
    npsHigh: 'Kesinlikle',
    // ChoiceChips
    choiceMax: (n: number) => `En fazla ${n} seçim yapabilirsiniz.`,
    // PhotoPicker
    camera: 'Kamera',
    gallery: 'Galeri',
    addPhoto: 'Fotoğraf ekle',
    photo: (n: number) => `Fotoğraf ${n}`,
    removePhoto: (label: string) => `${label} kaldır`,
    photoTooLarge: (max: string) => `Fotoğraf çok büyük (en fazla ${max}).`,
    photoTooLargeAfterResize: (max: string) => `Fotoğraf küçültüldükten sonra da ${max} sınırını aşıyor.`,
    notImage: 'Yalnız fotoğraf dosyaları seçilebilir.',
    maxPhotos: (n: number) => `En fazla ${n} fotoğraf ekleyebilirsiniz.`,
    processing: 'Fotoğraf hazırlanıyor…',
    processFailed: 'Fotoğraf işlenemedi. Başka bir fotoğraf deneyin.',
    photoAdded: (n: number) => (n === 1 ? 'Fotoğraf eklendi.' : `${n} fotoğraf eklendi.`),
    photoRemoved: 'Fotoğraf kaldırıldı.',
    dropHint: 'ya da fotoğrafı buraya bırakın',
    photoCount: (n: number, max: number) => `${n} / ${max} fotoğraf`,
    sizeHint: (max: string) => `Fotoğraflar otomatik küçültülür (en fazla ${max}), konum bilgisi silinir`,
    confirmPrompt: 'Emin misin?',
    confirmYes: 'Evet',
    confirmNo: 'Vazgeç',
    confirmOpened: 'Onay bekleniyor. Evet ile onaylayın, Vazgeç veya Esc ile geri dönün.',
  },
  en: {
    close: 'Close',
    closeEsc: 'Close (Esc)',
    skipToContent: 'Skip to main content',
    selected: 'selected',
    ratingStar: (n: number, max: number) => `${n} of ${max} stars`,
    ratingNumber: (n: number) => `${n} points`,
    ratingEmoji: ['Very bad', 'Bad', 'Okay', 'Good', 'Great'] as readonly string[],
    npsLow: 'Not at all likely',
    npsHigh: 'Extremely likely',
    choiceMax: (n: number) => `You can select up to ${n}.`,
    camera: 'Camera',
    gallery: 'Gallery',
    addPhoto: 'Add photo',
    photo: (n: number) => `Photo ${n}`,
    removePhoto: (label: string) => `Remove ${label}`,
    photoTooLarge: (max: string) => `Photo is too large (max ${max}).`,
    photoTooLargeAfterResize: (max: string) => `Photo is still larger than ${max} after resizing.`,
    notImage: 'Only image files can be selected.',
    maxPhotos: (n: number) => `You can add up to ${n} photos.`,
    processing: 'Preparing photo…',
    processFailed: 'The photo could not be processed. Try another one.',
    photoAdded: (n: number) => (n === 1 ? 'Photo added.' : `${n} photos added.`),
    photoRemoved: 'Photo removed.',
    dropHint: 'or drop a photo here',
    photoCount: (n: number, max: number) => `${n} / ${max} photos`,
    sizeHint: (max: string) => `Photos are resized automatically (max ${max}); location data is removed`,
    confirmPrompt: 'Are you sure?',
    confirmYes: 'Yes',
    confirmNo: 'Cancel',
    confirmOpened: 'Confirmation pending. Press Yes to confirm, Cancel or Esc to go back.',
  },
} as const;

export type A11yCopy = (typeof COPY)['tr'];
export type DsLocale = 'tr' | 'en';

/**
 * Etkin dil. `AppLocaleProvider` dışında (izole önizleme, test) `tr`'ye düşer —
 * DS bileşenleri sağlayıcı yokken çökmemeli. Kanca her render'da koşulsuz çağrılır.
 */
export function useDsLocale(): DsLocale {
  try {
    return useAppLocale().locale === 'en' ? 'en' : 'tr';
  } catch {
    return 'tr';
  }
}

export function useA11yCopy(): A11yCopy {
  return COPY[useDsLocale()] as A11yCopy;
}

export function getA11yCopy(locale: DsLocale = 'tr'): A11yCopy {
  return COPY[locale] as A11yCopy;
}

/** Bayt değerini okunur metne çevirir (ör. 2 MB). */
export function formatBytes(bytes: number, locale: DsLocale = 'tr'): string {
  const tag = locale === 'en' ? 'en-US' : 'tr-TR';
  if (bytes >= 1024 * 1024) {
    return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
  }
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}
