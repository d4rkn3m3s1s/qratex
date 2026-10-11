/**
 * Media güvenliği (P2-20 item 17).
 * Magic bytes ile MIME doğrulama; PNG için EXIF temizleme.
 */
import sharp from 'sharp';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG_HEADERS = ['<?xml', '<svg'];

export function getMimeFromMagic(buffer: Buffer): string | null {
  if (buffer.length < 8) return null;
  if (buffer.compare(PNG_SIGNATURE, 0, 8, 0, 8) === 0) return 'image/png';
  const start = buffer.toString('utf8', 0, 100).trim().toLowerCase();
  if (SVG_HEADERS.some((h) => start.startsWith(h.toLowerCase()))) return 'image/svg+xml';
  return null;
}

/** Claimed MIME ile magic bytes uyuşuyor mu? */
export function validateMimeMagic(buffer: Buffer, claimedMime: string): boolean {
  const detected = getMimeFromMagic(buffer);
  if (!detected) return false;
  if (claimedMime === 'image/svg+xml') return detected === 'image/svg+xml';
  if (claimedMime === 'image/png') return detected === 'image/png';
  return false;
}

/**
 * SVG'de etkin içerik var mı? (XSS riski) — `true` ise dosya REDDEDİLİR.
 *
 * guvenlik-admin-api B12: eski kara liste yalnız `<script`, `javascript:` ve `on…=` arıyordu;
 * HTML varlık kodlaması (`javascript&#58;`), `<foreignObject>` içine gömülü HTML, DOCTYPE/ENTITY
 * genişletmesi, harici `href`/`xlink:href` (başka kökenden betik/kaynak), `<iframe>/<embed>/
 * <object>`, `<animate … attributeName="href">` ile çalışma anında bağlantı değiştirme ve CSS
 * `@import`/`url(javascript:)` ile atlatılabiliyordu. Artık:
 *  - Rozet/ödül görselinde HİÇ gerekmeyen yapılar doğrudan red (DOCTYPE, ENTITY, foreignObject,
 *    script, iframe/embed/object, `set`/`animate` ile href hedefleme, `@import`).
 *  - Varlık kodlamalı her şey red: SVG'de `&#…;` / `&…;` yalnız metin içeriğinde anlamlıdır,
 *    rozet görselinde gerekmez — atlatma vektörlerinin tamamı buradan geçer.
 *  - `href`/`xlink:href` yalnız belge içi (`#id`) ya da `data:image/(png|jpeg|gif|webp)` olabilir.
 *  - Olay öznitelikleri (`on…=`) ve `javascript:`/`vbscript:`/`data:text/html` her yerde red.
 * Ayrıca yükleme ucu SVG'yi `Content-Disposition: attachment` ile saklar: doğrudan açılırsa
 * belge olarak çalışmaz, `<img>` içinde (betik zaten çalışmaz) normal görünür.
 */
export function svgContainsScript(buffer: Buffer): boolean {
  const text = buffer.toString('utf8');
  const lower = text.toLowerCase();
  if (/<!doctype|<!entity|<!\[cdata\[/.test(lower)) return true;
  if (/<\s*(script|foreignobject|iframe|embed|object|handler|listener)\b/.test(lower)) return true;
  if (/<\s*(set|animate)\b[^>]*attributename\s*=\s*["']?\s*(xlink:)?href/.test(lower)) return true;
  if (/&#|&[a-z][a-z0-9]*;/i.test(text.replace(/&(amp|lt|gt|quot|apos);/g, ''))) return true;
  if (/\bon[a-z]+\s*=/.test(lower)) return true;
  if (/(javascript|vbscript|livescript)\s*:|data\s*:\s*(text\/html|application\/(xhtml|javascript|ecmascript)|image\/svg)/.test(lower)) return true;
  if (/@import|expression\s*\(|behavior\s*:|-moz-binding/.test(lower)) return true;
  for (const m of lower.matchAll(/(?:xlink:)?href\s*=\s*["']\s*([^"']*)["']/g)) {
    const v = m[1].trim();
    if (!(v.startsWith('#') || /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(v))) return true;
  }
  // Tırnaksız href (`href=http://…`) de harici kaynaktır.
  if (/(?:xlink:)?href\s*=\s*[^"'\s>]/.test(lower)) return true;
  // CSS url() yalnız belge içi (#id) ya da veri görseli olabilir.
  for (const m of lower.matchAll(/url\(\s*["']?\s*([^"')]*)/g)) {
    const v = m[1].trim();
    if (!(v.startsWith('#') || /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(v))) return true;
  }
  return false;
}

/** Yükleme sırasında SVG'nin saklanacağı Content-Disposition (doğrudan açılışta belge olarak çalışmaz). */
export function assetContentDisposition(mime: string, filename: string): string | undefined {
  if (mime !== 'image/svg+xml') return undefined;
  const safe = (filename || 'gorsel.svg').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  return `attachment; filename="${safe}"`;
}

/** PNG EXIF temizle; yeni buffer döner. */
export async function stripExifPng(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .png()
    .toBuffer();
}
