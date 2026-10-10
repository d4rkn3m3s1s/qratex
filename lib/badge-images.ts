import { BADGE_THUMB_MAP } from '@/lib/badge-image-map.generated';

/**
 * Rozet görselleri (perf K2). `public/images/badges/*.svg` gerçek vektör ama yoğun yol verisi
 * taşıyor (85 dosya ≈ 40 MB, dosya başına 0,5–1 MB); next/image SVG'yi optimize etmez.
 * `scripts/optimize-images.mjs` her rozet için içerik hash'li 320 px WebP küçük resim üretir
 * (≈ 10 KB; 1 yıl `immutable` önbellek). Özgün SVG yolları veritabanında (`Badge.icon`)
 * kimlik olarak durur ve DEĞİŞMEZ.
 *
 * Izgara, liste, bildirim gibi ≤ 160 CSS px gösterimlerde `resolveBadgeThumb(icon)` kullanın;
 * büyük detay görünümünde özgün SVG keskinliği korunur.
 */

/** `/images/badges/S%C3%BCrpriz%20kutusu.svg?v=1` → `/images/badges/Sürpriz kutusu.svg` (NFC). */
function normalizeBadgePath(src: string): string {
  let path = src.trim();
  const originMatch = path.match(/^https?:\/\/[^/]+(\/images\/badges\/.*)$/i);
  if (originMatch) path = originMatch[1];
  path = path.split(/[?#]/, 1)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Bozuk yüzde kodlaması: olduğu gibi bırak.
  }
  return path.normalize('NFC');
}

/**
 * Hazır rozet SVG'sini küçük WebP'ye çevirir. Hazır rozet değilse (R2'ye yüklenmiş görsel,
 * emoji vb.) girdiyi aynen döner; boş girdide null.
 */
export function resolveBadgeThumb(src: string | null | undefined): string | null {
  if (!src) return null;
  return BADGE_THUMB_MAP[normalizeBadgePath(src)] ?? src;
}

/** Değer hazır rozet görseli mi? */
export function isPresetBadgeImage(src: string | null | undefined): boolean {
  if (!src) return false;
  return Object.prototype.hasOwnProperty.call(BADGE_THUMB_MAP, normalizeBadgePath(src));
}
