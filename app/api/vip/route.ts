import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

// GET - Get VIP info for current user

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Get all VIP tiers
    const tiers = await prisma.vIPTier.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      take: 100,
    });

    // Get user's current VIP status
    let vipStatus = await prisma.userVIPStatus.findUnique({
      where: { userId: session.user.id },
      include: { tier: true },
    });

    // Get user's total points/spending
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { points: true },
    });

    // Auto-assign tier if not set or needs upgrade
    if (tiers.length > 0) {
      const eligibleTier = [...tiers]
        .reverse()
        .find((t) => (user?.points || 0) >= t.minPoints);

      if (eligibleTier) {
        if (!vipStatus || vipStatus.tierId !== eligibleTier.id) {
          vipStatus = await prisma.userVIPStatus.upsert({
            where: { userId: session.user.id },
            update: {
              tierId: eligibleTier.id,
              lifetimePoints: user?.points || 0,
              upgradedAt: new Date(),
            },
            create: {
              userId: session.user.id,
              tierId: eligibleTier.id,
              lifetimePoints: user?.points || 0,
            },
            include: { tier: true },
          });

          // Notify user of tier change
          await prisma.notification.create({
            data: {
              userId: session.user.id,
              type: 'VIP_UPGRADE',
              title: 'VIP Seviye Yükseltme!',
              message: `Tebrikler! ${eligibleTier.name} seviyesine yükseldin!`,
            },
          });
        }
      }
    }

    // Calculate progress to next tier
    let nextTier = null;
    let progressToNext = 0;
    if (vipStatus?.tier) {
      const currentTierIndex = tiers.findIndex((t) => t.id === vipStatus.tier.id);
      if (currentTierIndex < tiers.length - 1) {
        nextTier = tiers[currentTierIndex + 1];
        const currentMin = vipStatus.tier.minPoints;
        const nextMin = nextTier.minPoints;
        const userPoints = user?.points || 0;
        progressToNext = Math.min(100, Math.round(((userPoints - currentMin) / (nextMin - currentMin)) * 100));
      }
    }

    return NextResponse.json({
      success: true,
      currentTier: vipStatus?.tier || null,
      vipStatus,
      allTiers: tiers,
      nextTier,
      progressToNext,
      currentPoints: user?.points || 0,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching VIP info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
