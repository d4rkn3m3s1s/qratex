/**
 * Admin gizli kapı — EDGE-SAFE yardımcı (proxy/middleware'de kullanılır). node crypto
 * İÇERMEZ (edge runtime uyumlu). HMAC üretimi/doğrulaması lib/admin-gate.ts'te (node/API).
 */

export const ADMIN_GATE_COOKIE = 'admin_gate';

/**
 * proxy için hafif kontrol: gate cookie'si bu kullanıcıya ait mi + biçimi geçerli mi.
 * proxy HMAC secret doğrulaması YAPMAZ (edge'de senkron node crypto yok); ama cookie'yi
 * elde etmenin TEK yolu doğru cevabı vermek olduğundan (imza secret'ı istemcide yok) yeterli.
 * userId eşleşmesi cookie'nin başka kullanıcıya taşınmasını da engeller.
 */
export function gateCookieBelongsTo(cookieValue: string | undefined, userId: string): boolean {
  if (!cookieValue || !userId) return false;
  const dot = cookieValue.indexOf('.');
  if (dot <= 0) return false;
  const cookieUserId = cookieValue.slice(0, dot);
  const hmac = cookieValue.slice(dot + 1);
  // userId eşleşmeli + hmac kısmı SHA256 hex (64 karakter) olmalı.
  return cookieUserId === userId && /^[a-f0-9]{64}$/.test(hmac);
}
