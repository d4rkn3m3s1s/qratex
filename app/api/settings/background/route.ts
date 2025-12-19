import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    });
  } catch (error) {
    console.error('Error fetching background setting:', error);
    return NextResponse.json({
      backgroundEffect: 'original',
    });
  }
}

