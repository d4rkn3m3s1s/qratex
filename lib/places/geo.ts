/**
 * Keşfet (/customer/places) — konum yardımcıları. Saf ve istemci-güvenli (node `crypto` yok).
 *
 * Gizlilik: kullanıcı konumu sunucuya ve tarayıcı belleğine ~110 m hassasiyete (3 ondalık)
 * yuvarlanarak gider; ham GPS (6 ondalık ≈ 10 cm) hiçbir yerde saklanmaz ve ekrana basılmaz.
 */

const EARTH_RADIUS_KM = 6371;

export const RADIUS_PRESETS_KM = [1, 3, 5, 10, 25] as const;
export type RadiusPreset = (typeof RADIUS_PRESETS_KM)[number];
export const DEFAULT_RADIUS_KM: RadiusPreset = 5;
export const MIN_RADIUS_KM = 0.5;
export const MAX_RADIUS_KM = 50;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** İki koordinat arası büyük çember mesafesi (km). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Koordinatı ~110 m hassasiyete yuvarlar (gizlilik + önbellek dostu). */
export function coarsen(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function clampRadiusKm(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, n));
}

/**
 * Yarıçapı kapsayan enlem/boylam kutusu (DB ön filtresi). Kutunun köşeleri yarıçaptan
 * geniştir; kesin eleme sonra `distanceKm` ile yapılır.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  const padLat = (radiusKm / 111) * 1.05;
  const cosLat = Math.cos(toRad(lat));
  const padLng = Math.abs(cosLat) > 0.02 ? padLat / Math.abs(cosLat) : 180;
  return {
    minLat: Math.max(-90, lat - padLat),
    maxLat: Math.min(90, lat + padLat),
    minLng: Math.max(-180, lng - padLng),
    maxLng: Math.min(180, lng + padLng),
  };
}

/** Yürüme süresi (dk) — 4,8 km/sa (12,5 dk/km), en az 1. */
export function walkingMinutes(km: number): number {
  return Math.max(1, Math.round(km * 12.5));
}

/** Liste ve harita için TEK mesafe biçimi: < 1 km → "350 m", aksi "1,2 km". */
export function formatDistance(km: number, locale: 'tr' | 'en' = 'tr'): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  const tag = locale === 'en' ? 'en-US' : 'tr-TR';
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1, minimumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}

/** Yol tarifi bağlantıları — adres metni yerine koordinat (yanlış eşleşme yok). */
export function directionsLinks(lat: number, lng: number): { google: string; apple: string } {
  const dest = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`,
  };
}
