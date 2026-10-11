'use client';

import { useDsLocale } from '@/components/ds/a11y/copy';

/** Mağaza ve ödüller — arayüz metinleri (TR/EN). */
const tr = {
  appearance: 'Görünüm',
  uploadedImage: 'Yüklü görsel kullanılıyor',
  legendaryHint: 'Efsanevi ürünler vitrinde parıltıyla öne çıkar ve sıralamada üstte durur.',
  storefront: 'Müşteri vitrini',
  effectsHint: 'Efektler üzerine gelince ya da odakta oynar.',
  freeGift: 'Ödemesiz (hediye)',
  cancelReason: 'Gerekçe (müşteriye gösterilir)',
  rulesOptional: 'Kurallar (isteğe bağlı)',
  customerCard: 'Müşteri kartı',
  stockDelta: 'Ekle (+) / düş (−)',
  codesInput: 'Kodlar (satır, virgül ya da boşlukla ayırın)',
};

type Copy = typeof tr;

const en: Copy = {
  appearance: 'Appearance',
  uploadedImage: 'Using the uploaded image',
  legendaryHint: 'Legendary items shimmer in the store and sit at the top of the list.',
  storefront: 'Customer storefront',
  effectsHint: 'Effects play on hover or focus.',
  freeGift: 'No charge (gift)',
  cancelReason: 'Reason (shown to the customer)',
  rulesOptional: 'Rules (optional)',
  customerCard: 'Customer card',
  stockDelta: 'Add (+) / remove (−)',
  codesInput: 'Codes (separate with new lines, commas or spaces)',
};

export const STORE_COPY = { tr, en } as const;

export function useStoreCopy(): Copy {
  return STORE_COPY[useDsLocale()];
}
