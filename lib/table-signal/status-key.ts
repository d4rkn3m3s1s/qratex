/**
 * Masa sinyali misafir takip anahtarı — HMAC imzalı, süreli (sunucu).
 *
 * Misafirin oturumu yoktur; vakanın durumunu yalnız sinyali gönderen tarayıcı görebilsin diye
 * yanıtta `ref` (vaka id) + `key` (imza) döner. Anahtar olmadan durum ucu hiçbir şey söylemez.
 * Durum yanıtı yalnız aşama + zaman taşır (vaka içeriği, not, personel adı DÖNMEZ).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TRACKING_TTL_MS } from './kinds';

const VERSION = 'ts1';

function secret(): string {
  const s = process.env.TABLE_SIGNAL_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    // Fail-closed: imzasız takip anahtarı üretilmez (durum takibi kapalı kalır).
    throw new Error('TABLE_SIGNAL_SECRET / NEXTAUTH_SECRET yapılandırılmamış.');
  }
  return s;
}

function mac(ref: string, exp: number): string {
  return createHmac('sha256', secret()).update(`${VERSION}.${ref}.${exp}`).digest('base64url');
}

export interface TrackingKey {
  ref: string;
  key: string;
  expiresAt: string;
}

/** İmzalı takip anahtarı; sır yoksa null (takip sunulmaz, sinyal yine iletilir). */
export function signTrackingKey(ref: string, now: number = Date.now()): TrackingKey | null {
  const exp = now + TRACKING_TTL_MS;
  try {
    return { ref, key: `${VERSION}.${exp}.${mac(ref, exp)}`, expiresAt: new Date(exp).toISOString() };
  } catch {
    return null;
  }
}

export function verifyTrackingKey(ref: unknown, key: unknown, now: number = Date.now()): boolean {
  if (typeof ref !== 'string' || typeof key !== 'string' || ref.length > 64 || key.length > 256) return false;
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  let want: string;
  try {
    want = mac(ref, exp);
  } catch {
    return false;
  }
  const a = Buffer.from(want);
  const b = Buffer.from(parts[2]);
  return a.length === b.length && timingSafeEqual(a, b);
}
