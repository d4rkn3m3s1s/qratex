/**
 * Canonical site URL for metadata (SEO, OG, Twitter).
 * In production set NEXT_PUBLIC_APP_URL to your single production domain
 * so all canonical/OG/Twitter URLs point to the same domain.
 * Prod: single domain from env; demo/dev: env or fallback.
 */
import { getPublicAppOrigin } from '@/lib/public-app-origin';

const isProduction = process.env.NODE_ENV === 'production';
const raw =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
  (isProduction ? getPublicAppOrigin() : 'http://localhost:3000');

if (isProduction && !process.env.NEXT_PUBLIC_APP_URL) {
  console.warn(
    '[site-config] NEXT_PUBLIC_APP_URL not set in production. Canonical/OG URLs use NEXTAUTH_URL, VERCEL_URL, or localhost fallback — set NEXT_PUBLIC_APP_URL to your public domain.'
  );
}

export const siteUrl = raw.replace(/\/$/, '');
export { isProduction };

/**
 * Absolute canonical URL for a path. Use for OG, sitemap, metadata.
 */
export function getCanonicalUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${siteUrl}${normalized}`;
}
