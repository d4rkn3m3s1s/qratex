import type { NextRequest } from 'next/server';

/**
 * Public site origin for Referer / outbound policy headers (e.g. Nominatim).
 * Prefer NEXTAUTH_URL or NEXT_PUBLIC_APP_URL in production.
 */
export function getPublicAppOrigin(): string {
  const trimmed =
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}` : '');
  return trimmed || 'http://localhost:3000';
}

/**
 * Gelen HTTP isteğinden kök URL (Vercel’de `x-forwarded-host` / `x-forwarded-proto`).
 * E-posta ve CTA’lar için ortam değişkeni boş olsa bile doğru domain üretir.
 */
export function getPublicOriginFromRequest(request: NextRequest): string | null {
  const hostRaw = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!hostRaw) return null;
  const host = hostRaw.split(',')[0].trim();
  if (!host) return null;

  const protoRaw = request.headers.get('x-forwarded-proto');
  const protoFirst = protoRaw?.split(',')[0]?.trim().toLowerCase();

  const isLocal =
    host === 'localhost' ||
    host.startsWith('127.') ||
    host.startsWith('localhost:') ||
    host.endsWith('.local');

  const scheme =
    protoFirst === 'http' || protoFirst === 'https' ? protoFirst : isLocal ? 'http' : 'https';

  try {
    return new URL(`${scheme}://${host}`).origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Önce istek kökeni (admin e-posta vb.), yoksa `getPublicAppOrigin()`. */
export function getPublicAppOriginFromRequest(request: NextRequest): string {
  const fromReq = getPublicOriginFromRequest(request);
  if (fromReq) return fromReq;
  return getPublicAppOrigin();
}
