'use client';

import { useDsLocale } from '@/components/ds/a11y/copy';

/** Navigasyon stüdyosu — arayüz metinleri (TR/EN). */
const tr = {
  noVisibleDiff: 'Görünür bir fark yok (ör. varsayılanla aynı değer yeniden kaydedildi).',
  noVisibleItems: 'Görünür öğe kalmadı. En az bir öğeyi görünür yapın.',
  notPublished: 'Henüz özelleştirme yayınlanmadı; kayıttaki varsayılan menü kullanılıyor.',
  searchSr: 'Öğe veya grup ara',
  publishTitle: 'Yayınlanacak değişiklikler',
  publishDesc: 'Son yayınlanan sürüme göre fark. Yayınlayınca tüm kullanıcıların menüsü hemen güncellenir.',
  noUnpublished: 'Yayınlanmamış değişiklik yok.',
  emptyLangHint: 'Boş bırakılan dil varsayılan adı kullanır.',
  emptyGroup: 'Bu grupta öğe yok; menüde görünmez. Bir öğeyi “Grup” seçiminden buraya taşıyın.',
  ungrouped: 'Üst düzey (grupsuz)',
  visible: 'Görünür',
};

type Copy = typeof tr;

const en: Copy = {
  noVisibleDiff: 'No visible difference (e.g. the default value was saved again).',
  noVisibleItems: 'No visible items left. Make at least one item visible.',
  notPublished: 'No customizations published yet; the default menu from the registry is in use.',
  searchSr: 'Search items or groups',
  publishTitle: 'Changes to publish',
  publishDesc: 'Difference from the last published version. Publishing updates everyone’s menu right away.',
  noUnpublished: 'No unpublished changes.',
  emptyLangHint: 'A language left blank uses the default name.',
  emptyGroup: 'This group has no items, so it won’t show in the menu. Move an item here with its “Group” picker.',
  ungrouped: 'Top level (no group)',
  visible: 'Visible',
};

export const NAV_STUDIO_COPY = { tr, en } as const;

export function useNavStudioCopy(): Copy {
  return NAV_STUDIO_COPY[useDsLocale()];
}
