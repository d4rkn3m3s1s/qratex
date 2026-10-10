/**
 * Huninin istemci + sunucu ortak sabitleri (zod'suz: istemci paketine şema kütüphanesi taşınmaz).
 */

/** Fotoğraf sınırı (gövde değil, R2 URL'i taşınır). */
export const MAX_FEEDBACK_PHOTOS = 3;

/** Kaynak atfı: QR'dan doğrudan, uygulama içi tarama (`?src=in_app_<kaynak>`) ya da bağlantı. */
export const ATTRIBUTION_SOURCES = [
  'qr',
  'link',
  'in_app_camera',
  'in_app_manual',
  'in_app_gallery',
  'in_app_link',
  'offline_queue',
] as const;
export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];

export function isAttributionSource(v: unknown): v is AttributionSource {
  return typeof v === 'string' && (ATTRIBUTION_SOURCES as readonly string[]).includes(v);
}
