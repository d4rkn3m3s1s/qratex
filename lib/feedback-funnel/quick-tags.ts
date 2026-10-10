/**
 * QR geri bildirim hunisinin hızlı etiketleri (saf; istemci + sunucu güvenli).
 *
 * Eski davranış (rapor Bulgu 6): çipler sabit Türkçe cümleleri serbest metne EKLİYORDU →
 * üç dokunuş "detaylı yorum" bonusunu açıyordu, tekrar basınca metin çoğalıyordu, EN modda
 * da Türkçeydi, seçili durumu yoktu.
 *
 * Şimdi:
 *  - Etiketler sabit kimliklidir (`staff_friendly` …) ve AYRI alan olarak gönderilir.
 *  - Detaylı yorum ödülü YALNIZ kullanıcının kendi yazdığı metinden hesaplanır.
 *  - Puana göre bağlamsal set: 1-2 yıldız olumsuz, 3 karışık, 4-5 olumlu.
 *  - Sunucu, işletmenin okuyabilmesi için seçilen etiketleri Türkçe kanonik etiketle yorumun
 *    altına tek satır olarak ekler (`composeStoredText`) ve kimlikleri `feedback_submitted`
 *    olayına yapılandırılmış olarak yazar. (Ayrı `Feedback.quickTags` sütunu ŞEMA İSTEĞİ.)
 */

export type QuickTagPolarity = 'positive' | 'negative';

export type QuickTag = {
  id: string;
  polarity: QuickTagPolarity;
  tr: string;
  en: string;
};

export const QUICK_TAGS: readonly QuickTag[] = [
  { id: 'staff_friendly', polarity: 'positive', tr: 'Personel ilgiliydi', en: 'Friendly staff' },
  { id: 'fast_service', polarity: 'positive', tr: 'Hizmet hızlıydı', en: 'Fast service' },
  { id: 'clean', polarity: 'positive', tr: 'Temizdi', en: 'Clean' },
  { id: 'tasty', polarity: 'positive', tr: 'Lezzetliydi', en: 'Tasty' },
  { id: 'good_value', polarity: 'positive', tr: 'Fiyatı uygundu', en: 'Good value' },
  { id: 'nice_ambiance', polarity: 'positive', tr: 'Ortam güzeldi', en: 'Nice atmosphere' },
  { id: 'will_return', polarity: 'positive', tr: 'Yine gelirim', en: 'I will come back' },
  { id: 'long_wait', polarity: 'negative', tr: 'Bekleme uzundu', en: 'Long wait' },
  { id: 'slow_service', polarity: 'negative', tr: 'Hizmet yavaştı', en: 'Slow service' },
  { id: 'staff_unfriendly', polarity: 'negative', tr: 'Personel ilgisizdi', en: 'Unhelpful staff' },
  { id: 'not_clean', polarity: 'negative', tr: 'Temizlik yetersizdi', en: 'Not clean' },
  { id: 'wrong_order', polarity: 'negative', tr: 'Sipariş yanlış geldi', en: 'Wrong order' },
  { id: 'pricey', polarity: 'negative', tr: 'Fiyatı yüksekti', en: 'Overpriced' },
  { id: 'noisy', polarity: 'negative', tr: 'Ortam gürültülüydü', en: 'Too noisy' },
] as const;

const BY_ID = new Map(QUICK_TAGS.map((t) => [t.id, t]));

/** Gönderimde en fazla bu kadar etiket. */
export const MAX_QUICK_TAGS = 4;

/** Puana göre gösterilecek etiketler (sıra korunur). */
export function tagsForRating(rating: number | null | undefined): QuickTag[] {
  if (!rating || rating < 1) return [];
  if (rating <= 2) return QUICK_TAGS.filter((t) => t.polarity === 'negative');
  if (rating >= 4) return QUICK_TAGS.filter((t) => t.polarity === 'positive');
  // 3 yıldız: karışık — en sık iki uç sinyal.
  const mixed = ['staff_friendly', 'tasty', 'good_value', 'long_wait', 'slow_service', 'pricey', 'not_clean'];
  return mixed.map((id) => BY_ID.get(id)).filter((t): t is QuickTag => !!t);
}

export function isQuickTagId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Bilinmeyenleri atar, tekilleştirir, sınırlar (sıra korunur). */
export function normalizeQuickTags(ids: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const id of ids) {
    if (isQuickTagId(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_QUICK_TAGS) break;
  }
  return out;
}

export function quickTagLabel(id: string, locale: 'tr' | 'en'): string {
  const tag = BY_ID.get(id);
  if (!tag) return id;
  return locale === 'en' ? tag.en : tag.tr;
}

/** Saklanan metindeki etiket satırının öneki (işletme panelinde okunur, Türkçe kanonik). */
export const STORED_TAG_PREFIX = 'Seçilen etiketler: ';

/**
 * Saklanacak metin: kullanıcının kendi metni + (varsa) etiket satırı. Etiket yoksa ve metin
 * boşsa `null` (boş yorum yazılmaz).
 */
export function composeStoredText(userText: string | null | undefined, tagIds: readonly string[]): string | null {
  const own = typeof userText === 'string' ? userText.trim() : '';
  const tags = normalizeQuickTags(tagIds);
  const tagLine = tags.length ? `${STORED_TAG_PREFIX}${tags.map((id) => quickTagLabel(id, 'tr')).join(', ')}` : '';
  if (own && tagLine) return `${own}\n\n${tagLine}`;
  return own || tagLine || null;
}
