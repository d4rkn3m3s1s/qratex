/**
 * Evrensel QR çözücü — okunan metnin NE olduğunu söyler (saf, istemci + sunucu güvenli).
 *
 * Yol haritası §4.3 "Tara (merkez FAB)": tek çözücü `/c/<token>` (fiziksel kart),
 * `/feedback/<kod>` (masa/ürün geri bildirim QR'ı) ve düz kodu tanır. Ağ/DB'ye dokunmaz;
 * düz kodun QR kodu mu kart token'ı mı olduğuna sunucu karar verir (iki benzersiz anahtar).
 *
 * Eski davranış (customer/scan): eşleşmeyen her metnin SON 8 karakterini kod sanıyordu —
 * menü linki, Wi-Fi QR'ı ya da Instagram QR'ı API'ye istek + "bulunamadı" üretiyordu (B-6).
 * Artık tanınmayan içerik `unknown` döner ve hiç istek atılmaz.
 *
 * Testler: __tests__/lib/qr-resolve.test.ts
 */

/** Okunan içeriğin türü. */
export type QrTarget =
  | { kind: 'feedback'; code: string }
  | { kind: 'card'; token: string }
  /** Düz kod: QR kodu (`ABCD1234`, eski `DEMO-CAFE-001`) ya da kart token'ı olabilir. */
  | { kind: 'plain'; value: string }
  | { kind: 'unknown' };

/** QR `code` alanı (lib/utils#generateQRCode: 8 karakter A-Z0-9; eski/seed kodlar tireli olabilir). */
export const QR_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
/** Yeni üretilen QR kodları (generateQRCode). */
export const QR_CODE_STRICT_PATTERN = /^[A-Z0-9]{8}$/;
/** Kart token'ı (api/cards/[token] TOKEN_RE ile aynı). */
export const CARD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

/** Okutulan içerik bundan uzunsa çözülmez (kötü niyetli dev QR'lar). */
export const MAX_QR_PAYLOAD_LENGTH = 2048;

const PATH_TARGET = /(?:^|\/)(c|feedback)\/([A-Za-z0-9_-]{1,128})(?:[/?#]|$)/;

/**
 * Okunan/yapıştırılan metni çözümler.
 *  - `https://alan/c/<token>` ya da `alan/c/<token>` → kart
 *  - `https://alan/feedback/<kod>` → geri bildirim
 *  - Düz `[A-Za-z0-9_-]{4,128}` → plain (sunucu QR → kart sırasıyla dener)
 *  - Diğer her şey (başka site, Wi-Fi, vCard, boşluklu metin) → unknown
 */
export function parseQrPayload(raw: unknown): QrTarget {
  if (typeof raw !== 'string') return { kind: 'unknown' };
  const text = raw.trim();
  if (!text || text.length > MAX_QR_PAYLOAD_LENGTH) return { kind: 'unknown' };

  if (text.includes('/')) {
    const m = text.match(PATH_TARGET);
    if (!m) return { kind: 'unknown' };
    const [, segment, value] = m;
    if (segment === 'c') {
      return CARD_TOKEN_PATTERN.test(value) ? { kind: 'card', token: value } : { kind: 'unknown' };
    }
    return QR_CODE_PATTERN.test(value) ? { kind: 'feedback', code: value } : { kind: 'unknown' };
  }

  if (CARD_TOKEN_PATTERN.test(text)) return { kind: 'plain', value: text };
  return { kind: 'unknown' };
}

/** Bir QR kodu için arama adayları: önce yazıldığı gibi, sonra büyük harfle (elle girişte küçük harf). */
export function qrCodeCandidates(value: string): string[] {
  if (!QR_CODE_PATTERN.test(value)) return [];
  const upper = value.toUpperCase();
  return upper === value ? [value] : [value, upper];
}

/** Uygulama içi tarama kaynağı (geri bildirim sayfasına atıf olarak taşınır). */
export type ScanSource = 'camera' | 'manual' | 'gallery' | 'link';

/** Geri bildirim sayfası yolu; `src` atfı `?src=in_app_<kaynak>` olarak eklenir. */
export function feedbackHref(code: string, source?: ScanSource): string {
  const base = `/feedback/${encodeURIComponent(code)}`;
  return source ? `${base}?src=in_app_${source}` : base;
}

/** Kart deep-link yolu (fiziksel kartın QR'ı). */
export function cardHref(token: string): string {
  return `/c/${encodeURIComponent(token)}`;
}
