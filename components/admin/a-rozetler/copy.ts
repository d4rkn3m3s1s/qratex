'use client';

import { useDsLocale } from '@/components/ds/a11y/copy';

/** Rozetler — arayüz metinleri (TR/EN). */
const tr = {
  earnCondition: 'Kazanma koşulu',
  visibilityA: 'Müşteride görünürlük: tam sürpriz politikası — rozet',
  visibilityStrong: 'kazanılana kadar görünmez',
  visibilityB: 've puanla satın alınamaz.',
  customerView: 'Müşteri görünümü',
  appearance: 'Görünüm',
  never: 'Hiç',
  searchTestAccount: 'Test hesabı ara',
  exhausted: 'Tükendi (tüm karakterler alınmış ya da pasif)',
  sampleReview: 'Örnek yorum',
  tooShort: 'Yorum çok kısa: üretimde bu yorum hiçbir kategoriye sayılmaz.',
  unclassified: 'Sınıflandırılamadı: AI geçerli bir kategori döndürmedi; yorum bara sayılmaz.',
  notInList: 'Seçili rozet bu listede yok (pasif/arşivli olabilir ya da ilk 100’ün dışında).',
  fateOrb: 'Kader küresi',
  reasonOptional: 'Gerekçe metni (isteğe bağlı)',
  ownerRate: 'Sahip oranı % (isteğe bağlı)',
  thresholdsIntro:
    'Bir karakter açmak için gereken yorum sayısı ve (isteğe bağlı) yorumun sayılması için minimum uzunluk. Boş alan kod varsayılanını kullanır.',
  retroA: 'Değişiklik',
  retroStrong: 'geriye dönük',
  retroB:
    'uygulanır: eşik düşerse geçmiş yorumlarla yeni rozetler (ve ödül puanı) açılabilir; yükselirse hazır kullanıcılar geriler. Yayınlamadan önce etkiyi görürsünüz.',
  fixErrors: 'Hatalı alanları düzeltin.',
  changed: 'değişti',
  reviewTitle: 'Eşik değişikliğini gözden geçir',
  reviewDesc: 'Etki bugünkü yorum ve rozet verisiyle hesaplanır (yazma yapılmaz). Yayınlanınca tüm müşterilerde anında geçerli olur.',
  reviewCaption: 'Kategori bazında değişiklik ve etki',
  category: 'Kategori',
  threshold: 'Eşik',
  minLength: 'Min. uzunluk',
  ready: 'Hazır',
  newReadyRegressed: 'Yeni hazır / gerileyen',
  extraBadges: 'Ek rozet · ~puan',
  distribution: 'Dağılım (taslak)',
};

type Copy = typeof tr;

const en: Copy = {
  earnCondition: 'How it’s earned',
  visibilityA: 'Visibility for customers: full-surprise policy — the badge',
  visibilityStrong: 'stays hidden until it’s earned',
  visibilityB: 'and can’t be bought with points.',
  customerView: 'Customer view',
  appearance: 'Appearance',
  never: 'Never',
  searchTestAccount: 'Search test accounts',
  exhausted: 'Exhausted (all characters taken or inactive)',
  sampleReview: 'Sample review',
  tooShort: 'Review is too short: in production it doesn’t count toward any category.',
  unclassified: 'Couldn’t classify: the AI didn’t return a valid category, so the review doesn’t count toward the bar.',
  notInList: 'The selected badge isn’t in this list (it may be inactive/archived or outside the first 100).',
  fateOrb: 'Fate orb',
  reasonOptional: 'Reason text (optional)',
  ownerRate: 'Owner rate % (optional)',
  thresholdsIntro:
    'Reviews needed to unlock a character and (optionally) the minimum length for a review to count. Blank fields use the default from code.',
  retroA: 'Changes apply',
  retroStrong: 'retroactively',
  retroB:
    ': lowering a threshold can unlock new badges (and reward points) from past reviews; raising it moves ready users back. You’ll see the impact before publishing.',
  fixErrors: 'Fix the highlighted fields.',
  changed: 'changed',
  reviewTitle: 'Review threshold change',
  reviewDesc: 'Impact is computed from today’s review and badge data (nothing is written). Once published, it applies to all customers immediately.',
  reviewCaption: 'Changes and impact by category',
  category: 'Category',
  threshold: 'Threshold',
  minLength: 'Min. length',
  ready: 'Ready',
  newReadyRegressed: 'Newly ready / moved back',
  extraBadges: 'Extra badges · ~points',
  distribution: 'Distribution (draft)',
};

export const BADGES_ADMIN_COPY = { tr, en } as const;

export function useBadgesAdminCopy(): Copy {
  return BADGES_ADMIN_COPY[useDsLocale()];
}
