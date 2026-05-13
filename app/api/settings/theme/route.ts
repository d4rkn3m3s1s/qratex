import { NextResponse } from 'next/server';
import { responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getPublicThemeSettings } from '@/lib/get-public-theme-settings';

const PUBLIC_CACHE_HEADERS = {
  /** Kısa CDN önbelleği; admin kaydı `revalidatePublicThemeSettings` ile anında yenilenir. */
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
} as const;

// ─────────────────────────────────────────────────────────────
// GET /api/settings/theme - Public endpoint for theme settings
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const entries = await getPublicThemeSettings();
    return NextResponse.json({ entries }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching theme settings:', error);
    return NextResponse.json({ entries: [] }, { headers: PUBLIC_CACHE_HEADERS });
  }
}
