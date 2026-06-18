import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { GAMIFICATION_SETTINGS_TAG } from '@/lib/gamification-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    let settings = await prisma.gamificationSettings.findFirst();
    
    if (!settings) {
      settings = await prisma.gamificationSettings.create({
        data: {
          xpMultiplier: 1.0,
          pointMultiplier: 1.0,
          dailyXpCap: 5000,
          levelUpRewardBase: 100,
          isSeasonActive: true,
        },
      });
    }

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching gamification settings:', error);
    return NextResponse.json({ error: 'Ayarlar getirilemedi' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const current = await prisma.gamificationSettings.findFirst();

    if (!current) {
      const created = await prisma.gamificationSettings.create({
        data: {
          xpMultiplier: body.xpMultiplier ?? 1.0,
          pointMultiplier: body.pointMultiplier ?? 1.0,
          dailyXpCap: body.dailyXpCap ?? 5000,
          levelUpRewardBase: body.levelUpRewardBase ?? 100,
          isSeasonActive: body.isSeasonActive ?? true,
          seasonName: body.seasonName,
          seasonEndsAt: body.seasonEndsAt ? new Date(body.seasonEndsAt) : null,
        },
      });
      revalidateTag(GAMIFICATION_SETTINGS_TAG, 'max');
      return NextResponse.json({ success: true, settings: created });
    }

    const updated = await prisma.gamificationSettings.update({
      where: { id: current.id },
      data: {
        xpMultiplier: body.xpMultiplier,
        pointMultiplier: body.pointMultiplier,
        dailyXpCap: body.dailyXpCap,
        levelUpRewardBase: body.levelUpRewardBase,
        isSeasonActive: body.isSeasonActive,
        seasonName: body.seasonName,
        seasonEndsAt: body.seasonEndsAt ? new Date(body.seasonEndsAt) : null,
      },
    });

    revalidateTag(GAMIFICATION_SETTINGS_TAG, 'max');
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error('Error updating gamification settings:', error);
    return NextResponse.json({ error: 'Ayarlar güncellenemedi' }, { status: 500 });
  }
}
