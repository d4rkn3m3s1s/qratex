import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─────────────────────────────────────────────────────────────
// GET /api/settings/background - Public endpoint for background settings
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'backgroundEffect' },
      select: { value: true },
    });

    return NextResponse.json({
      backgroundEffect: setting?.value || 'original',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error fetching background setting:', error);
    return NextResponse.json({
      backgroundEffect: 'original',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }
}

