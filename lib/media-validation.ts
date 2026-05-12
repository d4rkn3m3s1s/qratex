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

/** SVG'de script var mı? (XSS riski) */
export function svgContainsScript(buffer: Buffer): boolean {
  const text = buffer.toString('utf8').toLowerCase();
  return /<script\b/i.test(text) || /javascript\s*:/i.test(text) || /on\w+\s*=/i.test(text);
}

/** PNG EXIF temizle; yeni buffer döner. */
export async function stripExifPng(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .png()
    .toBuffer();
}
