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
