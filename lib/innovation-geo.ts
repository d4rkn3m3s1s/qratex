import { createHash } from 'crypto';

/** Kaba konum anahtarı — tam adres sızdırmadan yakınlık gruplaması (~ birkaç km) */
export function coarseLocationBucket(lat: number, lng: number): string {
  const r = (n: number, p: number) => Number(n.toFixed(p));
  return `${r(lat, 2)}_${r(lng, 2)}`;
}

/** Flash indeksleme için kısa bölge anahtarı (~5 hex; adres sızdırmaz) */
export function dealerFlashGeoKey(lat: number, lng: number): string {
  return createHash('sha256')
    .update(`${lat.toFixed(4)},${lng.toFixed(4)}`, 'utf8')
    .digest('hex')
    .slice(0, 5);
}

/** İki koordinat arası mesafe (km) */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
