import { NextResponse } from 'next/server';
import { getPublicThemeSettings } from '@/lib/get-public-theme-settings';

// ─────────────────────────────────────────────────────────────
// GET /api/settings/theme - Public endpoint for theme settings
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const settings = await getPublicThemeSettings();
    return NextResponse.json({ raw: settings });
  } catch (error) {
    console.error('Error fetching theme settings:', error);
    return NextResponse.json({ raw: [] });
  }
}

