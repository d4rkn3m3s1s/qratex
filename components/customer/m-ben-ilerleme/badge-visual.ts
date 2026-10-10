/**
 * `Badge.icon` → görsel ya da emoji. Saf.
 *
 * `Badge.icon` serbest metindir: hazır rozetlerde `/images/badges/…svg` yolu, karakter
 * rozetlerinde görsel yolu, eski rozetlerde emoji. Eski Gelişim merkezi yolu METİN olarak
 * basıyordu ("/images/badges/YENİ SES.svg Yeni Ses", progress-hub bulgu 3). Burada yol/URL
 * ise küçük WebP resmine (`resolveBadgeThumb`), değilse kısa emoji/metne çevrilir.
 */
import { resolveBadgeThumb } from '@/lib/badge-images';
import { sanitizeHexColor } from '@/lib/badge-colors';

export function badgeVisual(icon: string | null | undefined): { imageSrc: string | null; emoji: string | null } {
  const raw = typeof icon === 'string' ? icon.trim() : '';
  if (!raw) return { imageSrc: null, emoji: null };
  if (raw.startsWith('/') || /^https?:\/\//i.test(raw)) {
    return { imageSrc: resolveBadgeThumb(raw), emoji: null };
  }
  // Emoji ya da kısa simge; uzun metin rozet görseli olarak anlamsız → baş harf yedeğine düşer.
  return { imageSrc: null, emoji: Array.from(raw).length <= 4 ? raw : null };
}

export function badgeColor(color: string | null | undefined): string | null {
  return sanitizeHexColor(color);
}
