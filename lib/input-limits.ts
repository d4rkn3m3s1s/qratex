/**
 * Merkezi input uzunluk limitleri (güvenlik ve tutarlılık).
 * API ve validations bu değerleri kullanmalı.
 */
export const INPUT_LIMITS = {
  /** Geri bildirim / yorum metni (feedback, consumption review) */
  feedbackText: 2000,
  /** Sohbet / AI mesaj (chat, ai-chat) */
  messageText: 2000,
  /** Dealer yanıtı (reply, remedy) */
  replyText: 2000,
  /** Genel kısa metin (isim, başlık) */
  shortText: 100,
  /** Açıklama / not */
  description: 500,
  /** Arama sorgusu */
  searchQuery: 200,
} as const;
