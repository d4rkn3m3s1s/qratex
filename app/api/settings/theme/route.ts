import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────
// GET /api/settings/theme - Public endpoint for theme settings
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const settings = await prisma.settings.findMany({
      where: { category: 'theme' },
      select: {
        key: true,
        value: true,
      },
    });

    return NextResponse.json({ raw: settings });
  } catch (error) {
    console.error('Error fetching theme settings:', error);
    return NextResponse.json({ raw: [] });
  }
}
