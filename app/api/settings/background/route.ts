import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';

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
      { headers: PRIVATE_NO_STORE_HEADERS }
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

