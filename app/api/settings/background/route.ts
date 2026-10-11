import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';

export const dynamic = 'force-dynamic';

/**
 * İçerik kullanıcıya özel değil (herkese aynı arka plan): CDN'de kısa süre paylaşılır — tanıtım
 * sayfası her yüklemede DB'ye gitmez (mimari-api B10; tema ve sezon konsepti uçlarıyla aynı).
 */
const PUBLIC_CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

// ─────────────────────────────────────────────────────────────
// GET /api/settings/background - Public endpoint for background settings
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'backgroundEffect' },
      select: { value: true },
    });

    return NextResponse.json(
      {
        backgroundEffect: parseBackgroundEffectFromDb(setting?.value),
      },
      { headers: PUBLIC_CACHE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching background setting:', error);
    return NextResponse.json(
      {
        backgroundEffect: 'original',
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

