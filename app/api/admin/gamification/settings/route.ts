import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { Prisma } from '@prisma/client';
import { GAMIFICATION_SETTINGS_TAG } from '@/lib/gamification-settings';

export const dynamic = 'force-dynamic';

/** Sayı alanını güvene al: geçersiz/NaN'ı reddet, min-max aralığına kıs (ekonomi koruması). */
function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

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
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json().catch(() => ({}));
    const current = await prisma.gamificationSettings.findFirst();

    // Ekonomi-kritik alanları GÜVENE AL (çarpanlar puan kredisine uygulanır):
    // xp/point çarpanı 0-100, XP tavanı 0-1e7, seviye ödülü 0-1e6. Geçersiz/NaN → varsayılan.
    const xpMultiplier = clampNum(body.xpMultiplier, 0, 100, current?.xpMultiplier ?? 1.0);
    const pointMultiplier = clampNum(body.pointMultiplier, 0, 100, current?.pointMultiplier ?? 1.0);
    const dailyXpCap = Math.round(clampNum(body.dailyXpCap, 0, 10_000_000, current?.dailyXpCap ?? 5000));
    const levelUpRewardBase = Math.round(clampNum(body.levelUpRewardBase, 0, 1_000_000, current?.levelUpRewardBase ?? 100));
    const isSeasonActive = typeof body.isSeasonActive === 'boolean' ? body.isSeasonActive : (current?.isSeasonActive ?? true);
    const seasonName = typeof body.seasonName === 'string' ? body.seasonName.slice(0, 120) : (current?.seasonName ?? null);
    const seasonEndsAt = body.seasonEndsAt ? new Date(body.seasonEndsAt) : null;
    // Geçersiz tarih koruması
    const safeSeasonEndsAt = seasonEndsAt && !isNaN(seasonEndsAt.getTime()) ? seasonEndsAt : (current?.seasonEndsAt ?? null);

    const data = { xpMultiplier, pointMultiplier, dailyXpCap, levelUpRewardBase, isSeasonActive, seasonName, seasonEndsAt: safeSeasonEndsAt };

    const saved = current
      ? await prisma.gamificationSettings.update({ where: { id: current.id }, data })
      : await prisma.gamificationSettings.create({ data });

    // Ekonomi ayarı değişikliği izlenebilir olmalı (points-matrix gibi).
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_GAMIFICATION_SETTINGS',
        entity: 'GamificationSettings',
        entityId: saved.id,
        oldData: (current ? { xpMultiplier: current.xpMultiplier, pointMultiplier: current.pointMultiplier, dailyXpCap: current.dailyXpCap, levelUpRewardBase: current.levelUpRewardBase } : Prisma.JsonNull) as Prisma.InputJsonValue,
        newData: { xpMultiplier, pointMultiplier, dailyXpCap, levelUpRewardBase } as Prisma.InputJsonValue,
        ...auditMeta,
      },
    }).catch((e) => console.error('[gamification-settings] audit log failed:', e));

    revalidateTag(GAMIFICATION_SETTINGS_TAG, 'max');
    return NextResponse.json({ success: true, settings: saved });
  } catch (error) {
    console.error('Error updating gamification settings:', error);
    return NextResponse.json({ error: 'Ayarlar güncellenemedi' }, { status: 500 });
  }
}
