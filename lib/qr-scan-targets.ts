/**
 * QR içeriğinden hedef kodu çıkarma — kasa (bayi) ve müşteri tarama sayfaları.
 * Saf fonksiyonlar; testler: __tests__/lib/qr-scan-targets.test.ts
 */

const TOKEN_CHARS = /^[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 128;

/**
 * Müşteri kartı QR'ı: `https://alan/c/<token>` veya düz token.
 * Geçersiz/boş içerikte null döner (API'ye anlamsız istek gitmez).
 */
export function extractCardToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/c\/([A-Za-z0-9_-]{1,128})(?:[/?#]|$)/);
  if (urlMatch) return urlMatch[1];
  if (trimmed.length <= MAX_TOKEN_LENGTH && TOKEN_CHARS.test(trimmed)) return trimmed;
  return null;
}

/**
 * Masa/ürün geri bildirim QR'ı: `https://alan/feedback/<kod>` veya düz kod.
 * Eski sürüm eşleşmeyen her metnin SON 8 karakterini kod sanıyordu (rastgele bir URL bile
 * API'ye istek + analitik `qr_scanned` olayı üretiyordu); artık null döner.
 */
export function extractFeedbackCode(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/feedback\/([A-Za-z0-9_-]{4,64})(?:[/?#]|$)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{4,64}$/.test(trimmed)) return trimmed;
  return null;
}
